// Home: what the customer owns, in each currency, and what needs attention.
//
// Totals are never added across currencies. Holdings in naira, dollars and
// shillings are three separate numbers, because a single total would be a
// made-up exchange rate.

import { Link } from 'react-router-dom'
import { api, formatMoney, formatQuantity } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Empty, Notice, StatusPill, ErrorNote } from '../components/ui.jsx'

export default function Dashboard() {
  const { user, stage, canTrade, isSampleData, refresh } = useSession()
  const wallets = useLoad(() => api.money.wallets())
  const positions = useLoad(() => api.trade.positions())
  const orders = useLoad(() => api.trade.orders())

  const openOrders = (orders.data || []).filter((o) => ['accepted', 'pending', 'partially_filled'].includes(o.status))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Good to see you{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p>Here is where your money is.</p>
      </div>

      {!canTrade && (
        <Notice kind="warn" title="Your account is not ready for trading yet">
          <div className="row" style={{ marginTop: 6 }}>
            <span>
              Status: <StatusPill status={stage} />
            </span>
            <Link to="/open-account" className="small">
              Finish opening it
            </Link>
          </div>
        </Notice>
      )}

      {isSampleData && canTrade && (
        <Notice kind="info" title="Sandbox shortcuts">
          Bluum is not connected, so there is nothing to wait for. Add money on the{' '}
          <Link to="/money">Money</Link> page and it arrives at once.
        </Notice>
      )}

      {/* Cash */}
      <Card title="Cash" action={<Link to="/money" className="small">Add or withdraw</Link>}>
        {wallets.loading ? (
          <Loading rows={3} />
        ) : wallets.error ? (
          <ErrorNote error={wallets.error} onRetry={wallets.reload} />
        ) : (
          <div className="grid g3">
            {(wallets.data || []).map((w) => (
              <div key={w.id}>
                <div className="muted xs">{w.currency}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(w.available_balance, w.currency)}</div>
                {Number(w.reserved_balance) > 0 && (
                  <div className="xs muted">
                    {formatMoney(w.reserved_balance, w.currency)} held for a public offer
                  </div>
                )}
                {Number(w.pending_balance) > 0 && (
                  <div className="xs muted">{formatMoney(w.pending_balance, w.currency)} on its way</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Holdings */}
      <Card
        title="What you own"
        flush
        action={
          <Link to="/markets" className="small">
            Buy something
          </Link>
        }
      >
        {positions.loading ? (
          <div className="card-body">
            <Loading rows={3} />
          </div>
        ) : positions.error ? (
          <div className="card-body">
            <ErrorNote error={positions.error} onRetry={positions.reload} />
          </div>
        ) : !(positions.data || []).length ? (
          <Empty title="Nothing yet" action={<Link className="btn btn-primary" to="/markets">Browse shares and ETFs</Link>}>
            Once you buy something it appears here.
          </Empty>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="num">Units</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">Gain or loss</th>
                </tr>
              </thead>
              <tbody>
                {positions.data.map((p) => {
                  const pl = Number(p.unrealized_pl || 0)
                  const isBond = ['bond', 'bill', 'note'].includes(p.class)
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={isBond ? `/bonds/${p.symbol}` : `/markets/${p.symbol}`}>
                          <strong>{p.symbol}</strong>
                        </Link>
                        <div className="xs muted">
                          {isBond ? 'Bond, held by face value' : p.class === 'etf' ? 'ETF' : 'Shares'}
                          {Number(p.settled_quantity) < Number(p.quantity) && ' · some not yet settled'}
                        </div>
                      </td>
                      <td className="num">{formatQuantity(p.quantity)}</td>
                      <td className="num">{p.current_price ? formatMoney(p.current_price, p.currency) : '—'}</td>
                      <td className="num">{p.market_value ? formatMoney(p.market_value, p.currency) : '—'}</td>
                      <td className={`num ${pl > 0 ? 'up' : pl < 0 ? 'dn' : ''}`}>
                        {p.unrealized_pl ? formatMoney(p.unrealized_pl, p.currency) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {(positions.meta?.totals || []).length > 1 && (
              <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
                <p className="xs muted">
                  Totals are kept per currency. Dividendii does not convert between them, so there is no single number
                  for everything you own.
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Open orders */}
      {openOrders.length > 0 && (
        <Card title="Orders still working" action={<Link to="/orders" className="small">All orders</Link>}>
          <div className="stack-sm">
            {openOrders.slice(0, 4).map((o) => (
              <div className="row" key={o.id}>
                <span>
                  {o.side === 'buy' ? 'Buy' : 'Sell'} {formatQuantity(o.quantity)} {o.symbol}
                  {o.limit_price ? ` at ${formatMoney(o.limit_price, o.currency)}` : ' at market'}
                </span>
                <StatusPill status={o.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid g3">
        <QuickLink to="/markets" title="Shares and ETFs" body="Nigeria, the United States and Kenya." />
        <QuickLink to="/offers" title="Public offers" body="IPOs, rights issues and bond offers." />
        <QuickLink to="/bonds" title="Bonds" body="Treasuries and corporate bonds." />
      </div>

      {stage !== 'active' && (
        <button className="linkbtn" onClick={refresh}>
          Check my account status again
        </button>
      )}
    </div>
  )
}

const QuickLink = ({ to, title, body }) => (
  <Link to={to} className="card" style={{ textDecoration: 'none' }}>
    <h3>{title}</h3>
    <p className="small muted" style={{ marginTop: 4 }}>
      {body}
    </p>
  </Link>
)
