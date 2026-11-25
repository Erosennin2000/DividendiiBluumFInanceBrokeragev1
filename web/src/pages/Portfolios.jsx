// Portfolios: ready-made baskets of shares, bought by amount. Bluum calls
// these PTFs. This is the nearest thing in the API to the "funds" the earlier
// demo showed, and the wording is deliberately different: a basket Dividendii
// puts together is not a fund run by a fund house.

import { useEffect, useState } from 'react'
import { api, formatMoney, formatQuantity, formatPercent, newKey } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Empty, Notice, ErrorNote, Field, Modal, FeeRows, useDebounced } from '../components/ui.jsx'

export default function Portfolios() {
  const portfolios = useLoad(() => api.portfolios.list())
  const holdings = useLoad(() => api.portfolios.holdings())
  const [buying, setBuying] = useState(null)

  const reload = () => {
    holdings.reload()
    portfolios.reload()
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Portfolios</h1>
        <p>A basket of shares in one purchase, bought by amount rather than by share.</p>
      </div>

      {(holdings.data || []).length > 0 && (
        <Card title="Your portfolios" flush>
          <table>
            <thead>
              <tr>
                <th>Portfolio</th>
                <th className="num">Units</th>
                <th className="num">Value</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {holdings.data.map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.name}</strong>
                  </td>
                  <td className="num">{formatQuantity(h.units)}</td>
                  <td className="num">{formatMoney(h.market_value, h.currency)}</td>
                  <td className="num">{formatMoney(h.total_cost_basis, h.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {portfolios.loading ? (
        <Loading rows={4} />
      ) : portfolios.error ? (
        <div>
          <ErrorNote error={portfolios.error} onRetry={portfolios.reload} />
          <p className="small muted" style={{ marginTop: 10 }}>
            Portfolios may not be switched on for this account at Bluum yet.
          </p>
        </div>
      ) : !(portfolios.data || []).length ? (
        <Card>
          <Empty title="No portfolios yet">
            Dividendii builds these and publishes them through Bluum. None have been published yet.
          </Empty>
        </Card>
      ) : (
        <div className="grid g2">
          {portfolios.data.map((p) => (
            <Card key={p.id} title={p.name}>
              <div className="row" style={{ marginBottom: 12 }}>
                <div>
                  <div className="muted xs">Unit price</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(p.unit_price, p.currency)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted xs">Currency</div>
                  <div style={{ fontWeight: 500 }}>{p.currency}</div>
                </div>
              </div>

              {p.description && (
                <p className="small muted" style={{ marginBottom: 12 }}>
                  {p.description}
                </p>
              )}

              {(p.constituents || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="muted xs" style={{ marginBottom: 6 }}>
                    What is in it
                  </div>
                  {p.constituents.map((c) => (
                    <div className="kv" key={c.symbol}>
                      <span>{c.symbol}</span>
                      <span className="num">{formatPercent(Number(c.weight) * 100, 0)}</span>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn btn-primary btn-block" onClick={() => setBuying(p)}>
                Invest in this
              </button>
            </Card>
          ))}
        </div>
      )}

      {buying && <BuyPortfolio portfolio={buying} onClose={() => setBuying(null)} onDone={reload} />}
    </div>
  )
}

function BuyPortfolio({ portfolio, onClose, onDone }) {
  const { canTrade } = useSession()
  const [amount, setAmount] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const debounced = useDebounced(amount)

  useEffect(() => {
    if (!(Number(debounced) > 0)) return setEstimate(null)
    let cancelled = false
    api.portfolios
      .estimate({ ptf_id: portfolio.id, amount: debounced })
      .then((r) => !cancelled && setEstimate(r.data))
      .catch(() => !cancelled && setEstimate(null))
    return () => {
      cancelled = true
    }
  }, [debounced, portfolio.id])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.portfolios.order({ ptf_id: portfolio.id, amount, side: 'buy' }, newKey())
      setDone(res.data)
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={portfolio.name} onClose={onClose}>
      {done ? (
        <div className="stack">
          <Notice kind="good" title="Done">
            You now hold {formatQuantity(done.units)} units of {portfolio.name}.
          </Notice>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {!canTrade && (
            <div style={{ marginBottom: 14 }}>
              <Notice kind="warn">Your account is not active for trading yet.</Notice>
            </div>
          )}

          <Field
            label={`How much do you want to invest? (${portfolio.currency})`}
            hint={`Each unit costs ${formatMoney(portfolio.unit_price, portfolio.currency)}. You can hold part of a unit.`}
          >
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </Field>

          {estimate && (
            <div style={{ margin: '16px 0' }}>
              <FeeRows estimate={estimate} currency={portfolio.currency} formatMoney={formatMoney} />
              <p className="xs muted" style={{ marginTop: 6 }}>
                About {formatQuantity(estimate.units)} units.
              </p>
            </div>
          )}

          <ErrorNote error={error} />

          <button className="btn btn-primary btn-block" disabled={busy || !canTrade || !estimate}>
            {busy ? 'Buying…' : 'Invest'}
          </button>
        </form>
      )}
    </Modal>
  )
}
