// Sign in with a code sent by email. Two steps: the address, then the code.
// There is no password to forget.

import { useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../session.jsx'
import { Field, ErrorNote, Notice } from '../components/ui.jsx'

export default function SignIn() {
  const { refresh } = useSession()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function requestCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.auth.requestCode(email.trim(), name.trim() || undefined)
      setDevCode(res.data.dev_code || null)
      setStep('code')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.verify(email.trim(), code.trim())
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/brand/logo-horizontal.svg" alt="Dividendii Investments" />

        {step === 'email' ? (
          <form onSubmit={requestCode}>
            <h1 style={{ marginBottom: 6 }}>Sign in</h1>
            <p className="muted small" style={{ marginBottom: 20 }}>
              Enter your email address and we will send you a six-digit code. New here? This opens your account too.
            </p>

            <Field label="Email address">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Your name" hint="Only needed the first time.">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>

            <ErrorNote error={error} />

            <button className="btn btn-primary btn-block" disabled={busy || !email} style={{ marginTop: 8 }}>
              {busy ? 'Sending…' : 'Send my code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <h1 style={{ marginBottom: 6 }}>Enter your code</h1>
            <p className="muted small" style={{ marginBottom: 20 }}>
              We sent a six-digit code to {email}. It lasts ten minutes.
            </p>

            {devCode && (
              <div style={{ marginBottom: 16 }}>
                <Notice kind="warn" title="Email is not connected yet">
                  Your code is <strong>{devCode}</strong>. It is shown here because the server is printing emails to its
                  log instead of sending them. Set the SMTP details to stop this.
                </Notice>
              </div>
            )}

            <Field label="Six-digit code">
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                autoComplete="one-time-code"
              />
            </Field>

            <ErrorNote error={error} />

            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>

            <button
              type="button"
              className="linkbtn"
              style={{ display: 'block', margin: '12px auto 0' }}
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
              }}
            >
              Use a different address
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
