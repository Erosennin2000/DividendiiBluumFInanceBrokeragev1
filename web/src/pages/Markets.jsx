// The shelf: shares and ETFs, filtered by market, with a search.
// Bonds are deliberately not here; their prices mean something different.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatMoney } from '../api.js'
import { useLoad } from '../session.jsx'
import { Card, Loading, Empty, Segmented, ErrorNote, Pill, useDebounced } from '../components/ui.jsx'

const MARKET_TABS = [
  { value: '', label: 'All' },
  { value: 'ng', label: 'Nigeria' },
  { value: 'us', label: 'United States' },
  { value: 'ke', label: 'Kenya' },
]

const KIND_TABS = [
  { value: 'equity,etf', label: 'Everything' },
  { value: 'equity', label: 'Shares' },
  { value: 'etf', label: 'ETFs' },
]

export default function Markets() {
  const [country, setCountry] = useState('')
  const [kind, setKind] = useState('equity,etf')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)

  const assets = useLoad(
    () => api.market.assets({ country: country || undefined, class: kind, q: q || undefined }),
    [country, kind, q],
  )

  const markets = assets.meta?.markets || []

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Shares and ETFs</h1>
        <p>
          {markets.length
            ? `Trading in ${markets.map((m) => `${m.name} (${m.currency})`).join(', ')}.`
            : 'Choose a market to see what is available.'}
        </p>
      </div>

      <Card>
        <div className="wrap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="wrap">
            <Segmented options={MARKET_TABS} value={country} onChange={setCountry} label="Market" />
            <Segmented options={KIND_TABS} value={kind} onChange={setKind} label="Kind" />
          </div>
          <div style={{ minWidth: 220, flex: 1 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ticker"
              aria-label="Search shares and ETFs"
            />
          </div>
        </div>
      </Card>

      <Card flush>
        {assets.loading ? (
          <div className="card-body">
            <Loading rows={6} />
          </div>
        ) : assets.error ? (
          <div className="card-body">
            <ErrorNote error={assets.error} onRetry={assets.reload} />
          </div>
        ) : !(assets.data || []).length ? (
          <Empty title="Nothing matched">Try another market or a different search.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Market</th>
                <th className="num">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.data.map((a) => (
                <tr key={a.symbol}>
                  <td>
                    <Link to={`/markets/${a.symbol}`}>
                      <strong>{a.symbol}</strong>
                    </Link>
                    <div className="xs muted">{a.name}</div>
                  </td>
                  <td>
                    <div className="wrap">
                      <Pill kind="quiet">{String(a.country || '').toUpperCase()}</Pill>
                      {a.class === 'etf' && <Pill kind="info">ETF</Pill>}
                      {a.fractionable && <Pill kind="quiet">Fractions</Pill>}
                    </div>
                  </td>
                  <td className="num">{a.price ? formatMoney(a.price, a.currency) : '—'}</td>
                  <td className="num">
                    <Link className="btn btn-outline btn-sm" to={`/markets/${a.symbol}`}>
                      Trade
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
