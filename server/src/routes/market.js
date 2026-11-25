// What there is to buy, and at what price.
//
// Market data may be a paid add-on on the tenant. When it is not switched on
// Bluum answers 403 BLUM-403-004, which reaches the browser as a 503 with a
// plain sentence rather than an empty screen.

import { Router } from 'express'
import { assets, markets, news } from '../bluum/api.js'
import { route, badRequest } from '../errors.js'
import { ok } from '../middleware.js'
import { activeMarkets, MARKETS, config } from '../config.js'

const router = Router()

const BOND_CLASSES = ['bond', 'bill', 'note']
const countryToMarket = (country) =>
  Object.values(MARKETS).find((m) => m.code.toLowerCase() === String(country).toLowerCase())

// The markets Dividendii has switched on, with their hours.
router.get('/markets', (_req, res) => ok(res, activeMarkets()))

router.get(
  '/markets/:code/status',
  route(async (req, res) => ok(res, await markets.status(req.params.code))),
)

// Shares and ETFs only. Bonds have their own route so the two never mix in
// one list, because their prices mean different things.
router.get(
  '/assets',
  route(async (req, res) => {
    const { country, class: assetClass, q, limit } = req.query || {}
    if (country && !config.markets.includes(String(country).toUpperCase())) {
      throw badRequest('That market is not switched on.')
    }
    const query = {
      country: country ? String(country).toLowerCase() : undefined,
      class: assetClass || 'equity,etf',
      limit: limit || 50,
    }
    const result = q ? await assets.search({ ...query, q }) : await assets.list(query)
    const items = (result.data || []).filter((a) => !BOND_CLASSES.includes(a.class))
    ok(res, items, { markets: activeMarkets().map((m) => ({ code: m.code, name: m.name, currency: m.currency })) })
  }),
)

router.get(
  '/assets/:symbol',
  route(async (req, res) => {
    const symbol = req.params.symbol
    const [asset, quote] = await Promise.all([
      assets.get(symbol),
      assets.quote(symbol).catch(() => null), // a missing price must not hide the asset
    ])
    const market = countryToMarket(asset.country)
    ok(res, {
      asset,
      quote,
      market: market
        ? {
            name: market.name,
            hours: market.hours,
            hours_confirmed: market.hoursConfirmed,
            extended_hours: market.extendedHours,
            currency: market.currency,
          }
        : null,
      // What the order ticket is allowed to offer for this asset.
      trading: {
        can_buy_by_amount: Boolean(asset.fractionable),
        order_types: BOND_CLASSES.includes(asset.class) ? ['limit'] : ['market', 'limit'],
        min_order_size: asset.min_order_size || null,
      },
    })
  }),
)

router.get(
  '/assets/:symbol/bars',
  route(async (req, res) => {
    const result = await assets.bars(req.params.symbol, { limit: req.query?.limit || 30, timeframe: req.query?.timeframe || '1D' })
    ok(res, result.data || [])
  }),
)

router.get(
  '/quotes',
  route(async (req, res) => {
    const symbols = String(req.query?.symbols || '').trim()
    if (!symbols) throw badRequest('Give one or more symbols.')
    const result = await assets.quotes(symbols)
    ok(res, result.data || [])
  }),
)

router.get(
  '/news',
  route(async (req, res) => {
    // Bluum lists news endpoints but they are not described in the
    // documentation, so a failure here is not treated as an error.
    try {
      const result = await news.list({ symbol: req.query?.symbol, limit: req.query?.limit || 10 })
      ok(res, result.data || [])
    } catch {
      ok(res, [], { unavailable: true })
    }
  }),
)

export default router
