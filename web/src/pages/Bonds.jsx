// The bond shelf. Kept apart from shares because a bond price is a
// percentage of face value, not an amount of money, and mixing the two in one
// list is how people buy the wrong thing.

import { Link } from 'react-router-dom'
import { api, formatPercent, formatQuantity, formatDate, formatMoney } from '../api.js'
import { useLoad } from '../session.jsx'
import { Card, Loading, Empty, Notice, ErrorNote, Pill } from '../components/ui.jsx'

export default function Bonds() {
  const bonds = useLoad(() => api.bonds.list())
  const holdings = useLoad(() => api.bonds.holdings())

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Bonds</h1>
        <p>Lend money to a government or a company and be paid interest until it matures.</p>
      </div>

      <Notice kind="info" title="Bonds work differently from shares">
        You buy a <strong>face value</strong>, not a number of units, and the price is shown as a{' '}
        <strong>percentage of that face value</strong>. A price of 99.5 means you pay about 99.5% of the face value,
        plus the interest that has built up since the last payment. Every bond order has a price you set yourself.
      </Notice>

      {(holdings.data || []).length > 0 && (
        <Card title="Your bonds" flush>
          <table>
            <thead>
              <tr>
                <th>Bond</th>
                <th className="num">Face value</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {holdings.data.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link to={`/bonds/${h.symbol}`}>
                      <strong>{h.symbol}</strong>
                    </Link>
                  </td>
                  <td className="num">{formatQuantity(h.quantity)}</td>
                  <td className="num">{h.market_value ? formatMoney(h.market_value, h.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card flush>
        {bonds.loading ? (
          <div className="card-body">
            <Loading rows={5} />
          </div>
        ) : bonds.error ? (
          <div className="card-body">
            <ErrorNote error={bonds.error} onRetry={bonds.reload} />
            <p className="small muted" style={{ marginTop: 10 }}>
              Bond trading is switched on per account at Bluum. If this keeps failing, it may not be enabled yet.
            </p>
          </div>
        ) : !(bonds.data || []).length ? (
          <Empty title="No bonds available">
            Bond trading has to be switched on by Bluum before anything appears here.
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bond</th>
                <th className="num">Coupon</th>
                <th>Matures</th>
                <th className="num">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bonds.data.map((b) => (
                <tr key={b.symbol}>
                  <td>
                    <Link to={`/bonds/${b.symbol}`}>
                      <strong>{b.name}</strong>
                    </Link>
                    <div className="xs muted">
                      {b.bond?.cusip || b.symbol}
                      {b.bond?.issuer_type && ` · ${b.bond.issuer_type}`}
                      {b.display?.min_increment && ` · multiples of ${b.display.min_increment}`}
                    </div>
                  </td>
                  <td className="num">{b.bond?.coupon_rate ? formatPercent(b.bond.coupon_rate, 3) : '—'}</td>
                  <td>
                    {formatDate(b.bond?.maturity_date)}
                    {b.bond?.settlement_convention && (
                      <div className="xs muted">Settles {b.bond.settlement_convention}</div>
                    )}
                  </td>
                  <td className="num">
                    {b.price}
                    <div className="xs muted">% of face</div>
                  </td>
                  <td className="num">
                    <Link className="btn btn-outline btn-sm" to={`/bonds/${b.symbol}`}>
                      Trade
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="wrap">
        <Pill kind="quiet">Interest is paid into your wallet automatically</Pill>
        <Pill kind="quiet">Face value is returned at maturity</Pill>
      </div>
    </div>
  )
}
