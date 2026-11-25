// IPOs, rights issues and public bond offers.
//
// How this differs from trading:
//   - the cash is held in the wallet's reserved balance, not spent, until
//     units are allotted
//   - the application endpoint takes no Idempotency-Key, so the guard against
//     a double tap is ours
//   - eligible_countries is information, not a rule Bluum enforces, so the
//     check is ours too

import { Router } from 'express'
import { offerings, wallets } from '../bluum/api.js'
import { route, badRequest, conflict } from '../errors.js'
import { requireInvestor, idempotent, ok, logAction } from '../middleware.js'

const router = Router()

const APPLYABLE = ['OPEN']

router.get(
  '/',
  route(async (req, res) => {
    const result = await offerings.list({
      status: req.query?.status,
      country: req.query?.country,
      limit: req.query?.limit || 50,
    })
    const items = result.data || []
    // Group so the screen can show what is open now, what is coming and what
    // is finished, without re-reading the status rules.
    ok(res, items, {
      open: items.filter((o) => o.status === 'OPEN').length,
      upcoming: items.filter((o) => o.status === 'ANNOUNCED').length,
      closed: items.filter((o) => !['OPEN', 'ANNOUNCED'].includes(o.status)).length,
    })
  }),
)

router.get(
  '/:id',
  route(async (req, res) => {
    const offering = await offerings.get(req.params.id)
    ok(res, offering, {
      can_apply: APPLYABLE.includes(offering.status),
      // Our own eligibility note. Bluum does not refuse on this.
      eligible_countries: offering.eligible_countries || null,
    })
  }),
)

// What an application would cost and whether there is cash for it. There is
// no Bluum estimate endpoint for offerings, so this is worked out here from
// the offering's own terms.
router.post(
  '/:id/quote',
  requireInvestor,
  route(async (req, res) => {
    const offering = await offerings.get(req.params.id)
    const units = Number(req.body?.units)
    if (!(units > 0)) throw badRequest('Enter how many units you want.')

    const min = Number(offering.min_units || 0)
    const step = Number(offering.unit_increment || 1)
    if (min && units < min) throw badRequest(`The smallest application is ${min} units.`)
    if (step && units % step !== 0) throw badRequest(`Units must be a multiple of ${step}.`)

    const amount = units * Number(offering.price_per_unit)
    const wallet = ((await wallets.list(req.user.investor_id)).data || []).find(
      (w) => w.currency === offering.currency,
    )
    const available = Number(wallet?.available_balance || 0)

    ok(res, {
      offering_id: offering.id,
      units: String(units),
      price_per_unit: offering.price_per_unit,
      amount: amount.toFixed(2),
      currency: offering.currency,
      wallet_available: available.toFixed(2),
      enough_cash: available >= amount,
      shortfall: available >= amount ? '0.00' : (amount - available).toFixed(2),
      note: 'This amount is held in your wallet until units are allotted. It is not spent on application.',
    })
  }),
)

router.post(
  '/:id/apply',
  requireInvestor,
  idempotent('offerings.apply'),
  route(async (req, res) => {
    const offering = await offerings.get(req.params.id)
    if (!APPLYABLE.includes(offering.status)) {
      throw conflict(
        offering.status === 'ANNOUNCED'
          ? 'This offer has not opened yet.'
          : 'This offer is closed for applications.',
      )
    }

    const units = Number(req.body?.units)
    if (!(units > 0)) throw badRequest('Enter how many units you want.')
    const min = Number(offering.min_units || 0)
    const step = Number(offering.unit_increment || 1)
    if (min && units < min) throw badRequest(`The smallest application is ${min} units.`)
    if (step && units % step !== 0) throw badRequest(`Units must be a multiple of ${step}.`)

    // Our own eligibility check, because the API does not make one.
    const eligible = offering.eligible_countries
    if (Array.isArray(eligible) && eligible.length && req.user.country) {
      if (!eligible.map((c) => c.toLowerCase()).includes(String(req.user.country).toLowerCase())) {
        throw badRequest('This offer is not open to residents of your country.')
      }
    }

    // Bluum's own docs disagree on whether a second application to the same
    // offering is allowed, so until they answer, one is the limit.
    const existing = (await offerings.subscriptions(req.user.investor_id)).data || []
    const already = existing.find((s) => s.offering_id === offering.id && ['APPLIED', 'PARTIALLY_ALLOTTED', 'FULLY_ALLOTTED'].includes(s.status))
    if (already && !req.body?.allow_multiple) {
      throw conflict('You have already applied for this offer. Withdraw that application first to change it.')
    }

    const subscription = await offerings.apply(req.user.investor_id, {
      offering_id: offering.id,
      units: String(units),
    })
    logAction(req, 'offering.applied', `${subscription.id} ${offering.id} ${units} units`)
    ok(res, subscription)
  }),
)

router.get(
  '/me/subscriptions',
  requireInvestor,
  route(async (req, res) => {
    const result = await offerings.subscriptions(req.user.investor_id)
    ok(res, result.data || [])
  }),
)

router.post(
  '/subscriptions/:id/withdraw',
  requireInvestor,
  route(async (req, res) => {
    const result = await offerings.withdrawApplication(req.user.investor_id, req.params.id)
    logAction(req, 'offering.application_withdrawn', req.params.id)
    ok(res, result)
  }),
)

export default router
