// Opening the account: details, agreements, identity documents.
//
// Partner-managed KYC means Dividendii collects the documents and passes them
// to Bluum. The screen says plainly what happens to a file, because the
// customer is handing over an ID.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../session.jsx'
import { Card, Field, ErrorNote, Notice, DisclosureList, StatusPill, Loading } from '../components/ui.jsx'

const COUNTRIES = [
  { code: 'ng', name: 'Nigeria' },
  { code: 'ke', name: 'Kenya' },
  { code: 'us', name: 'United States' },
  { code: 'gh', name: 'Ghana' },
  { code: 'za', name: 'South Africa' },
  { code: 'other', name: 'Somewhere else' },
]

const STEPS = ['Your details', 'Agreements', 'Identity', 'Done']

export default function Onboarding() {
  const { user, account, refresh, stage } = useSession()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [details, setDetails] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    country: 'ng',
    phone: '',
  })
  const [disclosures, setDisclosures] = useState(null)
  const [accepted, setAccepted] = useState({})
  const [requirements, setRequirements] = useState(null)
  const [files, setFiles] = useState({})

  // Pick up where the customer left off rather than starting again.
  useEffect(() => {
    if (!user?.has_investor) return setStep(0)
    if (account?.outstanding_disclosures?.length) return setStep(1)
    if (stage === 'onboarding' || stage === 'awaiting_documents') return setStep(2)
    return setStep(3)
  }, [user?.has_investor, account?.outstanding_disclosures?.length, stage])

  useEffect(() => {
    if (step !== 1) return
    api.account
      .outstanding()
      .then((r) => setDisclosures(r.data))
      .catch(setError)
  }, [step])

  useEffect(() => {
    if (step !== 2) return
    api.account
      .kycRequirements()
      .then((r) => setRequirements(r.data))
      .catch(() => setRequirements([]))
  }, [step])

  async function submitDetails(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.account.openInvestor(details)
      await refresh()
      setStep(1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function submitDisclosures(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.account.accept(
        disclosures.map((d) => ({ disclosure_id: d.id, version: d.version })),
      )
      await refresh()
      setStep(2)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function submitDocuments(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      for (const [field, file] of Object.entries(files)) if (file) form.append(field, file)
      await api.account.submitKyc(form)
      await refresh()
      setStep(3)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const allAccepted = disclosures?.length ? disclosures.every((d) => accepted[d.id]) : false

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-head">
        <h1>Open your account</h1>
        <p>This is handled by Bluum Finance, who hold the licence and the custody of your investments.</p>
      </div>

      <ol className="steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            {i < step ? '✓ ' : ''}
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Your details">
          <form onSubmit={submitDetails}>
            <div className="grid g2">
              <Field label="First name">
                <input
                  value={details.first_name}
                  onChange={(e) => setDetails({ ...details, first_name: e.target.value })}
                  required
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last name">
                <input
                  value={details.last_name}
                  onChange={(e) => setDetails({ ...details, last_name: e.target.value })}
                  required
                  autoComplete="family-name"
                />
              </Field>
            </div>

            <div className="grid g2">
              <Field label="Date of birth">
                <input
                  type="date"
                  value={details.date_of_birth}
                  onChange={(e) => setDetails({ ...details, date_of_birth: e.target.value })}
                  required
                />
              </Field>
              <Field label="Phone number" hint="For your account records. Codes are sent by email.">
                <input
                  type="tel"
                  value={details.phone}
                  onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                  autoComplete="tel"
                />
              </Field>
            </div>

            <Field label="Country you live in" hint="This decides which markets and offers are open to you.">
              <select value={details.country} onChange={(e) => setDetails({ ...details, country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <ErrorNote error={error} />

            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Opening…' : 'Continue'}
            </button>
          </form>
        </Card>
      )}

      {step === 1 && (
        <Card title="Agreements">
          {!disclosures ? (
            <Loading rows={5} />
          ) : disclosures.length === 0 ? (
            <div className="stack">
              <Notice kind="good" title="Nothing left to sign">
                Your agreements are already in place.
              </Notice>
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={submitDisclosures}>
              <p className="small muted" style={{ marginBottom: 16 }}>
                These are shown exactly as Bluum Finance provides them. Please read each one.
              </p>
              <DisclosureList
                disclosures={disclosures}
                accepted={accepted}
                onToggle={(id) => setAccepted((a) => ({ ...a, [id]: !a[id] }))}
              />
              <ErrorNote error={error} />
              <button className="btn btn-primary" disabled={busy || !allAccepted} style={{ marginTop: 16 }}>
                {busy ? 'Recording…' : 'I agree, continue'}
              </button>
            </form>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="Prove your identity">
          <form onSubmit={submitDocuments}>
            <div style={{ marginBottom: 20 }}>
              <Notice kind="info" title="What happens to your documents">
                Each file is passed straight to Bluum Finance for checking and is not kept by Dividendii. Only a record
                that it was sent, its name and its size, is stored.
              </Notice>
            </div>

            {requirements === null ? (
              <Loading rows={3} />
            ) : (
              <>
                <Field label="Government photo ID" hint="Passport, driver's licence or national ID card. JPG, PNG or PDF.">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic,application/pdf"
                    onChange={(e) => setFiles({ ...files, government_id: e.target.files[0] })}
                    required
                  />
                </Field>

                <Field label="Proof of address" hint="A utility bill or bank statement from the last three months.">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic,application/pdf"
                    onChange={(e) => setFiles({ ...files, proof_of_address: e.target.files[0] })}
                  />
                </Field>
              </>
            )}

            <ErrorNote error={error} />

            <button className="btn btn-primary" disabled={busy || !files.government_id}>
              {busy ? 'Sending…' : 'Send for checking'}
            </button>
          </form>
        </Card>
      )}

      {step === 3 && (
        <Card title="Where your account stands">
          <div className="stack">
            <div className="row">
              <span>Account status</span>
              <StatusPill status={stage} />
            </div>

            {stage === 'active' ? (
              <Notice kind="good" title="Your account is open">
                You can add money and start investing.
              </Notice>
            ) : stage === 'under_review' ? (
              <Notice kind="warn" title="Your documents are being checked">
                This usually takes a short while. You can look around in the meantime, but you cannot trade yet.
              </Notice>
            ) : stage === 'awaiting_documents' ? (
              <Notice kind="warn" title="Something else is needed">
                Bluum has asked for another document.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}>
                    Send another document
                  </button>
                </div>
              </Notice>
            ) : stage === 'declined' ? (
              <Notice kind="bad" title="This account could not be opened">
                Please contact support.
              </Notice>
            ) : (
              <Notice kind="info" title="Still being set up">
                We are waiting on Bluum. This page updates when the status changes.
              </Notice>
            )}

            <div className="wrap">
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                Go to my account
              </button>
              <button className="btn btn-outline" onClick={refresh}>
                Check again
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
