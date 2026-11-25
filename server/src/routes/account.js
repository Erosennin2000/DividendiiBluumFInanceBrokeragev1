// Opening an account: the Bluum investor, partner-managed KYC and the
// disclosures.
//
// On documents, the default is forward-only: the file is held in memory just
// long enough to pass it to Bluum, then dropped. Only a record that it
// happened is kept. Switching KYC_STORAGE=store writes the file to disk and
// should not be used until there is encrypted storage and someone named as
// responsible for the data.

import { Router } from 'express'
import multer from 'multer'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { investors, kyc, compliance, disclosures } from '../bluum/api.js'
import { users, kycDocuments } from '../db/index.js'
import { config, activeMarkets } from '../config.js'
import { route, badRequest, conflict } from '../errors.js'
import { requireUser, requireInvestor, ok, logAction } from '../middleware.js'
import { publicUser } from './auth.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.kyc.maxFileBytes, files: 4 },
})

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']

// ---------------------------------------------------------------------------
// Open the Bluum investor
// ---------------------------------------------------------------------------
router.post(
  '/investor',
  requireUser,
  route(async (req, res) => {
    if (req.user.investor_id) throw conflict('This account has already been opened.')

    const { first_name, last_name, date_of_birth, country, phone, address } = req.body || {}
    if (!first_name || !last_name) throw badRequest('Please give your first and last name.')
    if (!country) throw badRequest('Please choose your country of residence.')

    const investor = await investors.create({
      email: req.user.email,
      first_name,
      last_name,
      date_of_birth: date_of_birth || undefined,
      country: String(country).toLowerCase(),
      phone: phone || undefined,
      address: address || undefined,
      // Our own reference, so a Bluum record can be traced back to a user.
      metadata: { dividendii_user_id: req.user.id },
    })

    const updated = await users.update(req.user.id, {
      investor_id: investor.id,
      investor_status: investor.status,
      name: req.user.name || `${first_name} ${last_name}`,
      phone: phone || req.user.phone,
      country: String(country).toLowerCase(),
    })
    logAction(req, 'investor.created', investor.id)
    ok(res, { user: publicUser(updated), investor })
  }),
)

// Current state of the account, with what is still outstanding.
router.get(
  '/status',
  requireUser,
  route(async (req, res) => {
    if (!req.user.investor_id) {
      return ok(res, { stage: 'not_started', user: publicUser(req.user), markets: activeMarkets() })
    }
    const investor = await investors.get(req.user.investor_id)
    if (investor.status !== req.user.investor_status) {
      await users.update(req.user.id, { investor_status: investor.status })
    }
    const [outstanding, docs] = await Promise.all([
      disclosures.outstanding(req.user.investor_id).catch(() => ({ data: [] })),
      kycDocuments.listForUser(req.user.id),
    ])
    ok(res, {
      stage: investor.status,
      investor,
      outstanding_disclosures: outstanding.data || [],
      documents_submitted: docs.length,
      markets: activeMarkets(),
    })
  }),
)

// ---------------------------------------------------------------------------
// Disclosures. The text is shown exactly as Bluum sends it.
// ---------------------------------------------------------------------------
router.get(
  '/disclosures',
  route(async (req, res) => {
    // Public, so the agreements can be read before signing up.
    const result = await disclosures.list(req.query?.step ? { step: req.query.step } : undefined)
    ok(res, result.data || [])
  }),
)

router.get(
  '/disclosures/outstanding',
  requireInvestor,
  route(async (req, res) => {
    const result = await disclosures.outstanding(req.user.investor_id, req.query?.step)
    ok(res, result.data || [])
  }),
)

router.post(
  '/disclosures/accept',
  requireInvestor,
  route(async (req, res) => {
    const items = Array.isArray(req.body?.acceptances) ? req.body.acceptances : []
    if (!items.length) throw badRequest('Nothing to accept.')

    // The time of the real click and the customer's address, not this
    // server's clock or address.
    const ip =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || null
    const acceptances = items.map((a) => ({
      disclosure_id: a.disclosure_id,
      version: a.version,
      accepted_at: a.accepted_at || new Date().toISOString(),
      ip_address: ip,
      user_agent: req.headers['user-agent'] || undefined,
    }))

    const result = await disclosures.accept(req.user.investor_id, { acceptances })
    logAction(req, 'disclosures.accepted', acceptances.map((a) => a.disclosure_id).join(','))
    ok(res, result.data || result)
  }),
)

// ---------------------------------------------------------------------------
// Partner-managed KYC
// ---------------------------------------------------------------------------
router.get(
  '/kyc/requirements',
  requireInvestor,
  route(async (req, res) => {
    const result = await kyc.documentRequirements(req.user.investor_id)
    ok(res, result.data || result)
  }),
)

router.post(
  '/kyc/submit',
  requireInvestor,
  upload.fields([
    { name: 'government_id', maxCount: 1 },
    { name: 'proof_of_address', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  route(async (req, res) => {
    const files = Object.values(req.files || {}).flat()
    if (!files.length) throw badRequest('Please attach at least one document.')
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.mimetype)) {
        throw badRequest(`${f.originalname} is a ${f.mimetype} file. Please send a JPG, PNG or PDF.`)
      }
    }

    const form = new FormData()
    for (const [field, value] of Object.entries(req.body || {})) {
      if (value !== undefined && value !== null) form.append(field, String(value))
    }
    for (const f of files) {
      form.append(f.fieldname, new Blob([f.buffer], { type: f.mimetype }), f.originalname)
    }

    const submission = await kyc.submitCip(req.user.investor_id, form)

    // Keep a record of each file, and the file itself only if configured to.
    for (const f of files) {
      let storedPath = null
      if (config.kyc.storage === 'store') {
        await mkdir(config.kyc.dir, { recursive: true })
        storedPath = join(config.kyc.dir, `${req.user.id}-${f.fieldname}-${Date.now()}${extname(f.originalname)}`)
        await writeFile(storedPath, f.buffer)
      }
      await kycDocuments.record({
        userId: req.user.id,
        kind: f.fieldname,
        originalName: f.originalname,
        byteSize: f.size,
        mimeType: f.mimetype,
        sha256: createHash('sha256').update(f.buffer).digest('hex'),
        storedPath,
        bluumDocId: submission?.id || null,
      })
      // Drop the bytes.
      f.buffer = null
    }

    const investor = await investors.get(req.user.investor_id)
    await users.update(req.user.id, { investor_status: investor.status })
    logAction(req, 'kyc.submitted', `${files.length} documents, storage=${config.kyc.storage}`)
    ok(res, { submission, investor, storage: config.kyc.storage })
  }),
)

router.get(
  '/kyc/documents',
  requireUser,
  route(async (req, res) => {
    const rows = await kycDocuments.listForUser(req.user.id)
    // Never the file, only the record that it was handled.
    ok(
      res,
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        original_name: r.original_name,
        byte_size: r.byte_size,
        forwarded_at: r.forwarded_at,
        kept_on_disk: Boolean(r.stored_path),
        created_at: r.created_at,
      })),
    )
  }),
)

router.get(
  '/compliance',
  requireInvestor,
  route(async (req, res) => ok(res, await compliance.get(req.user.investor_id))),
)

router.post(
  '/compliance/restart',
  requireInvestor,
  route(async (req, res) => {
    const result = await compliance.restart(req.user.investor_id, req.body || {})
    logAction(req, 'compliance.restarted')
    ok(res, result)
  }),
)

export default router
