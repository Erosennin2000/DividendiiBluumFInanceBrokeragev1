// Every Bluum endpoint this platform uses, one function each, grouped the way
// the Bluum documentation groups them. Nothing here holds state or decides
// policy: that belongs in the routes.
//
// Paths are taken from the Bluum endpoint list. They are relative to /v1.

import { bluumRequest as call, assertPrefixedId } from './client.js'

const inv = (id) => assertPrefixedId(id, 'inv')

// ---------------------------------------------------------------------------
// OAuth: the 15-minute token bound to one investor
// ---------------------------------------------------------------------------
export const oauth = {
  // Exchange the partner key for a token that can act only for this investor.
  // No refresh token exists: ask for a new one when it expires.
  tokenExchange: (investorId) =>
    call({
      method: 'POST',
      path: '/oauth/token',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: inv(investorId),
        subject_token_type: 'urn:bluum:params:oauth:token-type:investor-id',
      },
      label: 'token exchange',
    }),

  revoke: (token) => call({ method: 'POST', path: '/oauth/revoke', body: { token } }),
}

// ---------------------------------------------------------------------------
// Investors
// ---------------------------------------------------------------------------
export const investors = {
  create: (payload) => call({ method: 'POST', path: '/investors', body: payload }),
  get: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}` }),
  list: (query) => call({ method: 'GET', path: '/investors', query }),
  eligibility: (payload) => call({ method: 'POST', path: '/investors/eligibility', body: payload }),
  close: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/close`, body }),
  updatePhone: (investorId, body) => call({ method: 'PUT', path: `/investors/${inv(investorId)}/phone`, body }),
  setTrustedContact: (investorId, body) =>
    call({ method: 'PUT', path: `/investors/${inv(investorId)}/trusted-contact`, body }),
  portfolioChart: (investorId, query) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/portfolio-chart`, query }),
  transactions: (investorId, query) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/transactions`, query }),
  requestDeletion: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/deletion-request`, body }),
}

// ---------------------------------------------------------------------------
// KYC. Two modes exist and Dividendii uses partner-managed (CIP).
// ---------------------------------------------------------------------------
export const kyc = {
  documentRequirements: (investorId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/document-requirements` }),

  // Partner-managed identity check. formData carries the document files.
  submitCip: (investorId, formData) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/cip`, formData, label: 'cip' }),

  // Sandbox only: pretend the check passed or failed.
  simulateCip: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/cip/simulate`, body }),

  listDocuments: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/documents` }),
  uploadDocument: (investorId, formData) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/documents`, formData }),
}

export const compliance = {
  get: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/compliance` }),
  workflow: (investorId, workflowId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/compliance/workflows/${workflowId}` }),
  submit: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/compliance/submit`, body }),
  restart: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/compliance/restart`, body }),
}

// ---------------------------------------------------------------------------
// Disclosures. The text must be shown exactly as Bluum returns it.
// ---------------------------------------------------------------------------
export const disclosures = {
  // Public: no authentication, so it can be shown before sign-up.
  list: (query) => call({ method: 'GET', path: '/disclosures', query, noAuth: true }),
  get: (disclosureId) => call({ method: 'GET', path: `/disclosures/${disclosureId}`, noAuth: true }),

  // step filters to a product, e.g. step_fixed_income_enrollment.
  outstanding: (investorId, step) =>
    call({
      method: 'GET',
      path: `/investors/${inv(investorId)}/disclosures/outstanding`,
      query: step ? { step } : undefined,
    }),

  acceptances: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/disclosures/acceptances` }),

  // The real click time and IP address must be recorded.
  accept: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/disclosures/acceptances`, body }),
}

// ---------------------------------------------------------------------------
// Money in and out
// ---------------------------------------------------------------------------
export const wallets = {
  list: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/wallets` }),
}

export const fundingSources = {
  list: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/funding-sources` }),
  connect: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/funding-sources/connect`, body }),
  update: (investorId, fsId, body) =>
    call({
      method: 'PATCH',
      path: `/investors/${inv(investorId)}/funding-sources/${assertPrefixedId(fsId, 'fs')}`,
      body,
    }),
  remove: (investorId, fsId) =>
    call({
      method: 'DELETE',
      path: `/investors/${inv(investorId)}/funding-sources/${assertPrefixedId(fsId, 'fs')}`,
    }),
  plaidLinkToken: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/funding-sources/plaid/link-token`, body }),
  banks: (query) => call({ method: 'GET', path: '/banks', query }),
}

