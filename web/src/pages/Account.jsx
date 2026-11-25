// The customer's own account page, and, because this is a platform being
// built, what state the setup is in: which mode Bluum is in, whether webhooks
// are arriving, what is still missing.

import { api, formatDateTime } from '../api.js'
import { useLoad, useSession } from '../session.jsx'
import { Card, Loading, Empty, Notice, StatusPill, Pill } from '../components/ui.jsx'

export default function AccountPage() {
  const { user, account, health, stage, isSampleData, refresh } = useSession()
  const documents = useLoad(() => api.account.kycDocuments())
  const webhooks = useLoad(() => api.webhooks.recent())

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Your account</h1>
        <p>{user.email}</p>
      </div>

      <div className="grid g2">
        <Card title="You">
          <div className="kv">
            <span className="muted">Name</span>
            <span>{user.name || '—'}</span>
          </div>
          <div className="kv">
            <span className="muted">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="kv">
            <span className="muted">Phone</span>
            <span>{user.phone || '—'}</span>
          </div>
          <div className="kv">
            <span className="muted">Country</span>
            <span>{String(user.country || '—').toUpperCase()}</span>
          </div>
          <div className="kv">
            <span className="muted">Account status</span>
            <StatusPill status={stage} />
          </div>
          {account?.investor?.id && (
            <div className="kv">
              <span className="muted">Bluum reference</span>
              <span className="xs">{account.investor.id}</span>
            </div>
          )}
          <button className="linkbtn" onClick={refresh} style={{ marginTop: 10 }}>
            Check my status again
          </button>
        </Card>

        <Card title="Your documents">
          {documents.loading ? (
            <Loading rows={2} />
          ) : !(documents.data || []).length ? (
            <Empty title="None sent">Identity documents you send appear here.</Empty>
          ) : (
            <div className="stack-sm">
              {(documents.data || []).map((d) => (
                <div className="row" key={d.id}>
                  <span>
                    {d.kind.replace(/_/g, ' ')}
                    <div className="xs muted">
                      {d.original_name} · {formatDateTime(d.created_at)}
                    </div>
                  </span>
                  {d.kept_on_disk ? <Pill kind="warn">Kept</Pill> : <Pill kind="good">Passed on, not kept</Pill>}
                </div>
              ))}
            </div>
          )}
          <p className="xs muted" style={{ marginTop: 12 }}>
            Documents are sent to Bluum Finance for checking. Dividendii keeps a record that it happened, not the file.
          </p>
        </Card>
      </div>

      {/* The build's own state. Useful while the platform is being set up and
          worth removing, or putting behind a staff login, before launch. */}
      <Card title="Platform setup">
        {isSampleData && (
          <div style={{ marginBottom: 16 }}>
            <Notice kind="warn" title="Bluum is not connected">
              Everything on these screens is sample data. Put the sandbox key in the server's settings to connect it.
            </Notice>
          </div>
        )}

        <div className="grid g2">
          <div>
            <div className="kv">
              <span className="muted">Bluum mode</span>
              <span>{health?.bluum_mode === 'mock' ? 'sample data' : health?.bluum_mode}</span>
            </div>
            <div className="kv">
              <span className="muted">Bluum environment</span>
              <span>{health?.bluum_env || '—'}</span>
            </div>
            <div className="kv">
              <span className="muted">Database</span>
              <span>{health?.database || '—'}</span>
            </div>
            <div className="kv">
              <span className="muted">Email</span>
              <span>{health?.mail_mode === 'console' ? 'printed to the server log' : health?.mail_mode}</span>
            </div>
          </div>
          <div>
            <div className="kv">
              <span className="muted">Markets switched on</span>
              <span>{(health?.markets || []).join(', ') || '—'}</span>
            </div>
            <div className="kv">
              <span className="muted">Identity documents</span>
              <span>{health?.kyc_storage === 'forward-only' ? 'not kept' : 'kept on the server'}</span>
            </div>
            <div className="kv">
              <span className="muted">Webhook secret</span>
              <span>{health?.webhook_secret_set ? 'set' : 'not set'}</span>
            </div>
            <div className="kv">
              <span className="muted">Events subscribed</span>
              <span>{health?.subscribed_events ?? '—'}</span>
            </div>
          </div>
        </div>

        {(health?.warnings || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Notice kind="bad" title="Settings that need attention">
              <ul style={{ margin: '6px 0 0 18px' }}>
                {health.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Notice>
          </div>
        )}
      </Card>

      <Card title="Webhooks received" flush>
        {webhooks.loading ? (
          <div className="card-body">
            <Loading rows={2} />
          </div>
        ) : !(webhooks.data || []).length ? (
          <Empty title="None yet">
            Bluum sends an event whenever something happens. None have arrived, which is expected until the webhook URL
            is registered with Bluum.
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Arrived</th>
                <th>Signature</th>
                <th>Handled</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.data.map((e) => (
                <tr key={e.id}>
                  <td>{e.event_type}</td>
                  <td className="small muted">{formatDateTime(e.received_at)}</td>
                  <td>{e.signature_ok ? <Pill kind="good">Good</Pill> : <Pill kind="bad">Refused</Pill>}</td>
                  <td>
                    {e.error ? <Pill kind="bad">Failed</Pill> : e.processed_at ? <Pill kind="good">Yes</Pill> : <Pill kind="quiet">No</Pill>}
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
