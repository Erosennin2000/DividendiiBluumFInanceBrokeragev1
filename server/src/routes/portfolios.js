// Portfolios: curated baskets of shares with their own unit price, bought by
// amount rather than by share. Bluum calls these PTFs.
//
// This is what the earlier demo called "mutual funds". The difference worth
// keeping in the wording: a portfolio here is a basket Dividendii or the
// customer assembles, not a fund managed by a fund house.

import { Router } from 'express'
import { portfolios } from '../bluum/api.js'
import { route, badRequest } from '../errors.js'
import { requireInvestor, idempotent, ok, logAction } from '../middleware.js'

const router = Router()

router.get(
  '/',
  route(async (req, res) => {
    const result = await portfolios.list({ status: req.query?.status || 'published' })
    ok(res, result.data || [])
  }),
)

router.get(
  '/:id',
  route(async (req, res) => {
    const [ptf, price] = await Promise.all([
      portfolios.get(req.params.id),
      portfolios.price(req.params.id).catch(() => null),
    ])
    ok(res, { portfolio: ptf, price })
  }),
)

router.get(
  '/:id/history',
  route(async (req, res) => {
    const result = await portfolios.history(req.params.id, { period: req.query?.period || '1M' })
    ok(res, result.data || [])
  }),
)

router.post(
  '/estimate',
  requireInvestor,
  route(async (req, res) => {
    if (!req.body?.ptf_id) throw badRequest('Choose a portfolio.')
    if (!(Number(req.body?.amount) > 0)) throw badRequest('Enter how much you want to invest.')
    ok(res, await portfolios.estimateOrder(req.user.investor_id, req.body))
  }),
)

router.post(
  '/orders',
  requireInvestor,
  idempotent('portfolios.order'),
  route(async (req, res) => {
    const { ptf_id, amount, side = 'buy', units } = req.body || {}
    if (!ptf_id) throw badRequest('Choose a portfolio.')
    if (side === 'buy' && !(Number(amount) > 0)) throw badRequest('Enter how much you want to invest.')
    if (side === 'sell' && !(Number(units) > 0)) throw badRequest('Enter how many units to sell.')

    const order = await portfolios.placeOrder(req.user.investor_id, {
      ptf_id,
      side,
      amount: amount ? String(amount) : undefined,
      units: units ? String(units) : undefined,
    })
    logAction(req, 'portfolio_order.placed', `${order.id} ${side} ${ptf_id}`)
    ok(res, order)
  }),
)

router.get(
  '/me/holdings',
  requireInvestor,
  route(async (req, res) => ok(res, (await portfolios.holdings(req.user.investor_id)).data || [])),
)

router.get(
  '/me/orders',
  requireInvestor,
  route(async (req, res) => ok(res, (await portfolios.listOrders(req.user.investor_id)).data || [])),
)

export default router