export const deposits = {
  // Needs an Idempotency-Key. Pass the same key only when retrying the same
  // attempt.
  create: (investorId, body, idempotencyKey) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/deposits`, body, idempotencyKey }),
  list: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/deposits`, query }),
  get: (investorId, depositId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/deposits/${assertPrefixedId(depositId, 'dep')}` }),
  // The PDF of bank details for a manual transfer.
  wireDetails: (investorId, depositId) =>
    call({
      method: 'GET',
      path: `/investors/${inv(investorId)}/deposits/${assertPrefixedId(depositId, 'dep')}/wire-details`,
    }),
  cancel: (investorId, depositId) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/deposits/${assertPrefixedId(depositId, 'dep')}/cancel`,
    }),
  // Sandbox only: mark the deposit as received.
  simulate: (investorId, depositId, body) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/deposits/${assertPrefixedId(depositId, 'dep')}/simulate`,
      body,
    }),
}

export const withdrawals = {
  // Always quote first so the customer sees the fee before confirming.
  quote: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/withdrawals/quote`, body }),
  create: (investorId, body, idempotencyKey) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/withdrawals`, body, idempotencyKey }),
  list: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/withdrawals`, query }),
  get: (investorId, withdrawalId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/withdrawals/${assertPrefixedId(withdrawalId, 'wd')}` }),
  cancel: (investorId, withdrawalId) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/withdrawals/${assertPrefixedId(withdrawalId, 'wd')}/cancel`,
    }),
}

// ---------------------------------------------------------------------------
// Assets and prices. Asset ids are raw UUIDs; the path uses the symbol.
// ---------------------------------------------------------------------------
export const assets = {
  list: (query) => call({ method: 'GET', path: '/assets', query }),
  search: (query) => call({ method: 'GET', path: '/assets/search', query }),
  // No price fields, so it is the cheapest search for a picker.
  searchUniverse: (query) => call({ method: 'GET', path: '/assets/universe/search', query }),
  batch: (symbols) => call({ method: 'GET', path: '/assets/batch', query: { symbols } }),
  get: (symbol, query) => call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}`, query }),
  quote: (symbol) => call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}/quote` }),
  quotes: (symbols) => call({ method: 'GET', path: '/assets/quotes', query: { symbols } }),
  snapshot: (symbol) => call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}/snapshot` }),
  bars: (symbol, query) => call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}/bars`, query }),
  quoteHistory: (symbol, query) =>
    call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}/quotes/history`, query }),
  orderbook: (symbol) => call({ method: 'GET', path: `/assets/${encodeURIComponent(symbol)}/orderbook` }),
}

export const markets = {
  list: () => call({ method: 'GET', path: '/markets' }),
  get: (code) => call({ method: 'GET', path: `/markets/${code}` }),
  status: (code) => call({ method: 'GET', path: `/markets/${code}/status` }),
  calendar: (code, query) => call({ method: 'GET', path: `/markets/${code}/calendar`, query }),
  sessions: (code, query) => call({ method: 'GET', path: `/markets/${code}/sessions`, query }),
  halts: (code) => call({ method: 'GET', path: `/markets/${code}/halts` }),
}

export const news = {
  list: (query) => call({ method: 'GET', path: '/news', query }),
  get: (newsId) => call({ method: 'GET', path: `/news/${newsId}` }),
}

// ---------------------------------------------------------------------------
// Orders and positions. Shares and bonds use the same endpoints with
// different rules; see src/routes/trade.js and src/routes/bonds.js.
// ---------------------------------------------------------------------------
export const orders = {
  estimate: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/orders/estimate`, body }),
  place: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/orders`, body }),
  list: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/orders`, query }),
  get: (investorId, orderId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/orders/${assertPrefixedId(orderId, 'ord')}` }),
  cancel: (investorId, orderId) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/orders/${assertPrefixedId(orderId, 'ord')}/cancel` }),
  // Sandbox only, and only for Nigerian and Kenyan orders.
  simulate: (investorId, orderId, body) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/orders/${assertPrefixedId(orderId, 'ord')}/simulate`,
      body,
    }),
}

export const positions = {
  list: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/positions`, query }),
  get: (investorId, positionId, query) =>
    call({
      method: 'GET',
      path: `/investors/${inv(investorId)}/positions/${assertPrefixedId(positionId, 'pos')}`,
      query,
    }),
  // Places a market order for the whole holding, so it cannot be used for
  // bonds, which must be limit orders.
  close: (investorId, positionId) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/positions/${assertPrefixedId(positionId, 'pos')}/close`,
    }),
}

// ---------------------------------------------------------------------------
// Offerings: IPOs, rights issues and public bond offers.
// Cash is held in reserved_balance until allotment. No idempotency key here,
// so the duplicate guard is ours (src/middleware.js).
// ---------------------------------------------------------------------------
export const offerings = {
  list: (query) => call({ method: 'GET', path: '/offerings', query }),
  get: (offeringId) => call({ method: 'GET', path: `/offerings/${assertPrefixedId(offeringId, 'off')}` }),
  apply: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/subscription`, body }),
  subscriptions: (investorId, query) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/subscriptions`, query }),
  subscription: (investorId, subscriptionId) =>
    call({
      method: 'GET',
      path: `/investors/${inv(investorId)}/subscriptions/${assertPrefixedId(subscriptionId, 'sub')}`,
    }),
  withdrawApplication: (investorId, subscriptionId) =>
    call({
      method: 'POST',
      path: `/investors/${inv(investorId)}/subscriptions/${assertPrefixedId(subscriptionId, 'sub')}/withdraw`,
    }),
}

// ---------------------------------------------------------------------------
// Portfolios (PTFs): curated baskets with their own unit price. These are
// what the demo called "funds".
// ---------------------------------------------------------------------------
export const portfolios = {
  list: (query) => call({ method: 'GET', path: '/ptfs', query }),
  get: (ptfId) => call({ method: 'GET', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}` }),
  price: (ptfId) => call({ method: 'GET', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}/price` }),
  history: (ptfId, query) =>
    call({ method: 'GET', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}/history`, query }),

  // Tenant-curated portfolios: Dividendii builds and publishes these.
  create: (body) => call({ method: 'POST', path: '/ptfs', body }),
  update: (ptfId, body) => call({ method: 'PATCH', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}`, body }),
  publish: (ptfId) => call({ method: 'POST', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}/publish` }),
  archive: (ptfId) => call({ method: 'POST', path: `/ptfs/${assertPrefixedId(ptfId, 'ptf')}/archive` }),

  // Investor-owned portfolios.
  listForInvestor: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/ptfs`, query }),
  createForInvestor: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/ptfs`, body }),

  estimateOrder: (investorId, body) =>
    call({ method: 'POST', path: `/investors/${inv(investorId)}/ptf-orders/estimate`, body }),
  placeOrder: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/ptf-orders`, body }),
  listOrders: (investorId, query) => call({ method: 'GET', path: `/investors/${inv(investorId)}/ptf-orders`, query }),
  holdings: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/ptf-holdings` }),
}

