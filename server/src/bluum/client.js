// The one place that talks to Bluum over HTTP.
//
// Rules it enforces, all from the Bluum docs:
//   - the API key stays on this server and is never returned to a caller
//   - prefixed ids (inv_, ord_, wlt_ ...) in paths; raw UUIDs are rejected
//   - Idempotency-Key on deposits and withdrawals
//   - 429 and 5xx are retried with backoff; 4xx are not
//   - every error becomes a BluumError with a sentence a customer can read
//
// In mock mode nothing leaves the server: the request is answered by
// src/bluum/mock.js instead, so the platform runs before keys arrive.

import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { BluumError } from '../errors.js'
import { mockRequest } from './mock.js'

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3

// Bluum's own id prefixes. A raw UUID in a path is rejected by Bluum with a
// 400, so it is caught here instead, where the message is clearer.
const ID_PREFIXES = [
  'inv', 'wlt', 'fs', 'dep', 'wd', 'ord', 'pos', 'off', 'sub', 'doc', 'wh',
  'cw', 'apk', 'cse', 'cmp', 'cma', 'cmpos', 'swp', 'cmw', 'cmsb', 'cmsbl', 'ptf',
]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertPrefixedId(value, expectedPrefix) {
  if (!value) throw new BluumError({ status: 400, code: 'missing_id', message: `A ${expectedPrefix}_ id is required.` })
  if (UUID_RE.test(value)) {
    throw new BluumError({
      status: 400,
      code: 'raw_uuid',
      message: `Bluum needs the prefixed id (${expectedPrefix}_...), not a bare UUID.`,
    })
  }
  const prefix = String(value).split('_')[0]
  if (!ID_PREFIXES.includes(prefix)) {
    throw new BluumError({ status: 400, code: 'bad_id', message: `"${value}" is not a Bluum id.` })
  }
  if (expectedPrefix && prefix !== expectedPrefix) {
    throw new BluumError({
      status: 400,
      code: 'wrong_id_type',
      message: `Expected a ${expectedPrefix}_ id but got a ${prefix}_ id.`,
    })
  }
  return value
}

const basicAuth = () =>
  'Basic ' + Buffer.from(`${config.bluum.apiKey}:${config.bluum.apiSecret}`).toString('base64')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function buildUrl(path, query) {
  const url = new URL(config.bluum.baseUrl + path)
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)))
    else url.searchParams.set(k, String(v))
  }
  return url.toString()
}

/**
 * One call to Bluum.
 *
 * @param {object} opts
 * @param {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} opts.method
 * @param {string} opts.path              path after /v1, e.g. '/investors'
 * @param {object} [opts.query]
 * @param {object} [opts.body]            JSON body
 * @param {FormData} [opts.formData]      multipart body (KYC documents)
 * @param {string} [opts.idempotencyKey]  for deposits and withdrawals
 * @param {string} [opts.investorToken]   use the investor's own token instead
 *                                        of the partner key
 * @param {boolean} [opts.noAuth]         public endpoints (GET /disclosures)
 */
export async function bluumRequest({
  method,
  path,
  query,
  body,
  formData,
  idempotencyKey,
  investorToken,
  noAuth = false,
  label,
}) {
  if (config.bluum.mode === 'mock') {
    return mockRequest({ method, path, query, body, formData })
  }

  const url = buildUrl(path, query)
  const headers = { Accept: 'application/json' }
  if (!noAuth) headers.Authorization = investorToken ? `Bearer ${investorToken}` : basicAuth()
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json'

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.bluum.timeoutMs)
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
        signal: controller.signal,
      })
      clearTimeout(timer)

      const text = await res.text()
      const payload = text ? safeJson(text) : null
      const ms = Date.now() - started
      console.log(`[bluum] ${method} ${path} -> ${res.status} ${ms}ms${label ? ` (${label})` : ''}`)

      if (res.ok) return payload

      const err = toBluumError(res, payload)
      // A retry is only safe when Bluum says so, and a write without an
      // idempotency key is never retried.
      const safeToRetry = RETRY_STATUSES.has(res.status) && (method === 'GET' || idempotencyKey)
      if (safeToRetry && attempt < MAX_ATTEMPTS) {
        lastError = err
        await sleep(backoffMs(attempt, res.headers.get('retry-after')))
        continue
      }
      throw err
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof BluumError) throw error
      // Network level: timeout, DNS, reset.
      lastError = new BluumError({
        status: 503,
        code: error.name === 'AbortError' ? 'timeout' : 'network',
        message: 'Dividendii could not reach Bluum. Please try again shortly.',
        raw: String(error),
      })
      lastError.retryable = true
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt))
        continue
      }
      throw lastError
    }
  }
  throw lastError
}

function backoffMs(attempt, retryAfter) {
  if (retryAfter && Number(retryAfter)) return Math.min(Number(retryAfter) * 1000, 10000)
  return Math.min(500 * 2 ** (attempt - 1), 4000) + Math.floor(Math.random() * 200)
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function toBluumError(res, payload) {
  const e = payload?.error || payload || {}
  return new BluumError({
    status: res.status,
    code: e.code || e.type,
    message: e.message || e.detail,
    requestId: res.headers.get('x-request-id') || e.request_id,
    raw: payload,
  })
}

// A key for one deposit or withdrawal attempt. Reused only when retrying the
// same attempt, never for a new one.
export const newIdempotencyKey = () => randomUUID()

export const bluumMode = () => config.bluum.mode
