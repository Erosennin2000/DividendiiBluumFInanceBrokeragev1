// One public offer, and the application form.
//
// Two things this screen does that the API does not: it checks the customer's
// country against the offer's eligible countries, because Bluum does not
// enforce that, and it blocks a second application to the same offer, because
// Bluum's own documentation disagrees with itself on whether that is allowed.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, formatMoney, formatQuantity, formatDate, newKey } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Notice, ErrorNote, Field, StatusPill, useDebounced } from '../components/ui.jsx'

const TYPE_LABELS = {
  ipo: 'Initial public offer',
  rights_issue: 'Rights issue',
  public_bond: 'Public bond offer',
}

export default function OfferDetail() {
  const { id } = useParams()
  const { canTrade, user } = useSession()
  const offer = useLoad(() => api.offerings.get(id), [id])
  const mine = useLoad(() => api.offerings.mySubscriptions(), [id])

  if (offer.loading && !offer.data) return <Loading rows={6} />
  if (offer.error && !offer.data) return <ErrorNote error={offer.error} onRetry={offer.reload} />

  const o = offer.data
  const canApply = offer.meta?.can_apply
  const existing = (mine.data || []).find(
    (s) => s.offering_id === o.id && ['APPLIED', 'PARTIALLY_ALLOTTED', 'FULLY_ALLOTTED'].includes(s.status),
  )
  const eligible = o.eligible_countries
  const countryAllowed =
    !Array.isArray(eligible) || !eligible.length || !user.country
      ? true
      : eligible.map((c) => c.toLowerCase()).includes(String(user.country).toLowerCase())

  return (
    <div className="stack">
      <div className="page-head">
        <Link to="/offers" className="small">
          ← Public offers
        </Link>
        <h1 style={{ marginTop: 8 }}>{o.name}</h1>
        <p>
          {TYPE_LABELS[o.type] || o.type} by {o.issuer} · {String(o.country || '').toUpperCase()}
        </p>
      </div>

      <div className="split">
        <div className="stack">
          <Card title="The offer">
            <div className="grid g2">
              <Row label="Status" value={<StatusPill status={o.status} />} />
              <Row label="Price per unit" value={formatMoney(o.price_per_unit, o.currency)} />
              <Row label="Smallest application" value={`${formatQuantity(o.min_units)} units`} />
              <Row label="Units must be a multiple of" value={formatQuantity(o.unit_increment)} />
              <Row label="Opens" value={formatDate(o.opens_at)} />
              <Row label="Closes" value={formatDate(o.closes_at)} />
              {o.coupon_rate && <Row label="Coupon" value={`${o.coupon_rate}% a year`} />}
              {o.tenor && <Row label="Term" value={o.tenor} />}
            </div>

            {o.summary && (
              <p className="small" style={{ marginTop: 16 }}>
                {o.summary}
              </p>
            )}

            {Array.isArray(eligible) && eligible.length > 0 && (
              <p className="xs muted" style={{ marginTop: 14 }}>
                Open to residents of: {eligible.map((c) => c.toUpperCase()).join(', ')}.
              </p>
            )}
          </Card>

          {existing && (
            <Card title="Your application">
              <div className="row">
                <span>
                  {formatQuantity(existing.units)} units · {formatMoney(existing.amount, existing.currency)} held
                </span>
                <StatusPill status={existing.status} />
              </div>
              {existing.status === 'APPLIED' && (
                <WithdrawApplication id={existing.id} onDone={() => (mine.reload(), offer.reload())} />
              )}
            </Card>
          )}
        </div>

        {canApply && !existing ? (
          countryAllowed ? (
            <ApplyForm offer={o} canTrade={canTrade} onDone={() => (mine.reload(), offer.reload())} />
          ) : (
            <Card title="Not open to you">
              <Notice kind="warn" title="Where you live">
                This offer is only open to residents of {eligible.map((c) => c.toUpperCase()).join(', ')}, and your
                account says you live in {String(user.country || '').toUpperCase()}.
              </Notice>
            </Card>
          )
        ) : (
          <Card title="Applications">
            <Notice kind={o.status === 'ANNOUNCED' ? 'info' : 'warn'}>
              {existing
                ? 'You have already applied. Withdraw that application if you want to change it.'
                : o.status === 'ANNOUNCED'
                  ? `This offer opens on ${formatDate(o.opens_at)}.`
                  : 'This offer is closed for applications.'}
            </Notice>
          </Card>
        )}
      </div>
    </div>
  )
}

