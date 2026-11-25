// Public offers: IPOs, rights issues and bond offers, plus the customer's own
// applications.

import { Link } from 'react-router-dom'
import { api, formatMoney, formatDate, formatQuantity } from '../api.js'
import { useLoad } from '../session.jsx'
import { Card, Loading, Empty, Notice, ErrorNote, StatusPill, Pill } from '../components/ui.jsx'

const TYPE_LABELS = {
  ipo: 'Initial public offer',
  rights_issue: 'Rights issue',
  public_bond: 'Public bond offer',
}

export default function Offers() {
  const offers = useLoad(() => api.offerings.list())
  const mine = useLoad(() => api.offerings.mySubscriptions())

  const open = (offers.data || []).filter((o) => o.status === 'OPEN')
  const upcoming = (offers.data || []).filter((o) => o.status === 'ANNOUNCED')
  const past = (offers.data || []).filter((o) => !['OPEN', 'ANNOUNCED'].includes(o.status))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Public offers</h1>
        <p>Apply for shares or bonds when a company or government first sells them.</p>
      </div>

      <Notice kind="info" title="How an application works">
        You say how many units you want. The money is <strong>held</strong> in your wallet, not spent. When the offer
        closes you may be given all, some or none of the units you asked for, and anything not used is released.
      </Notice>

      {(mine.data || []).length > 0 && (
        <Card title="Your applications" flush>
          <table>
            <thead>
              <tr>
                <th>Offer</th>
                <th className="num">Units</th>
                <th className="num">Held</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mine.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/offers/${s.offering_id}`}>{s.offering_name || s.offering_id}</Link>
                  </td>
                  <td className="num">{formatQuantity(s.units)}</td>
                  <td className="num">{formatMoney(s.amount, s.currency)}</td>
                  <td>
                    <StatusPill status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {offers.loading ? (
        <Loading rows={5} />
      ) : offers.error ? (
        <ErrorNote error={offers.error} onRetry={offers.reload} />
      ) : (
        <>
          <OfferGroup title="Open now" offers={open} empty="Nothing is open for applications at the moment." />
          {upcoming.length > 0 && <OfferGroup title="Coming soon" offers={upcoming} />}
          {past.length > 0 && <OfferGroup title="Finished" offers={past} />}
        </>
      )}
    </div>
  )
}

function OfferGroup({ title, offers, empty }) {
  if (!offers.length && !empty) return null
  return (
    <Card title={title}>
      {!offers.length ? (
        <Empty title="Nothing here">{empty}</Empty>
      ) : (
        <div className="grid g2">
          {offers.map((o) => (
            <Link key={o.id} to={`/offers/${o.id}`} className="card" style={{ textDecoration: 'none' }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3>{o.name}</h3>
                  <p className="xs muted" style={{ marginTop: 4 }}>
                    {TYPE_LABELS[o.type] || o.type} · {String(o.country || '').toUpperCase()}
                  </p>
                </div>
                <StatusPill status={o.status} />
              </div>

              <div className="grid g2" style={{ marginTop: 14, gap: 8 }}>
                <div>
                  <div className="muted xs">Price per unit</div>
                  <div style={{ fontWeight: 700 }}>{formatMoney(o.price_per_unit, o.currency)}</div>
                </div>
                <div>
                  <div className="muted xs">Smallest application</div>
                  <div style={{ fontWeight: 700 }}>{formatQuantity(o.min_units)} units</div>
                </div>
              </div>

              <div className="wrap" style={{ marginTop: 12 }}>
                {o.coupon_rate && <Pill kind="info">{o.coupon_rate}% coupon</Pill>}
                {o.tenor && <Pill kind="quiet">{o.tenor}</Pill>}
                {o.closes_at && <Pill kind="quiet">Closes {formatDate(o.closes_at)}</Pill>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
