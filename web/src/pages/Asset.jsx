// One share or ETF, with the order ticket.
//
// The ticket's rules come from the asset itself, not from assumptions:
// buying by amount only appears when the asset can be held in fractions,
// and a sell is limited to the settled part of the holding, because an
// unsettled sell is refused by Bluum with BLUM-400-017.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, formatMoney, formatQuantity, newKey } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import {
  Card,
  Loading,
  Notice,
  ErrorNote,
  Field,
  Segmented,
  Sparkline,
  FeeRows,
  StatusPill,
  Pill,
  useDebounced,
} from '../components/ui.jsx'

export default function Asset() {
  const { symbol } = useParams()
  const { canTrade, stage } = useSession()

  const asset = useLoad(() => api.market.asset(symbol), [symbol])
  const bars = useLoad(() => api.market.bars(symbol, 30), [symbol])
  const positions = useLoad(() => api.trade.positions(), [symbol])

  // Only the first load replaces the page. A later refresh keeps what is on
  // screen, so the order ticket and its confirmation are not thrown away
  // underneath the customer.
  if (asset.loading && !asset.data) return <Loading rows={6} />
  if (asset.error && !asset.data) return <ErrorNote error={asset.error} onRetry={asset.reload} />

  const { asset: a, quote, market, trading } = asset.data
  const holding = (positions.data || []).find((p) => p.symbol === a.symbol)

  return (
    <div className="stack">
      <div className="page-head">
        <Link to="/markets" className="small">
          ← Shares and ETFs
        </Link>
        <h1 style={{ marginTop: 8 }}>
          {a.name} <span className="muted">{a.symbol}</span>
        </h1>
        <div className="wrap" style={{ marginTop: 8 }}>
          <Pill kind="quiet">{String(a.country || '').toUpperCase()}</Pill>
          {a.class === 'etf' && <Pill kind="info">ETF</Pill>}
          {a.fractionable && <Pill kind="quiet">Can be bought in fractions</Pill>}
          {a.tradable === false && <Pill kind="bad">Not trading</Pill>}
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Card>
            <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <div className="muted xs">Last price</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>
                  {formatMoney(quote?.last_price || a.price, a.currency)}
                </div>
                {quote && (
                  <div className={`small ${Number(quote.change) >= 0 ? 'up' : 'dn'}`}>
                    {Number(quote.change) >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(Number(quote.change)), a.currency)} (
                    {quote.change_percent}%)
                  </div>
                )}
              </div>
              <div className="small muted" style={{ textAlign: 'right' }}>
                {quote?.bid_price && (
                  <div>
                    Bid {formatMoney(quote.bid_price, a.currency)} · Ask {formatMoney(quote.ask_price, a.currency)}
                  </div>
                )}
                {quote?.price_confidence && <div className="xs">Price: {quote.price_confidence.toLowerCase()}</div>}
              </div>
            </div>

            {bars.data?.length ? <Sparkline points={bars.data.map((b) => ({ v: b.c }))} height={120} /> : null}

            {market && (
              <p className="xs muted" style={{ marginTop: 12 }}>
                {market.name} · {market.hours}
                {!market.hours_confirmed && ' (not confirmed by Bluum)'}
                {market.extended_hours ? ' · extended hours available' : ''}
              </p>
            )}
          </Card>

          {holding && (
            <Card title="Your holding">
              <div className="grid g3">
                <div>
                  <div className="muted xs">Units</div>
                  <div style={{ fontWeight: 700 }}>{formatQuantity(holding.quantity)}</div>
                </div>
                <div>
                  <div className="muted xs">Value</div>
                  <div style={{ fontWeight: 700 }}>{formatMoney(holding.market_value, holding.currency)}</div>
                </div>
                <div>
                  <div className="muted xs">Gain or loss</div>
                  <div style={{ fontWeight: 700 }} className={Number(holding.unrealized_pl) >= 0 ? 'up' : 'dn'}>
                    {formatMoney(holding.unrealized_pl, holding.currency)}
                  </div>
                </div>
              </div>
              {Number(holding.settled_quantity) < Number(holding.quantity) && (
                <div style={{ marginTop: 14 }}>
                  <Notice kind="info" title="Some of this has not settled">
                    You can sell {formatQuantity(holding.settled_quantity)} of {formatQuantity(holding.quantity)} units
                    today. The rest settles
                    {holding.settles_on ? ` on ${holding.settles_on}` : ' shortly'}.
                  </Notice>
                </div>
              )}
            </Card>
          )}
        </div>

        <OrderTicket
          asset={a}
          quote={quote}
          trading={trading}
          market={market}
          holding={holding}
          canTrade={canTrade}
          stage={stage}
          onDone={() => {
            positions.reload()
            asset.reload()
          }}
        />
      </div>
    </div>
  )
}

