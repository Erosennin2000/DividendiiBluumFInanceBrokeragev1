// Dividendii Investments: the API this platform's screens talk to.
//
// The browser never talks to Bluum. It talks to this server, which holds the
// Bluum key, decides what is allowed and turns Bluum's answers into
// something a screen can show.

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { config, activeMarkets } from './config.js'
import { connect, usingPostgres } from './db/index.js'
import { attachUser, ok } from './middleware.js'
import { errorHandler } from './errors.js'

import authRoutes from './routes/auth.js'
import accountRoutes from './routes/account.js'
import moneyRoutes from './routes/money.js'
import marketRoutes from './routes/market.js'
import tradeRoutes from './routes/trade.js'
import bondRoutes from './routes/bonds.js'
import offeringRoutes from './routes/offerings.js'
import portfolioRoutes from './routes/portfolios.js'
import giftRoutes from './routes/gifts.js'
import webhookRoutes, { SUBSCRIBED_EVENTS } from './routes/webhooks.js'
import devRoutes from './routes/dev.js'

const app = express()
app.set('trust proxy', 1)

app.use(
  cors({
    origin: config.webOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  }),
)
app.use(cookieParser())

// The raw body is kept so a webhook signature can be checked against the
// exact bytes Bluum signed.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf
    },
  }),
)
app.use(attachUser)

// What this server is and how it is configured. No secrets.
app.get('/api/health', (_req, res) =>
  ok(res, {
    service: 'dividendii-platform',
    bluum_mode: config.bluum.mode,
    bluum_env: config.bluum.env,
    database: usingPostgres() ? 'postgres' : 'in-memory',
    mail_mode: config.mail.mode,
    kyc_storage: config.kyc.storage,
    markets: activeMarkets().map((m) => m.code),
    webhook_secret_set: Boolean(config.bluum.webhookSecret),
    subscribed_events: SUBSCRIBED_EVENTS.length,
    warnings: config.warnings,
  }),
)

app.use('/api/auth', authRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/money', moneyRoutes)
app.use('/api/market', marketRoutes)
app.use('/api/trade', tradeRoutes)
app.use('/api/bonds', bondRoutes)
app.use('/api/offerings', offeringRoutes)
app.use('/api/portfolios', portfolioRoutes)
app.use('/api/gifts', giftRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/dev', devRoutes)

app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } }))
app.use(errorHandler)

const started = await connect()

app.listen(config.port, () => {
  console.log('')
  console.log('  Dividendii Investments platform API')
  console.log(`  http://localhost:${config.port}`)
  console.log('')
  console.log(`  Bluum      ${config.bluum.mode}${config.bluum.mode === 'mock' ? ' (sample data, no Bluum calls)' : ` -> ${config.bluum.baseUrl}`}`)
  console.log(`  Database   ${started.kind}${started.kind === 'memory' ? ' (data is lost on restart)' : ''}`)
  console.log(`  Email      ${config.mail.mode}${config.mail.mode === 'console' ? ' (codes appear in this log)' : ''}`)
  console.log(`  KYC files  ${config.kyc.storage}`)
  console.log(`  Markets    ${activeMarkets().map((m) => `${m.code} ${m.currency}`).join(', ')}`)
  for (const w of config.warnings) console.log(`  WARNING    ${w}`)
  console.log('')
})
