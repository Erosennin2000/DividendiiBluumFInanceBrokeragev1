// Sign in with a one-time code sent by email. No SMS, by decision, and no
// password to lose. A code is six digits, lasts ten minutes, can be used once
// and allows five attempts.

import { Router } from 'express'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { users, loginCodes } from '../db/index.js'
import { sendLoginCode } from '../mail.js'
import { route, badRequest, unauthorized } from '../errors.js'
import { issueSession, clearSession, requireUser, rateLimit, ok, logAction } from '../middleware.js'
import { config } from '../config.js'

const router = Router()

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

const hashCode = (email, code) => createHash('sha256').update(`${email}:${code}:${config.sessionSecret}`).digest('hex')
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim())

// Ask for a code.
router.post(
  '/request-code',
  rateLimit({ max: 8, windowMs: 10 * 60_000 }),
  route(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!validEmail(email)) throw badRequest('Please enter a valid email address.')

    let user = await users.findByEmail(email)
    if (!user) {
      user = await users.create({
        email,
        name: req.body?.name?.trim() || null,
        country: req.body?.country || null,
      })
    } else if (req.body?.name && !user.name) {
      user = await users.update(user.id, { name: req.body.name.trim() })
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await loginCodes.create({
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    })
    const delivery = await sendLoginCode(email, code)

    logAction(req, 'auth.code_requested', email)
    // The same answer whether or not the address is already known, so the
    // endpoint cannot be used to discover who has an account.
    ok(res, {
      sent: true,
      email,
      expires_in_seconds: CODE_TTL_MS / 1000,
      // Only in console mode, so a developer can sign in without a mailbox.
      dev_code: delivery.mode === 'console' ? code : undefined,
    })
  }),
)

// Exchange the code for a session.
router.post(
  '/verify',
  rateLimit({ max: 15, windowMs: 10 * 60_000 }),
  route(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const code = String(req.body?.code || '').trim()
    if (!validEmail(email) || !/^\d{6}$/.test(code)) throw badRequest('Enter the six-digit code from your email.')

    const row = await loginCodes.findLatest(email)
    if (!row) throw unauthorized('That code has expired. Please ask for a new one.')
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await loginCodes.remove(row.id)
      throw unauthorized('That code has expired. Please ask for a new one.')
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await loginCodes.remove(row.id)
      throw unauthorized('Too many wrong attempts. Please ask for a new code.')
    }

    const given = Buffer.from(hashCode(email, code), 'utf8')
    const want = Buffer.from(row.code_hash, 'utf8')
    const matches = given.length === want.length && timingSafeEqual(given, want)
    if (!matches) {
      await loginCodes.bumpAttempts(row.id)
      throw unauthorized('That code is not right.')
    }

    await loginCodes.remove(row.id)
    const user = await users.findByEmail(email)
    await users.update(user.id, { last_login_at: new Date() })
    issueSession(res, user)
    logAction(req, 'auth.signed_in', email)
    ok(res, publicUser(user))
  }),
)

router.post('/signout', (req, res) => {
  clearSession(res)
  logAction(req, 'auth.signed_out')
  ok(res, { signed_out: true })
})

router.get('/me', requireUser, (req, res) => ok(res, publicUser(req.user)))

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    country: user.country,
    // The browser needs to know whether an investor exists and its status,
    // but never any Bluum credential.
    has_investor: Boolean(user.investor_id),
    investor_id: user.investor_id || null,
    investor_status: user.investor_status || null,
    is_staff: Boolean(user.is_staff),
  }
}

export default router
