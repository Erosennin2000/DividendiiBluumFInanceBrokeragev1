// The database, with two backings behind one small API.
//
//   DATABASE_URL set    -> Postgres (src/db/schema.sql)
//   DATABASE_URL blank  -> an in-memory store, so the platform runs before a
//                          database exists. Data is lost when the server stops.
//
// Routes only ever call the functions at the bottom of this file, so swapping
// the backing changes nothing above it.

import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

const now = () => new Date()
const id = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------
let pool = null
export const usingPostgres = () => Boolean(pool)

async function initPostgres() {
  const { default: pg } = await import('pg')
  pool = new pg.Pool({
    connectionString: config.db.url,
    ssl: /sslmode=require/.test(config.db.url) ? { rejectUnauthorized: false } : undefined,
    max: 10,
  })
  await pool.query('SELECT 1')
}

const q = async (text, params = []) => (await pool.query(text, params)).rows

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------
const mem = {
  users: new Map(),
  loginCodes: new Map(),
  kycDocuments: [],
  gifts: new Map(),
  webhookEvents: new Map(),
  orderTags: new Map(),
  idempotency: new Map(),
  audit: [],
}

export async function connect() {
  if (config.db.url) {
    await initPostgres()
    return { kind: 'postgres' }
  }
  return { kind: 'memory' }
}

