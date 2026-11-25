// Every order, with what can still be done to it.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatMoney, formatQuantity, formatDateTime } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Empty, ErrorNote, Segmented, StatusPill } from '../components/ui.jsx'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Still working' },
  { value: 'filled', label: 'Done' },
]

const OPEN_STATUSES = ['accepted', 'pending', 'partially_filled', 'new']

export default function Orders() {
  const { isSampleData } = useSession()
  const [filter, setFilter] = useState('')
  const orders = useLoad(() => api.trade.orders())
  const [busyId, setBusyId] = useState(null)

  const rows = (orders.data || []).filter((o) => {
    if (filter === 'open') return OPEN_STATUSES.includes(o.status)
    if (filter === 'filled') return o.status === 'filled'
    return true
  })

  async function cancel(id) {
    setBusyId(id)
    await api.trade.cancel(id).catch(() => {})
    setBusyId(null)
    orders.reload()
  }

  async function forceFill(id) {
    setBusyId(id)
    await api.trade.simulateFill(id).catch(() => {})
    setBusyId(null)
    orders.reload()
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Orders</h1>
        <p>Everything you have asked us to buy or sell.</p>
      </div>

      <div className="wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Which orders" />
      </div>

      <Card flush>
        {orders.loading ? (
          <div className="card-body">
            <Loading rows={5} />
          </div>
        ) : orders.error ? (
          <div className="card-body">
            <ErrorNote error={orders.error} onRetry={orders.reload} />
          </div>
        ) : !rows.length ? (
          <Empty title="No orders here" action={<Link className="btn btn-primary" to="/markets">Place one</Link>}>
            {filter ? 'Try another filter.' : 'Your orders will appear here.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>When</th>
                <th className="num">Value</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const isBond = ['bond', 'bill', 'note'].includes(o.asset_class)
                return (
                  <tr key={o.id}>
                    <td>
                      <strong>
                        {o.side === 'buy' ? 'Buy' : 'Sell'} {o.symbol}
                      </strong>
                      <div className="xs muted">
                        {isBond ? `Face value ${formatQuantity(o.quantity)}` : `${formatQuantity(o.quantity)} units`}
                        {o.limit_price
                          ? isBond
                            ? ` at ${o.limit_price}% of face value`
                            : ` at ${formatMoney(o.limit_price, o.currency)}`
                          : ' at market price'}
                        {o.notional ? ` · ${formatMoney(o.notional, o.currency)} worth` : ''}
                      </div>
                    </td>
                    <td className="small muted">{formatDateTime(o.created_at)}</td>
                    <td className="num">{o.estimated_total ? formatMoney(o.estimated_total, o.currency) : '—'}</td>
                    <td>
                      <StatusPill status={o.status} />
                      {o.status === 'partially_filled' && (
                        <div className="xs muted">{formatQuantity(o.filled_quantity)} filled so far</div>
                      )}
                    </td>
                    <td className="num">
                      {OPEN_STATUSES.includes(o.status) && (
                        <div className="wrap" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-quiet btn-sm" disabled={busyId === o.id} onClick={() => cancel(o.id)}>
                            Cancel
                          </button>
                          {isSampleData && (
                            <button className="btn btn-quiet btn-sm" disabled={busyId === o.id} onClick={() => forceFill(o.id)}>
                              Fill it
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="xs muted">
        Orders are updated by Bluum as they happen, not by this page asking over and over. Reopen the page to see the
        latest.
      </p>
    </div>
  )
}
