// Buying and selling shares and ETFs, and the holdings that result.
//
// Rules enforced here, all from the Bluum documentation:
//   - an estimate is always available before an order, so fees are seen first
//   - an amount (notional) is a market buy on a fractionable asset only
//   - a sell needs a quantity and can only use the settled position
//   - every order carries our own client_order_id, so it can be matched to
//     the customer when a webhook arrives

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { orders, positions, assets, investors } from '../bluum/api.js'
import { bluumMode } from '../bluum/client.js'
import { orderTags } from '../db/index.js'
import { route, badRequest, forbidden } from '../errors.js'
import { requireInvestor, idempotent, ok, logAction } from '../middleware.js'

const router = Router()

const BOND_CLASSES = ['bond', 'bill', 'note']
const SIDES = ['buy', 'sell']
const TYPES = ['market', 'limit']

// Shapes an order body from what the screen sent, and refuses the
// combinations Bluum would refuse, with a clearer message.
async function buildOrderBody(body) {
  const { symbol, side, type = 'market', quantity, notional, limit_price, time_in_force = 'day', extended_hours } = body || {}

  if (!symbol) throw badRequest('Choose what to trade.')
  if (!SIDES.includes(side)) throw badRequest('Choose buy or sell.')
  if (!TYPES.includes(type)) throw badRequest('Choose a market or limit order.')

  const asset = await assets.get(symbol)
  if (BOND_CLASSES.includes(asset.class)) {
    throw badRequest('Bonds are traded on the bonds screen, where the price is a percentage of face value.')
  }
  if (asset.tradable === false) throw forbidden(`${asset.symbol} cannot be traded at the moment.`)

  const out = { symbol: asset.symbol, side, type, time_in_force }

  if (notional !== undefined && notional !== null && notional !== '') {
    if (side !== 'buy' || type !== 'market') throw badRequest('An amount can only be used for a market buy.')
    if (!asset.fractionable) throw badRequest(`${asset.symbol} cannot be bought in fractions, so enter a quantity.`)
    if (!(Number(notional) > 0)) throw badRequest('Enter an amount greater than zero.')
    out.notional = String(notional)
  } else {
    if (!(Number(quantity) > 0)) throw badRequest('Enter how many units.')
    out.quantity = String(quantity)
  }

  if (type === 'limit') {
    if (!(Number(limit_price) > 0)) throw badRequest('Enter the price you want.')
    out.limit_price = String(limit_price)
  }
  if (extended_hours) out.extended_hours = true

  return { out, asset }
}

router.post(
  '/estimate',
  requireInvestor,
  route(async (req, res) => {
    const { out, asset } = await buildOrderBody(req.body)
    const estimate = await orders.estimate(req.user.investor_id, out)
    ok(res, estimate, { currency: asset.currency, symbol: asset.symbol })
  }),
)

router.post(
  '/orders',
  requireInvestor,
  idempotent('orders.place'),
  route(async (req, res) => {
    if (req.user.investor_status && req.user.investor_status !== 'active') {
      throw forbidden('Your account is not active for trading yet.')
    }
    const { out, asset } = await buildOrderBody(req.body)

    // Our own reference on the order, so a fill can be traced back here.
    const clientOrderId = `dvd_${randomUUID().replace(/-/g, '').slice(0, 20)}`
    out.client_order_id = clientOrderId

    const order = await orders.place(req.user.investor_id, out)
    await orderTags.tag({ clientOrderId, userId: req.user.id, purpose: req.body?.purpose || 'self' })
    logAction(req, 'order.placed', `${order.id} ${out.side} ${asset.symbol}`)
    ok(res, order)
  }),
)

router.get(
  '/orders',
  requireInvestor,
  route(async (req, res) => {
    const result = await orders.list(req.user.investor_id, {
      status: req.query?.status,
      limit: req.query?.limit || 50,
    })
    ok(res, result.data || [])
  }),
)

router.get(
  '/orders/:id',
  requireInvestor,
  route(async (req, res) => ok(res, await orders.get(req.user.investor_id, req.params.id))),
)

router.post(
  '/orders/:id/cancel',
  requireInvestor,
  route(async (req, res) => {
    const result = await orders.cancel(req.user.investor_id, req.params.id)
    logAction(req, 'order.cancelled', req.params.id)
    ok(res, result)
  }),
)

// Sandbox only, and only for Nigerian and Kenyan orders in Bluum's sandbox.
router.post(
  '/orders/:id/simulate',
  requireInvestor,
  route(async (req, res) => {
    if (process.env.BLUUM_ENV === 'production') throw badRequest('Simulating a fill is only possible in the sandbox.')
    ok(res, await orders.simulate(req.user.investor_id, req.params.id, req.body || {}), { mode: bluumMode() })
  }),
)

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------
router.get(
  '/positions',
  requireInvestor,
  route(async (req, res) => {
    const result = await positions.list(req.user.investor_id, {
      non_zero_only: true,
      refresh_prices: req.query?.refresh_prices !== 'false',
    })
    const items = result.data || []
    // Totals by currency: holdings can be in USD, NGN and KES at once, and
    // adding them up would be meaningless.
    const byCurrency = {}
    for (const p of items) {
      const c = (byCurrency[p.currency] ||= { currency: p.currency, market_value: 0, cost_basis: 0, unrealized_pl: 0 })
      c.market_value += Number(p.market_value || 0)
      c.cost_basis += Number(p.total_cost_basis || 0)
      c.unrealized_pl += Number(p.unrealized_pl || 0)
    }
    ok(res, items, { totals: Object.values(byCurrency) })
  }),
)

router.get(
  '/portfolio-chart',
  requireInvestor,
  route(async (req, res) => {
    const result = await investors.portfolioChart(req.user.investor_id, { period: req.query?.period || '1M' })
    ok(res, result.data || [])
  }),
)

// Sells the whole holding at market. Not available for bonds, which must be
// limit orders.
router.post(
  '/positions/:id/close',
  requireInvestor,
  idempotent('positions.close'),
  route(async (req, res) => {
    const position = await positions.get(req.user.investor_id, req.params.id)
    if (BOND_CLASSES.includes(position.class)) {
      throw badRequest('A bond holding is sold with a limit order on the bonds screen.')
    }
    const result = await positions.close(req.user.investor_id, req.params.id)
    logAction(req, 'position.closed', req.params.id)
    ok(res, result)
  }),
)

export default router