function OrderTicket({ asset, quote, trading, market, holding, canTrade, stage, onDone }) {
  const [side, setSide] = useState('buy')
  const [mode, setMode] = useState('quantity') // quantity | amount
  const [type, setType] = useState('market')
  const [quantity, setQuantity] = useState('')
  const [amount, setAmount] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [extendedHours, setExtendedHours] = useState(false)

  const [estimate, setEstimate] = useState(null)
  const [estimateError, setEstimateError] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(null)
  const [error, setError] = useState(null)

  const debouncedQuantity = useDebounced(quantity)
  const debouncedAmount = useDebounced(amount)
  const debouncedLimit = useDebounced(limitPrice)

  const settled = Number(holding?.settled_quantity || 0)
  const canUseAmount = side === 'buy' && type === 'market' && trading.can_buy_by_amount

  // An amount only makes sense for a market buy, so the mode follows the side.
  useEffect(() => {
    if (!canUseAmount && mode === 'amount') setMode('quantity')
  }, [canUseAmount, mode])

  const body = () => {
    const base = { symbol: asset.symbol, side, type, time_in_force: 'day' }
    if (mode === 'amount') base.notional = debouncedAmount
    else base.quantity = debouncedQuantity
    if (type === 'limit') base.limit_price = debouncedLimit
    if (extendedHours) base.extended_hours = true
    return base
  }

  // Ask for an estimate as the numbers are typed, so the fee is never a
  // surprise at the end.
  useEffect(() => {
    const filled = mode === 'amount' ? Number(debouncedAmount) > 0 : Number(debouncedQuantity) > 0
    const limitOk = type !== 'limit' || Number(debouncedLimit) > 0
    if (!filled || !limitOk) {
      setEstimate(null)
      setEstimateError(null)
      return
    }
    let cancelled = false
    api.trade
      .estimate(body())
      .then((r) => !cancelled && (setEstimate(r.data), setEstimateError(null)))
      .catch((e) => !cancelled && (setEstimate(null), setEstimateError(e)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuantity, debouncedAmount, debouncedLimit, side, type, mode, extendedHours])

  async function submit(e) {
    e.preventDefault()
    setPlacing(true)
    setError(null)
    try {
      const res = await api.trade.place(body(), newKey())
      setPlaced(res.data)
      setQuantity('')
      setAmount('')
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setPlacing(false)
    }
  }

  if (placed) {
    return (
      <Card title="Order placed">
        <div className="stack">
          <div className="row">
            <span>
              {placed.side === 'buy' ? 'Buy' : 'Sell'} {formatQuantity(placed.quantity)} {placed.symbol}
            </span>
            <StatusPill status={placed.status} />
          </div>
          <p className="small muted">
            {placed.status === 'filled'
              ? 'This one filled straight away.'
              : 'It is with the market now. The Orders page shows it as it changes.'}
          </p>
          <div className="wrap">
            <button className="btn btn-primary" onClick={() => setPlaced(null)}>
              Place another
            </button>
            <Link className="btn btn-outline" to="/orders">
              See my orders
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card title={`${side === 'buy' ? 'Buy' : 'Sell'} ${asset.symbol}`}>
      {!canTrade && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="warn" title="Not yet">
            Your account is <StatusPill status={stage} /> so orders cannot be placed. <Link to="/open-account">Finish opening it</Link>.
          </Notice>
        </div>
      )}

      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <Segmented
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
            value={side}
            onChange={(v) => {
              setSide(v)
              setEstimate(null)
            }}
            label="Buy or sell"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <Segmented
            options={trading.order_types.map((t) => ({
              value: t,
              label: t === 'market' ? 'At market price' : 'At my price',
            }))}
            value={type}
            onChange={setType}
            label="Order type"
          />
        </div>

        {canUseAmount && (
          <div style={{ marginBottom: 14 }}>
            <Segmented
              options={[
                { value: 'quantity', label: 'By units' },
                { value: 'amount', label: 'By amount' },
              ]}
              value={mode}
              onChange={setMode}
              label="How to buy"
            />
          </div>
        )}

        {mode === 'amount' ? (
          <Field
            label={`How much do you want to spend? (${asset.currency})`}
            hint={`You will get a fraction of a share. ${asset.symbol} costs ${formatMoney(
              quote?.last_price || asset.price,
              asset.currency,
            )} per unit.`}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        ) : (
          <Field
            label="How many units?"
            hint={
              side === 'sell'
                ? `You can sell up to ${formatQuantity(settled)} settled units.`
                : trading.min_order_size
                  ? `Smallest order: ${trading.min_order_size}`
                  : undefined
            }
          >
            <input
              type="number"
              min="0"
              step={asset.fractionable ? '0.000001' : '1'}
              max={side === 'sell' ? settled || undefined : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </Field>
        )}

        {type === 'limit' && (
          <Field label={`Your price (${asset.currency} per unit)`} hint="The order waits until the market reaches it, until the end of the day.">
            <input
              type="number"
              min="0"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={String(quote?.last_price || asset.price)}
            />
          </Field>
        )}

        {market?.extended_hours && type === 'limit' && (
          <label className="check">
            <input type="checkbox" checked={extendedHours} onChange={(e) => setExtendedHours(e.target.checked)} />
            <span className="small">
              Allow this order outside normal hours. Prices move more and there are fewer buyers and sellers.
            </span>
          </label>
        )}

        {estimate && (
          <div style={{ margin: '16px 0' }}>
            <FeeRows estimate={estimate} currency={asset.currency} formatMoney={formatMoney} />
            {mode === 'amount' && (
              <p className="xs muted" style={{ marginTop: 6 }}>
                About {formatQuantity(estimate.quantity)} units at today's price.
              </p>
            )}
          </div>
        )}

        {estimateError && (
          <div style={{ margin: '12px 0' }}>
            <Notice kind="warn">{estimateError.message}</Notice>
          </div>
        )}

        <ErrorNote error={error} />

        <button
          className={`btn btn-block ${side === 'buy' ? 'btn-primary' : 'btn-outline'}`}
          disabled={placing || !canTrade || !estimate}
        >
          {placing ? 'Placing…' : side === 'buy' ? 'Buy' : 'Sell'}
        </button>

        <p className="xs muted" style={{ marginTop: 10 }}>
          {type === 'market'
            ? 'A market order is filled at the next available price, which may differ from the one shown.'
            : 'A limit order is only filled at your price or better.'}
        </p>
      </form>
    </Card>
  )
}
