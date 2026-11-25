// Wallets, bank details, deposits and withdrawals.
//
// Bluum creates a USD, an NGN and a KES wallet for every investor. Deposits
// and withdrawals need an Idempotency-Key, which this server generates per
// attempt so a customer tapping twice cannot pay twice.

import { Router } from 'express'
import { wallets, fundingSources, deposits, withdrawals, investors } from '../bluum/api.js'
import { newIdempotencyKey, bluumMode } from '../bluum/client.js'
import { route, badRequest } from '../errors.js'
import { requireInvestor, idempotent, ok, logAction } from '../middleware.js'
import { MARKETS } from '../config.js'

const router = Router()

const CURRENCIES = ['USD', 'NGN', 'KES']
const METHODS = ['ach', 'manual_bank_transfer', 'wire', 'international_wire', 'card']

router.get(
  '/wallets',
  requireInvestor,
  route(async (req, res) => {
    const result = await wallets.list(req.user.investor_id)
    const items = result.data || []
    ok(res, items, {
      // Which market each currency buys, so the UI can explain it.
      currencies: items.map((w) => ({
        currency: w.currency,
        market: Object.values(MARKETS).find((m) => m.currency === w.currency)?.name || null,
      })),
    })
  }),
)

router.get(
  '/transactions',
  requireInvestor,
  route(async (req, res) => {
    const result = await investors.transactions(req.user.investor_id, {
      type: req.query?.type,
      limit: req.query?.limit || 50,
    })
    ok(res, result.data || [])
  }),
)

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------
router.get(
  '/funding-sources',
  requireInvestor,
  route(async (req, res) => ok(res, (await fundingSources.list(req.user.investor_id)).data || [])),
)

router.get(
  '/banks',
  route(async (req, res) => ok(res, (await fundingSources.banks({ country: req.query?.country })).data || [])),
)

router.post(
  '/funding-sources',
  requireInvestor,
  route(async (req, res) => {
    const { currency } = req.body || {}
    if (currency && !CURRENCIES.includes(currency)) throw badRequest('That currency is not supported.')
    const created = await fundingSources.connect(req.user.investor_id, req.body || {})
    logAction(req, 'funding_source.connected', created.id)
    ok(res, created)
  }),
)

router.delete(
  '/funding-sources/:id',
  requireInvestor,
  route(async (req, res) => {
    await fundingSources.remove(req.user.investor_id, req.params.id)
    logAction(req, 'funding_source.removed', req.params.id)
    ok(res, { removed: true })
  }),
)

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------
router.get(
  '/deposits',
  requireInvestor,
  route(async (req, res) => ok(res, (await deposits.list(req.user.investor_id)).data || [])),
)

router.post(
  '/deposits',
  requireInvestor,
  idempotent('deposits.create'),
  route(async (req, res) => {
    const { amount, currency, method, funding_source_id } = req.body || {}
    if (!(Number(amount) > 0)) throw badRequest('Enter how much you want to add.')
    if (!CURRENCIES.includes(currency)) throw badRequest('Choose a currency.')
    if (!METHODS.includes(method)) throw badRequest('Choose how you want to pay.')
    if (method === 'ach' && !funding_source_id) throw badRequest('Choose the bank account to debit.')

    const deposit = await deposits.create(
      req.user.investor_id,
      {
        amount: String(amount),
        currency,
        method,
        funding_source_id: funding_source_id || undefined,
      },
      // One key per attempt. Reusing it is only right when retrying the same
      // attempt, which the guard above handles.
      req.idempotencyKey || newIdempotencyKey(),
    )
    logAction(req, 'deposit.created', `${deposit.id} ${currency} ${amount} by ${method}`)
    ok(res, deposit)
  }),
)

router.get(
  '/deposits/:id',
  requireInvestor,
  route(async (req, res) => ok(res, await deposits.get(req.user.investor_id, req.params.id))),
)

// The PDF of bank details for a manual transfer.
router.get(
  '/deposits/:id/wire-details',
  requireInvestor,
  route(async (req, res) => ok(res, await deposits.wireDetails(req.user.investor_id, req.params.id))),
)

router.post(
  '/deposits/:id/cancel',
  requireInvestor,
  route(async (req, res) => {
    const result = await deposits.cancel(req.user.investor_id, req.params.id)
    logAction(req, 'deposit.cancelled', req.params.id)
    ok(res, result)
  }),
)

// Sandbox only: mark a pending deposit as received, so the rest of the flow
// can be tested without moving real money.
router.post(
  '/deposits/:id/simulate',
  requireInvestor,
  route(async (req, res) => {
    if (bluumMode() === 'live' && process.env.BLUUM_ENV === 'production') {
      throw badRequest('Simulating a deposit is only possible in the sandbox.')
    }
    ok(res, await deposits.simulate(req.user.investor_id, req.params.id, req.body || {}))
  }),
)

// ---------------------------------------------------------------------------
// Withdrawals. Always quote first so the fee is seen before confirming.
// ---------------------------------------------------------------------------
router.post(
  '/withdrawals/quote',
  requireInvestor,
  route(async (req, res) => {
    const { amount, currency } = req.body || {}
    if (!(Number(amount) > 0)) throw badRequest('Enter how much you want to withdraw.')
    if (!CURRENCIES.includes(currency)) throw badRequest('Choose a currency.')
    ok(res, await withdrawals.quote(req.user.investor_id, req.body))
  }),
)

router.post(
  '/withdrawals',
  requireInvestor,
  idempotent('withdrawals.create'),
  route(async (req, res) => {
    const { amount, currency, funding_source_id } = req.body || {}
    if (!(Number(amount) > 0)) throw badRequest('Enter how much you want to withdraw.')
    if (!CURRENCIES.includes(currency)) throw badRequest('Choose a currency.')
    if (!funding_source_id) throw badRequest('Choose where the money should go.')

    const wd = await withdrawals.create(
      req.user.investor_id,
      { amount: String(amount), currency, funding_source_id },
      req.idempotencyKey || newIdempotencyKey(),
    )
    logAction(req, 'withdrawal.created', `${wd.id} ${currency} ${amount}`)
    ok(res, wd)
  }),
)

router.get(
  '/withdrawals',
  requireInvestor,
  route(async (req, res) => ok(res, (await withdrawals.list(req.user.investor_id)).data || [])),
)

export default router