const Row = ({ label, value }) => (
  <div>
    <div className="muted xs">{label}</div>
    <div style={{ fontWeight: 500 }}>{value}</div>
  </div>
)

function ApplyForm({ offer, canTrade, onDone }) {
  const [units, setUnits] = useState(String(offer.min_units || ''))
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const debounced = useDebounced(units)

  useEffect(() => {
    if (!(Number(debounced) > 0)) return
    let cancelled = false
    api.offerings
      .quote(offer.id, debounced)
      .then((r) => !cancelled && (setQuote(r.data), setQuoteError(null)))
      .catch((e) => !cancelled && (setQuote(null), setQuoteError(e)))
    return () => {
      cancelled = true
    }
  }, [debounced, offer.id])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.offerings.apply(offer.id, units, newKey())
      setDone(res.data)
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Card title="Application received">
        <div className="stack">
          <Notice kind="good" title="You have applied">
            {formatQuantity(done.units)} units, {formatMoney(done.amount, done.currency)} held in your wallet.
          </Notice>
          <p className="small muted">
            Nothing has been spent. When the offer closes you will be told how many units you were given, and anything
            unused is released.
          </p>
          <Link className="btn btn-outline" to="/offers">
            Back to offers
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Apply">
      {!canTrade && (
        <div style={{ marginBottom: 14 }}>
          <Notice kind="warn" title="Not yet">
            Your account is not active. <Link to="/open-account">Finish opening it</Link>.
          </Notice>
        </div>
      )}

      <form onSubmit={submit}>
        <Field
          label="How many units"
          hint={`At least ${formatQuantity(offer.min_units)}, in multiples of ${formatQuantity(offer.unit_increment)}.`}
        >
          <input
            type="number"
            min={offer.min_units}
            step={offer.unit_increment}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            required
          />
        </Field>

        {quote && (
          <div style={{ margin: '16px 0' }}>
            <div className="kv">
              <span className="muted">{formatQuantity(quote.units)} units</span>
              <span className="num">{formatMoney(quote.price_per_unit, quote.currency)} each</span>
            </div>
            <div className="kv total">
              <span>Held from your wallet</span>
              <span className="num">{formatMoney(quote.amount, quote.currency)}</span>
            </div>
            {!quote.enough_cash && (
              <div style={{ marginTop: 12 }}>
                <Notice kind="warn" title="Not enough cash">
                  You need {formatMoney(quote.shortfall, quote.currency)} more.{' '}
                  <Link to="/money">Add money</Link>.
                </Notice>
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

        <button className="btn btn-primary btn-block" disabled={busy || !canTrade || !quote?.enough_cash}>
          {busy ? 'Applying…' : 'Apply for these units'}
        </button>

        <p className="xs muted" style={{ marginTop: 10 }}>
          Applying holds the money in your wallet. It is not spent until units are allotted to you.
        </p>
      </form>
    </Card>
  )
}

function WithdrawApplication({ id, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function withdraw() {
    setBusy(true)
    setError(null)
    try {
      await api.offerings.withdrawApplication(id)
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <ErrorNote error={error} />
      <button className="btn btn-quiet btn-sm" onClick={withdraw} disabled={busy}>
        {busy ? 'Withdrawing…' : 'Withdraw my application'}
      </button>
      <p className="xs muted" style={{ marginTop: 6 }}>
        The money held for it goes back to your available balance.
      </p>
    </div>
  )
}
