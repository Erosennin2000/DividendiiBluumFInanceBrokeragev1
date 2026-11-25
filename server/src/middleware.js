// Session handling, the duplicate-request guard and small helpers.

import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { users, idempotency, audit } from './db/index.js'
import { AppError, unauthorized, forbidden } from './errors.js'

const COOKIE = 'dvd_session'
const SESSION_HOURS = 12

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, config.sessionSecret, {
    expiresIn: `${SESSION_HOURS}h`,
  })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/',
  })
  return token
}

export const clearSession = (res) => res.clearCookie(COOKIE, { path: '/' })

// Reads the session cookie, or an Authorization: Bearer header, so the same
// API serves a browser and a host app's web view.
export async function attachUser(req, _res, next) {
  req.id = randomUUID().slice(0, 8)
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const token = req.cookies?.[COOKIE] || bearer
  if (token) {
    try {
      const claims = jwt.verify(token, config.sessionSecret)
      req.user = await users.findById(claims.sub)
    } catch {
      // An expired or bad token simply means no user.
    }
  }
  next()
}

export const requireUser = (req, _res, next) => (req.user ? next() : next(unauthorized()))

// Most endpoints need a Bluum investor, which only exists once onboarding has
// started.
export const requireInvestor = (req, _res, next) => {
  if (!req.user) return next(unauthorized())
  if (!req.user.investor_id) {
    return next(new AppError(409, 'no_investor', 'Finish opening your account first.', { step: 'onboarding' }))
  }
  next()
}

export const requireStaff = (req, _res, next) =>
  req.user?.is_staff ? next() : next(forbidden('Staff only.'))

/**
 * The duplicate-request guard.
 *
 * Bluum takes an Idempotency-Key on deposits and withdrawals, but offering
 * applications have none, so this holds the line for every write: the same
 * key returns the first answer instead of doing the work twice.
 */
export function idempotent(endpointName) {
  return async (req, res, next) => {
    const key = req.header('Idempotency-Key')
    if (!key) return next()
    try {
      const existing = await idempotency.find(key)
      if (existing) {
        res.setHeader('Idempotent-Replay', 'true')
        return res.status(existing.status_code || 200).json(existing.response)
      }
      // Capture the response so a repeat gets the same answer.
      const json = res.json.bind(res)
      res.json = (payload) => {
        if (res.statusCode < 400) {
          idempotency
            .save({ key, userId: req.user?.id, endpoint: endpointName, response: payload, statusCode: res.statusCode })
            .catch((e) => console.error('idempotency save failed', e))
        }
        return json(payload)
      }
      req.idempotencyKey = key
      next()
    } catch (e) {
      next(e)
    }
  }
}

// A very small limiter, enough to blunt code-guessing on the sign-in route.
export function rateLimit({ windowMs = 60_000, max = 20, key = (req) => req.ip } = {}) {
  const hits = new Map()
  return (req, _res, next) => {
    const k = key(req)
    const now = Date.now()
    const entry = hits.get(k)
    if (!entry || entry.resetAt < now) {
      hits.set(k, { count: 1, resetAt: now + windowMs })
      return next()
    }
    entry.count += 1
    if (entry.count > max) {
      return next(new AppError(429, 'too_many_requests', 'Too many attempts. Please wait a minute and try again.'))
    }
    next()
  }
}

export const logAction = (req, action, detail) =>
  audit.write({ userId: req.user?.id || null, action, detail, ip: req.ip }).catch(() => {})

// The one shape every successful response takes.
export const ok = (res, data, meta) => res.json(meta ? { data, meta } : { data })
