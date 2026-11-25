// Webhook signature check.
//
// Bluum sends X-Bluum-Signature: the HMAC-SHA256 of the raw request body, in
// hex, keyed with the webhook secret. The check must run on the raw bytes,
// before any JSON parsing, or a re-serialised body will not match.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

export function verifyWebhookSignature(rawBody, header) {
  const secret = config.bluum.webhookSecret
  if (!secret) return { ok: false, reason: 'BLUUM_WEBHOOK_SECRET is not set' }
  if (!header) return { ok: false, reason: 'no X-Bluum-Signature header' }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  // Some senders prefix the scheme, e.g. "sha256=...". Accept both.
  const given = String(header).replace(/^sha256=/i, '').trim()

  if (given.length !== expected.length) return { ok: false, reason: 'signature length mismatch' }
  const ok = timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))
  return ok ? { ok: true } : { ok: false, reason: 'signature does not match' }
}
