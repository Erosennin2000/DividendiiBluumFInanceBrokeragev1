# The email to Bluum

Ready to send. Replace the bracketed parts and delete anything that does not
apply. The order is deliberate: the first three block the build, the rest only
shape it.

---

**Subject:** Dividendii Investments, sandbox access and nine questions before we
go live

Hello [name],

I am [your name] at Dividendii Investments, a Nigerian company building a
retail investing platform on Bluum. We have built the platform against your
documentation and it is working end to end against a local stand-in for your
API. To connect it to you we need the following.

**Blocking us now**

1. **Sandbox credentials.** An API key and secret for the sandbox, and
   confirmation of the base URL we should use.
2. **A webhook endpoint registered.** Our URL will be
   `https://[your-domain]/api/webhooks/bluum`. Please register it and send us
   the signing secret. We verify `X-Bluum-Signature` as an HMAC-SHA256 of the
   raw body; please confirm that is right, and whether the header is prefixed
   with `sha256=`. We subscribe to these events, with no wildcards:
   `investor.activated`, `investor.updated`, `investor.declined`,
   `investor.suspended`, `investor.documents_requested`, `deposit.completed`,
   `deposit.failed`, `withdrawal.completed`, `withdrawal.failed`,
   `order.accepted`, `order.filled`, `order.partially_filled`,
   `order.canceled`, `order.rejected`, `position.opened`, `position.closed`,
   `subscription.allotted`, `subscription.partially_allotted`,
   `subscription.rejected`, `subscription.refunded`, `bond.coupon.paid`,
   `bond.matured`. Please tell us if any of those names are wrong.
3. **Which add-ons are switched on for our tenant,** and which need an
   arrangement: market data, cash management, bond trading, bring-your-own
   wallet, portfolios (PTFs).

**Licensing and markets**

4. **Who is the licensed broker and custodian** in Nigeria, the United States
   and Kenya, and what licence, if any, must Dividendii hold in each? We would
   like this in writing.
5. **Do you support Ghana, South Africa and Egypt,** and wallets in GHS and
   ZAR? Our documentation shows only USD, NGN and KES.
6. **Nairobi trading hours and cut-off times.** They are not in the
   documentation, so we currently tell customers they are unconfirmed. Also:
   for a Nigerian share, does `funding_currency` default to USD, and how
   should we set it?
7. **Are Nigerian ETFs and mutual funds in the asset catalogue?**

**Product questions**

8. **Gifting.** Can one investor fund another investor's wallet, or transfer
   shares to another investor? We have built gifting and this is the only step
   we cannot complete. If there is no mechanism, can you suggest one?
9. **Offerings.** Your glossary says one subscription per offering, but the
   offerings page says more than one is allowed. Which is right? Who can
   create offerings: Bluum only, or can we and the issuers? Is there any way
   to simulate an offering, an allotment and a refund in the sandbox, and how
   do allotted units become a position?
10. **Bonds.** Which bonds will be available to us, and are Nigerian or Kenyan
    government bonds among them? How do we test a bond fill in the sandbox,
    given that order simulation covers only Nigerian and Kenyan orders? What
    activity type is used for a coupon payment? Does `POST
    /positions/{id}/close` work for a bond, given that it places a market
    order and bonds must be limit orders?
11. **Partner-managed KYC.** What fields and documents does `POST
    /investors/{id}/cip` expect for each country, and in what format? We pass
    documents straight through and do not keep copies. Can we onboard an
    investor resident outside Nigeria, Kenya and the United States?
12. **The PTF endpoints.** We take these to be curated portfolios with their
    own unit price, and we have built a screen on them. Please confirm, and
    say whether we can create and publish tenant portfolios ourselves.
13. **Accounts for minors.** Are they supported, and under what conditions?
14. **The news endpoints.** Are `GET /news` and `GET /news/{id}` live, and
    what do they return?

**Commercial and operational**

15. **The revenue share:** how it is calculated, when it is paid, and whether
    we may add our own fee on top of yours.
16. **Rate limits, uptime commitments and a support contact** for production
    problems.

I am happy to take these on a call if that is quicker. The first three are
what we need to make progress this week.

Best wishes,
[your name]
[title], Dividendii Investments
[phone] · [email]

---

## What each answer changes in the code

| Answer | What changes |
| --- | --- |
| 1, 2, 3 | `server/.env` only. No code changes. |
| 5 | `MARKETS` in `server/src/config.js`, and the currency lists. |
| 6 | The hours shown on asset pages, which currently say "not confirmed". |
| 8 | The one missing line in `server/src/routes/gifts.js`. Everything around it is built. |
| 9 | One check in `server/src/routes/offerings.js` that currently refuses a second application. |
| 10 | Mostly nothing: the bond rules are already enforced. Local bonds would just appear. |
| 12 | Nothing if confirmed. The Portfolios screen is already built on them. |
