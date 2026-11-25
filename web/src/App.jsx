// Routing and the shell around every screen.
//
// Three gates, in this order:
//   not signed in            -> sign in
//   signed in, no investor   -> open the account
//   investor not yet active  -> the screens load, but the order ticket says
//                               why it cannot be used
// That order matters: a customer should be able to look around while their
// identity check is still running.

import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './session.jsx'
import { Loading } from './components/ui.jsx'

import SignIn from './pages/SignIn.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Markets from './pages/Markets.jsx'
import Asset from './pages/Asset.jsx'
import Bonds from './pages/Bonds.jsx'
import BondDetail from './pages/BondDetail.jsx'
import Offers from './pages/Offers.jsx'
import OfferDetail from './pages/OfferDetail.jsx'
import Portfolios from './pages/Portfolios.jsx'
import Money from './pages/Money.jsx'
import Orders from './pages/Orders.jsx'
import Gifts from './pages/Gifts.jsx'
import AccountPage from './pages/Account.jsx'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/markets', label: 'Shares and ETFs' },
  { to: '/portfolios', label: 'Portfolios' },
  { to: '/bonds', label: 'Bonds' },
  { to: '/offers', label: 'Public offers' },
  { to: '/orders', label: 'Orders' },
  { to: '/money', label: 'Money' },
  { to: '/gifts', label: 'Gifts' },
]

export default function App() {
  const { user, loading, stage, isSampleData, signOut, health } = useSession()
  const location = useLocation()

  if (loading) {
    return (
      <div className="main" style={{ paddingTop: 48 }}>
        <Loading rows={4} />
      </div>
    )
  }

  if (!user) return <SignIn />

  // The account has to exist at Bluum before any screen has anything to show.
  if (stage === 'not_started' && location.pathname !== '/open-account') {
    return <Navigate to="/open-account" replace />
  }

  return (
    <div className="shell">
      {isSampleData && (
        <div className="sample-banner">
          <strong>Sample data.</strong> Bluum is not connected, so every price, holding and offer on this screen is
          invented. Nothing here is a real investment.
        </div>
      )}

      <header className="topbar">
        <NavLink to="/" aria-label="Dividendii Investments home">
          <img src="/brand/logo-horizontal.svg" alt="Dividendii Investments" />
        </NavLink>

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="wrap" style={{ alignItems: 'center' }}>
          <NavLink to="/account" className="small">
            {user.name || user.email}
          </NavLink>
          <button className="btn btn-quiet btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/open-account" element={<Onboarding />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/:symbol" element={<Asset />} />
          <Route path="/portfolios" element={<Portfolios />} />
          <Route path="/bonds" element={<Bonds />} />
          <Route path="/bonds/:symbol" element={<BondDetail />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/offers/:id" element={<OfferDetail />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/money" element={<Money />} />
          <Route path="/gifts" element={<Gifts />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="main small muted" style={{ paddingTop: 0 }}>
        <p>
          Dividendii Investments. Brokerage, custody and clearing are provided by Bluum Finance. Markets:{' '}
          {(health?.markets || []).join(', ') || '—'}.
        </p>
        <p style={{ marginTop: 6 }}>
          [Legal entity name, registration number, regulator and registration number, registered address and support
          hours go here. These are placeholders until the real details are supplied.]
        </p>
      </footer>
    </div>
  )
}
