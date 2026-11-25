// One place for errors. Every Bluum error code we know about is turned into a
// sentence a customer can act on, and a flag saying whether retrying helps.
//
// Source: Bluum Finance Error Code Reference.

export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const badRequest = (msg, extra) => new AppError(400, 'bad_request', msg, extra)
export const unauthorized = (msg = 'Please sign in again.') => new AppError(401, 'unauthorized', msg)
export const forbidden = (msg = 'Not allowed.') => new AppError(403, 'forbidden', msg)
export const notFound = (msg = 'Not found.') => new AppError(404, 'not_found', msg)
export const conflict = (msg) => new AppError(409, 'conflict', msg)

// Bluum code -> { message for the customer, retry }
//
// Anything not listed falls back to the status table below, which is
// deliberately vague: Bluum's own wording is written for developers, not for
// a customer looking at a screen. Add a code here as soon as it is seen in
// the sandbox, so the customer gets a sentence they can act on.
const BLUUM_MESSAGES = {
  // Money
  'BLUM-400-010': { message: 'There is not enough cash in that wallet.', retry: false },
  'BLUM-400-011': { message: 'That is below the smallest amount allowed.', retry: false },
  // Orders
  'BLUM-400-004': { message: 'Enter how many units you want.', retry: false },
  'BLUM-400-016': { message: 'A sale needs a quantity.', retry: false },
  'BLUM-400-017': { message: 'Those shares have not settled yet, so they cannot be sold today.', retry: false },
  'BLUM-400-018': { message: 'An amount can only be used for a market buy.', retry: false },
  'BLUM-400-019': { message: 'That asset cannot be bought in fractions, so enter a quantity.', retry: false },
  // Bonds
  'BLUM-400-021': { message: 'Bond orders must be limit orders.', retry: false },
  'BLUM-400-022': { message: 'Bonds are bought by face value, not by amount.', retry: false },
  'BLUM-400-023': { message: 'Bond orders last for the day only.', retry: false },
  'BLUM-400-024': { message: 'That face value is not a multiple the bond allows.', retry: false },
  // Offerings
  'BLUM-400-030': { message: 'That is below the smallest application for this offer.', retry: false },
  'BLUM-400-031': { message: 'The number of units is not a multiple this offer allows.', retry: false },
  // Permissions and state
  'BLUM-403-002': { message: 'This account cannot trade until it is active.', retry: false },
  'BLUM-403-004': { message: 'This feature is not switched on for Dividendii yet.', retry: false, internal: true },
  'BLUM-401-001': { message: 'Dividendii could not reach Bluum. Please try again shortly.', retry: false, internal: true },
  'BLUM-409-001': { message: 'That request was already received.', retry: false },
  'BLUM-409-002': { message: 'That order has already been filled.', retry: false },
  'BLUM-409-003': { message: 'That offer is not open for applications.', retry: false },
  'BLUM-409-004': { message: 'That application can no longer be withdrawn.', retry: false },
  // Not found
  'BLUM-404-001': { message: 'We could not find that account.', retry: false },
  'BLUM-404-003': { message: 'We could not find that asset.', retry: false },
  'BLUM-404-005': { message: 'We could not find that deposit.', retry: false },
  'BLUM-404-006': { message: 'We could not find that order.', retry: false },
  'BLUM-404-007': { message: 'We could not find that holding.', retry: false },
  'BLUM-404-008': { message: 'We could not find that offer.', retry: false },
  'BLUM-404-009': { message: 'We could not find that application.', retry: false },
  'BLUM-404-010': { message: 'We could not find that portfolio.', retry: false },
}

// Problems this server spots itself, before or instead of calling Bluum. The
// message is already written for a customer, so it is used as given.
const LOCAL_CODES = new Set([
  'raw_uuid',
  'bad_id',
  'missing_id',
  'wrong_id_type',
  'timeout',
  'network',
  'mock_not_implemented',
])

// Fall back on the HTTP status when the code is one we have not mapped.
const BY_STATUS = {
  400: { message: 'Something in that request was not right. Please check and try again.', retry: false },
  401: { message: 'Dividendii could not reach Bluum. Please try again shortly.', retry: false, internal: true },
  403: { message: 'That is not available on this account.', retry: false },
  404: { message: 'We could not find that.', retry: false },
  409: { message: 'That cannot be done right now. The market may be closed.', retry: false },
  422: { message: 'Some details were rejected. Please check them and try again.', retry: false },
  429: { message: 'Too many requests. Please wait a moment and try again.', retry: true },
  500: { message: 'Bluum had a problem. Please try again shortly.', retry: true },
  502: { message: 'Bluum had a problem. Please try again shortly.', retry: true },
  503: { message: 'Bluum is briefly unavailable. Please try again shortly.', retry: true },
  504: { message: 'Bluum took too long to answer. Please try again shortly.', retry: true },
}

export class BluumError extends Error {
  constructor({ status, code, message, requestId, raw }) {
    const mapped = BLUUM_MESSAGES[code]
    const known = mapped || BY_STATUS[status] || {}
    // A mapped code wins, then our own message for a problem we spotted
    // ourselves, then the status fallback. Bluum's raw wording is never shown.
    const forCustomer =
      mapped?.message || (LOCAL_CODES.has(code) && message) || known.message || 'Something went wrong.'
    super(forCustomer)
    this.name = 'BluumError'
    this.status = status
    this.code = code || `http_${status}`
    this.bluumMessage = message
    this.requestId = requestId
    this.retryable = Boolean(known.retry)
    // internal = the customer did nothing wrong; Dividendii has setup to do.
    this.internal = Boolean(known.internal)
    this.raw = raw
  }
}

export const isRetryable = (err) =>
  err instanceof BluumError ? err.retryable : ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(err?.code)

// Express error handler. Keeps Bluum's wording out of the browser.
export function errorHandler(err, req, res, _next) {
  const id = req.id || '-'
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } })
  }
  if (err instanceof BluumError) {
    console.error(`[${id}] bluum ${err.status} ${err.code} ${err.bluumMessage || ''} req=${err.requestId || '-'}`)
    const status = err.internal ? 503 : err.status
    return res.status(status).json({ error: { code: err.code, message: err.message, retryable: err.retryable } })
  }
  console.error(`[${id}]`, err)
  return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side.' } })
}

// Wraps an async route so a rejected promise reaches the handler above.
export const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
