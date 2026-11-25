// Gifting shares.
//
// By decision, the person receiving a gift must already have a Dividendii
// account. One step is still waiting on Bluum: how the sender's money reaches
// the recipient's wallet. The screen says so rather than pretending the gift
// has gone.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatMoney, formatDate, newKey } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Empty, Notice, ErrorNote, Field, StatusPill, FeeRows, useDebounced } from '../components/ui.jsx'

export default function Gifts() {
  const sent = useLoad(() => api.gifts.sent())
  const received = useLoad(() => api.gifts.received())

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Gifts</h1>
        <p>Give someone shares instead of something they will forget by next year.</p>
      </div>

      <Notice kind="warn" title="Not finished yet">
        A gift can be set up and saved, but it cannot be paid for until Bluum confirms how one customer's money reaches
        another's account. Nobody is charged in the meantime.
      </Notice>

      <div className="split">
        <GiftForm onDone={sent.reload} />

        <div className="stack">
          <Card title="Gifts you have sent" flush>
            {sent.loading ? (
              <div className="card-body">
                <Loading rows={2} />
              </div>
            ) : !(sent.data || []).length ? (
              <Empty title="None yet">Gifts you send appear here.</Empty>
            ) : (
              <table>
                <tbody>
                  {(sent.data || []).map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong>
                          {formatMoney(g.amount, g.currency)} of {g.symbol}
                        </strong>
                        <div className="xs muted">
                          To {g.to_email} · {formatDate(g.created_at)}
                        </div>
                      </td>
                      <td className="num">
                        <StatusPill status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {(received.data || []).length > 0 && (
            <Card title="Gifts for you" flush>
              <table>
                <tbody>
                  {received.data.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong>
                          {formatMoney(g.amount, g.currency)} of {g.symbol}
                        </strong>
                        {g.message && <div className="xs muted">“{g.message}”</div>}
                      </td>
                      <td className="num">
                        <StatusPill status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function GiftForm({ onDone }) {
  const { canTrade } = useSession()
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [message, setMessage] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [meta, setMeta] = useState(null)
  const [quoteError, setQuoteError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  // Only assets that can be held in fractions, since a gift is an amount.
  const assets = useLoad(() => api.market.assets({ class: 'equity,etf' }))
  const giftable = (assets.data || []).filter((a) => a.fractionable)

  const debouncedAmount = useDebounced(amount)

  useEffect(() => {
    if (!symbol || !(Number(debouncedAmount) > 0)) return setEstimate(null)
    let cancelled = false
    api.gifts
      .quote({ symbol, amount: debouncedAmount })
      .then((r) => {
        if (cancelled) return
        setEstimate(r.data)
        setMeta(r.meta || null)
        setQuoteError(null)
      })
      .catch((e) => !cancelled && (setEstimate(null), setQuoteError(e)))
    return () => {
      cancelled = true
    }
  }, [symbol, debouncedAmount])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.gifts.create({ symbol, amount, to_email: toEmail, message }, newKey())
      setDone({ gift: res.data, note: res.meta?.next_step })
      setAmount('')
      setToEmail('')
      setMessage('')
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const currency = giftable.find((a) => a.symbol === symbol)?.currency || 'NGN'

  if (done) {
    return (
      <Card title="Gift saved">
        <div className="stack">
          <Notice kind="info" title="Saved, not yet sent">
            {done.note || 'This gift is waiting on one answer from Bluum before it can be paid for.'}
          </Notice>
          <button className="btn btn-primary" onClick={() => setDone(null)}>
            Set up another
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Send a gift">
      <form onSubmit={submit}>
        {!canTrade && (
          <div style={{ marginBottom: 14 }}>
            <Notice kind="warn">
              Your account is not active yet. <Link to="/open-account">Finish opening it</Link>.
            </Notice>
          </div>
        )}

        <Field label="What to give" hint="Only shares and ETFs that can be held in fractions.">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} required>
            <option value="">Choose a share or ETF</option>
            {giftable.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} — {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>

        <Field label={`How much (${currency})`}>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>

        <Field label="Who it is for" hint="They need a Dividendii account already.">
          <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} required placeholder="their@email.com" />
        </Field>

        <Field label="A short message" hint="Up to 280 characters. Optional.">
          <textarea value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} />
        </Field>

        {estimate && (
          <div style={{ margin: '16px 0' }}>
            <FeeRows estimate={estimate} currency={currency} formatMoney={formatMoney} />
            {meta?.fee_warning && (
              <div style={{ marginTop: 10 }}>
                <Notice kind="warn">{meta.fee_warning}</Notice>
              </div>
            )}
          </div>
        )}

        {quoteError && (
          <div style={{ margin: '12px 0' }}>
            <Notice kind="warn">{quoteError.message}</Notice>
          </div>
        )}

        <ErrorNote error={error} />

        <button className="btn btn-primary btn-block" disabled={busy || !canTrade || !estimate || !toEmail}>
          {busy ? 'Saving…' : 'Set up this gift'}
        </button>
      </form>
    </Card>
  )
}