// ---------------------------------------------------------------------------
// Webhooks. Register the URL once per environment.
// ---------------------------------------------------------------------------
export const webhooks = {
  create: (body) => call({ method: 'POST', path: '/webhooks', body }),
  update: (webhookId, body) =>
    call({ method: 'PATCH', path: `/webhooks/${assertPrefixedId(webhookId, 'wh')}`, body }),
  remove: (webhookId) => call({ method: 'DELETE', path: `/webhooks/${assertPrefixedId(webhookId, 'wh')}` }),
  rotateSecret: (webhookId) =>
    call({ method: 'POST', path: `/webhooks/${assertPrefixedId(webhookId, 'wh')}/rotate-secret` }),
}

// ---------------------------------------------------------------------------
// Cash management. An add-on: it answers 403 BLUM-403-004 until Bluum
// switches it on for the tenant. Uses an idempotency_key in the body, not a
// header.
// ---------------------------------------------------------------------------
export const cashManagement = {
  eligibility: (investorId) =>
    call({ method: 'GET', path: `/investors/${inv(investorId)}/cash-management/eligibility` }),
  enrol: (investorId, body) => call({ method: 'POST', path: `/investors/${inv(investorId)}/cash-management`, body }),
  balances: (investorId) => call({ method: 'GET', path: `/investors/${inv(investorId)}/cash-management/balances` }),
  programs: (query) => call({ method: 'GET', path: '/cash-management/programs', query }),
}

export const bluum = {
  oauth,
  investors,
  kyc,
  compliance,
  disclosures,
  wallets,
  fundingSources,
  deposits,
  withdrawals,
  assets,
  markets,
  news,
  orders,
  positions,
  offerings,
  portfolios,
  webhooks,
  cashManagement,
}

export default bluum
