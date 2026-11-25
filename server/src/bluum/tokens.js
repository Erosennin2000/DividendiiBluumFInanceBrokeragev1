// Investor tokens.
//
// Bluum's token exchange returns a token that lasts 15 minutes and can act
// for one investor only. There is no refresh token: when it expires you ask
// for another. This keeps one in memory per investor and asks again a minute
// before it runs out.
//
// The token is used for the "invest tab" case, where a host app's screens act
// for a single customer. Dividendii's own screens go through this server with
// the partner key, so they never need it.

import { oauth } from './api.js'

const cache = new Map() // investorId -> { token, expiresAt }
const EARLY_MS = 60_000

export async function investorToken(investorId) {
  const hit = cache.get(investorId)
  if (hit && hit.expiresAt - EARLY_MS > Date.now()) return hit.token

  const res = await oauth.tokenExchange(investorId)
  const token = res.access_token
  const expiresAt = Date.now() + Number(res.expires_in || 900) * 1000
  cache.set(investorId, { token, expiresAt })
  return token
}

export async function revokeInvestorToken(investorId) {
  const hit = cache.get(investorId)
  cache.delete(investorId)
  if (hit) {
    try {
      await oauth.revoke(hit.token)
    } catch {
      // A token that cannot be revoked expires on its own within 15 minutes.
    }
  }
}

export const forgetAllTokens = () => cache.clear()
