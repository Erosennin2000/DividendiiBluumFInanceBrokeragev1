// Gifting shares.
//
// Bluum has no gifting endpoint, so the gift itself lives in Dividendii's own
// database and is carried out as an ordinary order in the recipient's
// account. By decision, the recipient must already hold a Dividendii account,
// which removes the need to hold a gift for someone who never signs up.
//
// One step is not yet possible: moving the sender's cash to the recipient's
// wallet. Bluum's documentation has no investor-to-investor transfer, and
// funding another investor's wallet is not described. Until Bluum answers,
// a gift reaches the status 'awaiting_funding' and stops there, with the
// delivery code ready behind it. See docs/WHATS_MISSING.md.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { assets, orders, wallets } from '../bluum/api.js'
import { users, gifts, orderTags } from '../db/index.js'
import { sendGiftNotice } from '../mail.js'
import { route, badRequest, notFound, conflict } from '../errors.js'
import { requireInvestor, idempotent, ok, logAction } from '../middleware.js'

const router = Router()

// A gift must be able to buy a part of a share, or small gifts are impossible.
async function giftableAsset(symbol) {
  if (!symbol) throw badRequest('Choose what to give.')
  const asset = await assets.get(symbol)
  if (['bond', 'bill', 'note'].includes(asset.class)) throw badRequest('Bonds cannot be given as a gift.')
  if (!asset.fractionable) {
    throw badRequest(`${asset.symbol} cannot be bought in fractions, so it cannot be given by amount.`)
  }
  return asset
}

async function recipientOrThrow(email) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) throw badRequest("Enter the recipient's email address.")
  const recipient = await users.findByEmail(clean)
  if (!recipient || !recipient.investor_id) {
    throw badRequest('That person does not have a Dividendii account yet. Ask them to open one first.')
  }
  if (recipient.investor_status && recipient.investor_status !== 'active') {
    throw badRequest('That account is not active yet, so it cannot receive shares.')
  }
  return recipient
}

router.post(
  '/quote',
  requireInvestor,
  route(async (req, res) => {
    const asset = await giftableAsset(req.body?.symbol)
    const amount = Number(req.body?.amount)
    if (!(amount > 0)) throw badRequest('Enter how much you want to give.')

    // Priced as the market buy it will become.
    const estimate = await orders.estimate(req.user.investor_id, {
      symbol: asset.symbol,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      notional: String(amount),
    })
    const wallet = ((await wallets.list(req.user.investor_id)).data || []).find((w) => w.currency === asset.currency)
    const available = Number(wallet?.available_balance || 0)

    ok(res, estimate, {
      currency: asset.currency,
      wallet_available: available.toFixed(2),
      enough_cash: available >= Number(estimate.estimated_total),
      fee_warning:
        Number(estimate.total_fees) > amount * 0.05
          ? 'The fees are more than 5% of this gift. A larger amount costs proportionally less.'
          : null,
    })
  }),
)

router.post(
  '/',
  requireInvestor,
  idempotent('gifts.create'),
  route(async (req, res) => {
    const asset = await giftableAsset(req.body?.symbol)
    const amount = Number(req.body?.amount)
    if (!(amount > 0)) throw badRequest('Enter how much you want to give.')
    const recipient = await recipientOrThrow(req.body?.to_email)
    if (recipient.id === req.user.id) throw badRequest('You cannot send a gift to yourself.')

    const message = String(req.body?.message || '').slice(0, 280) || null

    const gift = await gifts.create({
      fromUserId: req.user.id,
      toEmail: recipient.email,
      toUserId: recipient.id,
      symbol: asset.symbol,
      amount: amount.toFixed(2),
      currency: asset.currency,
      message,
    })

    // The cash step. Until Bluum confirms how one investor's money reaches
    // another's wallet, the gift waits here rather than taking money with no
    // way to deliver it.
    await gifts.update(gift.id, { status: 'awaiting_funding' })

    logAction(req, 'gift.created', `${gift.id} ${asset.symbol} ${asset.currency} ${amount} to ${recipient.email}`)
    ok(
      res,
      { ...gift, status: 'awaiting_funding' },
      {
        next_step:
          'Dividendii is waiting on one answer from Bluum before gifts can be paid for: how one investor funds ' +
          'another. The gift is saved and the recipient has not been charged or notified of a completed gift.',
      },
    )
  }),
)

router.get(
  '/sent',
  requireInvestor,
  route(async (req, res) => ok(res, await gifts.listSent(req.user.id))),
)

router.get(
  '/received',
  requireInvestor,
  route(async (req, res) => ok(res, await gifts.listReceived(req.user.email))),
)

router.post(
  '/:id/cancel',
  requireInvestor,
  route(async (req, res) => {
    const gift = await gifts.findById(req.params.id)
    if (!gift || gift.from_user_id !== req.user.id) throw notFound('No such gift.')
    if (['delivered', 'placed'].includes(gift.status)) throw conflict('That gift has already been sent.')
    const updated = await gifts.update(gift.id, { status: 'cancelled' })
    logAction(req, 'gift.cancelled', gift.id)
    ok(res, updated)
  }),
)

/**
 * Delivery.
 *
 * This is the step that needs Bluum's answer. It is written out so that when
 * the answer arrives only the funding line changes:
 *
 *   1. the recipient's wallet holds the gift amount   <- the missing piece
 *   2. place a market notional buy in the recipient's investor account
 *   3. tag the order as a gift and email the recipient
 *
 * It refuses to run while the recipient has no cash, rather than placing an
 * order that would fail at Bluum.
 */
router.post(
  '/:id/deliver',
  requireInvestor,
  idempotent('gifts.deliver'),
  route(async (req, res) => {
    const gift = await gifts.findById(req.params.id)
    if (!gift) throw notFound('No such gift.')
    if (gift.from_user_id !== req.user.id && !req.user.is_staff) throw notFound('No such gift.')
    if (gift.status === 'delivered') return ok(res, gift)
    if (gift.status === 'cancelled') throw conflict('That gift was cancelled.')

    const recipient = await users.findById(gift.to_user_id)
    if (!recipient?.investor_id) throw badRequest('The recipient no longer has an open account.')

    const wallet = ((await wallets.list(recipient.investor_id)).data || []).find((w) => w.currency === gift.currency)
    if (Number(wallet?.available_balance || 0) < Number(gift.amount)) {
      throw conflict(
        `The gift cannot be bought yet: the recipient's ${gift.currency} wallet does not hold the amount. ` +
          'Funding one investor from another is the open question with Bluum.',
      )
    }

    const clientOrderId = `dvdgift_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const order = await orders.place(recipient.investor_id, {
      symbol: gift.symbol,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      notional: String(gift.amount),
      client_order_id: clientOrderId,
    })
    await orderTags.tag({ clientOrderId, userId: recipient.id, purpose: 'gift', giftId: gift.id })
    const updated = await gifts.update(gift.id, {
      status: 'placed',
      client_order_id: clientOrderId,
      bluum_order_id: order.id,
    })

    const sender = await users.findById(gift.from_user_id)
    await sendGiftNotice({
      to: recipient.email,
      fromName: sender?.name || 'Someone',
      symbol: gift.symbol,
      amount: gift.amount,
      currency: gift.currency,
      message: gift.message,
    })

    logAction(req, 'gift.delivered', `${gift.id} order ${order.id}`)
    ok(res, { ...updated, order })
  }),
)

export default router
