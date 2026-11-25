// Shortcuts that only exist off production: approve an account, mark a
// deposit as received, force a fill, reset the sample data.
//
// These are the sandbox tools a real build needs in order to walk a flow end
// to end without waiting on a bank or a market. Every one of them is refused
// when BLUUM_ENV=production.

import { Router } from 'express'
import { kyc, deposits, orders } from '../bluum/api.js'
import { resetMock } from '../bluum/mock.js'
import { users } from '../db/index.js'
import { config } from '../config.js'
import { route, forbidden } from '../errors.js'
import { requireUser, requireInvestor, ok, logAction } from '../middleware.js'

const router = Router()

router.use((_req, _res, next) => {
  if (config.bluum.env === 'production') return next(forbidden('Not available in production.'))
  next()
})

// Approve the signed-in account, as a real identity check would.
router.post(
  '/approve-me',
  requireInvestor,
  route(async (req, res) => {
    const investor = await kyc.simulateCip(req.user.investor_id, { outcome: 'approved' })
    await users.update(req.user.id, { investor_status: investor.status })
    logAction(req, 'dev.approved_investor', req.user.investor_id)
    ok(res, investor)
  }),
)

// Mark every pending deposit as received, so there is cash to trade with.
router.post(
  '/fund-me',
  requireInvestor,
  route(async (req, res) => {
    const pending = ((await deposits.list(req.user.investor_id)).data || []).filter((d) => d.status === 'pending')
    const done = []
    for (const d of pending) done.push(await deposits.simulate(req.user.investor_id, d.id, { outcome: 'completed' }))
    ok(res, done, { count: done.length })
  }),
)

// Fill an open order and settle holdings, so a sell can be tested the same
// day. In Bluum's own sandbox this works for Nigerian and Kenyan orders.
router.post(
  '/fill/:orderId',
  requireInvestor,
  route(async (req, res) => ok(res, await orders.simulate(req.user.investor_id, req.params.orderId, {}))),
)

// Start the sample data again. Only meaningful in mock mode.
router.post(
  '/reset',
  requireUser,
  route(async (req, res) => {
    if (config.bluum.mode !== 'mock') throw forbidden('Only the sample data can be reset.')
    resetMock()
    await users.update(req.user.id, { investor_id: null, investor_status: null })
    logAction(req, 'dev.reset_sample_data')
    ok(res, { reset: true })
  }),
)

export default router