export async function close() {
  if (pool) await pool.end()
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = {
  async findByEmail(email) {
    const key = String(email).toLowerCase()
    if (pool) return (await q('SELECT * FROM users WHERE email = $1', [key]))[0] || null
    return [...mem.users.values()].find((u) => u.email === key) || null
  },

  async findById(userId) {
    if (pool) return (await q('SELECT * FROM users WHERE id = $1', [userId]))[0] || null
    return mem.users.get(userId) || null
  },

  async findByInvestorId(investorId) {
    if (pool) return (await q('SELECT * FROM users WHERE investor_id = $1', [investorId]))[0] || null
    return [...mem.users.values()].find((u) => u.investor_id === investorId) || null
  },

  async create({ email, name = null, phone = null, country = null }) {
    const row = {
      id: id('usr'),
      email: String(email).toLowerCase(),
      name,
      phone,
      country,
      investor_id: null,
      investor_status: null,
      is_staff: false,
      created_at: now(),
      last_login_at: null,
    }
    if (pool) {
      const inserted = await q(
        `INSERT INTO users (id, email, name, phone, country)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [row.id, row.email, name, phone, country],
      )
      return inserted[0]
    }
    mem.users.set(row.id, row)
    return row
  },

  async update(userId, patch) {
    if (pool) {
      const allowed = ['name', 'phone', 'country', 'investor_id', 'investor_status', 'last_login_at']
      const keys = Object.keys(patch).filter((k) => allowed.includes(k))
      if (!keys.length) return this.findById(userId)
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
      const rows = await q(`UPDATE users SET ${sets} WHERE id = $1 RETURNING *`, [
        userId,
        ...keys.map((k) => patch[k]),
      ])
      return rows[0] || null
    }
    const row = mem.users.get(userId)
    if (!row) return null
    Object.assign(row, patch)
    return row
  },
}

// ---------------------------------------------------------------------------
// Login codes
// ---------------------------------------------------------------------------
export const loginCodes = {
  async create({ email, codeHash, expiresAt }) {
    const row = {
      id: id('lc'),
      email: String(email).toLowerCase(),
      code_hash: codeHash,
      attempts: 0,
      expires_at: expiresAt,
      created_at: now(),
    }
    if (pool) {
      await q('DELETE FROM login_codes WHERE email = $1', [row.email])
      const rows = await q(
        `INSERT INTO login_codes (id, email, code_hash, expires_at)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [row.id, row.email, codeHash, expiresAt],
      )
      return rows[0]
    }
    for (const [k, v] of mem.loginCodes) if (v.email === row.email) mem.loginCodes.delete(k)
    mem.loginCodes.set(row.id, row)
    return row
  },

  async findLatest(email) {
    const key = String(email).toLowerCase()
    if (pool) {
      return (
        (await q('SELECT * FROM login_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [key]))[0] || null
      )
    }
    return [...mem.loginCodes.values()].filter((r) => r.email === key).sort((a, b) => b.created_at - a.created_at)[0] || null
  },

  async bumpAttempts(codeId) {
    if (pool) {
      const rows = await q('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING *', [codeId])
      return rows[0] || null
    }
    const row = mem.loginCodes.get(codeId)
    if (row) row.attempts += 1
    return row || null
  },

  async remove(codeId) {
    if (pool) return void (await q('DELETE FROM login_codes WHERE id = $1', [codeId]))
    mem.loginCodes.delete(codeId)
  },
}

// ---------------------------------------------------------------------------
// KYC document records
// ---------------------------------------------------------------------------
export const kycDocuments = {
  async record({ userId, kind, originalName, byteSize, mimeType, sha256, storedPath = null, bluumDocId = null }) {
    const row = {
      id: id('doc'),
      user_id: userId,
      kind,
      original_name: originalName,
      byte_size: byteSize,
      mime_type: mimeType,
      sha256,
      stored_path: storedPath,
      forwarded_at: bluumDocId ? now() : null,
      bluum_doc_id: bluumDocId,
      created_at: now(),
    }
    if (pool) {
      const rows = await q(
        `INSERT INTO kyc_documents
           (id, user_id, kind, original_name, byte_size, mime_type, sha256, stored_path, forwarded_at, bluum_doc_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [row.id, userId, kind, originalName, byteSize, mimeType, sha256, storedPath, row.forwarded_at, bluumDocId],
      )
      return rows[0]
    }
    mem.kycDocuments.push(row)
    return row
  },

  async listForUser(userId) {
    if (pool) return q('SELECT * FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    return mem.kycDocuments.filter((d) => d.user_id === userId)
  },
}

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------
export const gifts = {
  async create({ fromUserId, toEmail, toUserId = null, symbol, amount, currency, message = null }) {
    const row = {
      id: id('gft'),
      from_user_id: fromUserId,
      to_email: String(toEmail).toLowerCase(),
      to_user_id: toUserId,
      symbol,
      amount,
      currency,
      message,
      status: 'draft',
      client_order_id: null,
      bluum_order_id: null,
      created_at: now(),
      updated_at: now(),
    }
    if (pool) {
      const rows = await q(
        `INSERT INTO gifts (id, from_user_id, to_email, to_user_id, symbol, amount, currency, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [row.id, fromUserId, row.to_email, toUserId, symbol, amount, currency, message],
      )
      return rows[0]
    }
    mem.gifts.set(row.id, row)
    return row
  },

  async findById(giftId) {
    if (pool) return (await q('SELECT * FROM gifts WHERE id = $1', [giftId]))[0] || null
    return mem.gifts.get(giftId) || null
  },

  async update(giftId, patch) {
    if (pool) {
      const allowed = ['status', 'client_order_id', 'bluum_order_id', 'to_user_id']
      const keys = Object.keys(patch).filter((k) => allowed.includes(k))
      if (!keys.length) return this.findById(giftId)
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
      const rows = await q(`UPDATE gifts SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [
        giftId,
        ...keys.map((k) => patch[k]),
      ])
      return rows[0] || null
    }
    const row = mem.gifts.get(giftId)
    if (!row) return null
    Object.assign(row, patch, { updated_at: now() })
    return row
  },

  async listSent(userId) {
    if (pool) return q('SELECT * FROM gifts WHERE from_user_id = $1 ORDER BY created_at DESC', [userId])
    return [...mem.gifts.values()].filter((g) => g.from_user_id === userId).sort((a, b) => b.created_at - a.created_at)
  },

  async listReceived(email) {
    const key = String(email).toLowerCase()
    if (pool) return q('SELECT * FROM gifts WHERE to_email = $1 ORDER BY created_at DESC', [key])
    return [...mem.gifts.values()].filter((g) => g.to_email === key).sort((a, b) => b.created_at - a.created_at)
  },
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------
export const webhookEvents = {
  // Returns null when the event has already been stored, which is how
  // repeated deliveries are ignored.
  async store({ eventId, eventType, signatureOk, payload }) {
    const row = {
      id: id('whe'),
      event_id: eventId || null,
      event_type: eventType,
      signature_ok: signatureOk,
      payload,
      received_at: now(),
      processed_at: null,
      error: null,
    }
    if (pool) {
      const rows = await q(
        `INSERT INTO webhook_events (id, event_id, event_type, signature_ok, payload)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING *`,
        [row.id, row.event_id, eventType, signatureOk, JSON.stringify(payload)],
      )
      return rows[0] || null
    }
    if (row.event_id && [...mem.webhookEvents.values()].some((e) => e.event_id === row.event_id)) return null
    mem.webhookEvents.set(row.id, row)
    return row
  },

  async markProcessed(rowId, error = null) {
    if (pool) {
      await q('UPDATE webhook_events SET processed_at = now(), error = $2 WHERE id = $1', [rowId, error])
      return
    }
    const row = mem.webhookEvents.get(rowId)
    if (row) {
      row.processed_at = now()
      row.error = error
    }
  },

  async recent(limit = 50) {
    if (pool) return q('SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT $1', [limit])
    return [...mem.webhookEvents.values()].sort((a, b) => b.received_at - a.received_at).slice(0, limit)
  },
}

// ---------------------------------------------------------------------------
// Order tags
// ---------------------------------------------------------------------------
export const orderTags = {
  async tag({ clientOrderId, userId, purpose = 'self', giftId = null }) {
    const row = { client_order_id: clientOrderId, user_id: userId, purpose, gift_id: giftId, created_at: now() }
    if (pool) {
      await q(
        `INSERT INTO order_tags (client_order_id, user_id, purpose, gift_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (client_order_id) DO NOTHING`,
        [clientOrderId, userId, purpose, giftId],
      )
      return row
    }
    mem.orderTags.set(clientOrderId, row)
    return row
  },

  async find(clientOrderId) {
    if (pool) return (await q('SELECT * FROM order_tags WHERE client_order_id = $1', [clientOrderId]))[0] || null
    return mem.orderTags.get(clientOrderId) || null
  },
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------
export const idempotency = {
  async find(key) {
    if (pool) return (await q('SELECT * FROM idempotency_keys WHERE key = $1', [key]))[0] || null
    return mem.idempotency.get(key) || null
  },

  async save({ key, userId, endpoint, response, statusCode }) {
    if (pool) {
      await q(
        `INSERT INTO idempotency_keys (key, user_id, endpoint, response, status_code)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO NOTHING`,
        [key, userId, endpoint, JSON.stringify(response), statusCode],
      )
      return
    }
    mem.idempotency.set(key, { key, user_id: userId, endpoint, response, status_code: statusCode, created_at: now() })
  },
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export const audit = {
  async write({ userId = null, action, detail = null, ip = null }) {
    if (pool) {
      await q('INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1,$2,$3,$4)', [userId, action, detail, ip])
      return
    }
    mem.audit.push({ user_id: userId, action, detail, ip, at: now() })
  },

  async recent(limit = 100) {
    if (pool) return q('SELECT * FROM audit_log ORDER BY at DESC LIMIT $1', [limit])
    return mem.audit.slice(-limit).reverse()
  },
}

export const newId = id
