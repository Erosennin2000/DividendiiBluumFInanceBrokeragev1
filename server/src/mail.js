// Email. One-time sign-in codes and plain notices. No SMS, by decision.
//
// MAIL_MODE=console prints the message in the server log, which is how it
// works until SMTP details exist.

import { config } from './config.js'

let transport = null

async function getTransport() {
  if (config.mail.mode !== 'smtp') return null
  if (transport) return transport
  const { default: nodemailer } = await import('nodemailer')
  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  })
  return transport
}

export async function sendMail({ to, subject, text }) {
  if (config.mail.mode !== 'smtp') {
    console.log('\n--- email (MAIL_MODE=console, not actually sent) ---')
    console.log(`to:      ${to}`)
    console.log(`subject: ${subject}`)
    console.log(text)
    console.log('---------------------------------------------------\n')
    return { delivered: false, mode: 'console' }
  }
  const t = await getTransport()
  await t.sendMail({ from: config.mail.from, to, subject, text })
  return { delivered: true, mode: 'smtp' }
}

export const sendLoginCode = (to, code) =>
  sendMail({
    to,
    subject: 'Your Dividendii sign-in code',
    text:
      `Your Dividendii Investments sign-in code is ${code}\n\n` +
      'It expires in 10 minutes and can be used once.\n\n' +
      'If you did not ask to sign in, you can ignore this message.',
  })

export const sendGiftNotice = ({ to, fromName, symbol, amount, currency, message }) =>
  sendMail({
    to,
    subject: `${fromName} has sent you shares on Dividendii`,
    text:
      `${fromName} has sent you ${currency} ${amount} of ${symbol} through Dividendii Investments.\n\n` +
      (message ? `Their message: "${message}"\n\n` : '') +
      'Sign in to your Dividendii account to see it.',
  })
