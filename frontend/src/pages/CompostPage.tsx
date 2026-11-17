import { useState, type FormEvent } from 'react'
import { StatusPill } from '../components/StatusPill'
import { submitPortalRequest } from '../lib/api'
import { useDemoSession } from '../lib/demoSession'
import type { PortalRecord } from '../types'

function collectionDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

export function CompostPage() {
  const session = useDemoSession()
  const [record, setRecord] = useState<PortalRecord | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('Recipient declined or safety evidence was insufficient.')
  const [date, setDate] = useState(collectionDate)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setRecord(await submitPortalRequest('reloop', {
        venue_name: session.venue_name,
        waste_stream: 'food_organics',
        estimated_weight_kg: session.estimated_weight_kg,
        collection_date: date,
        collection_window: 'Next available (simulated)',
        collection_point: session.pickup_location,
        notes: `Batch ${session.batch_id}. Fallback reason: ${reason}`,
      }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create the compost simulation request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">06 / Compost booking</div>
          <h1>Safe-disposal fallback</h1>
          <p className="subtitle">Create a Reloop-style organic collection request when rescue is blocked or recipients decline.</p>
        </div>
        <StatusPill tone="simulated">SIMULATED ADAPTER</StatusPill>
      </div>
      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>This creates a local mock request only. No booking reaches Reloop and no compost collection is arranged.</span>
      </div>
      <div className="grid two" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><div><h2>Request payload</h2><p className="panel-description">Review the details before recording the simulated fallback.</p></div></div>
          <form onSubmit={(event) => void submit(event)}>
            <div className="form-grid">
              <div className="field"><label>Batch ID</label><input readOnly value={session.batch_id} /></div>
              <div className="field"><label>Venue</label><input readOnly value={session.venue_name} /></div>
              <div className="field"><label>Estimated organics weight (kg)</label><input readOnly value={session.estimated_weight_kg} /></div>
              <div className="field"><label htmlFor="collection-date">Requested collection date</label><input id="collection-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
              <div className="field full"><label>Collection point</label><input readOnly value={session.pickup_location} /></div>
              <div className="field full"><label htmlFor="fallback-reason">Fallback reason</label><textarea id="fallback-reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></div>
            </div>
            <div className="button-row"><button className="button" disabled={busy} type="submit">{busy ? 'Recording request...' : 'Create simulated compost request'}</button></div>
          </form>
          {record && <div className="result-banner" role="status"><strong>Request recorded: {record.id}</strong><br />Status: {record.status} · SIMULATED</div>}
          {error && <div className="result-banner error" role="alert">{error}</div>}
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Fallback safeguards</h2><p className="panel-description">The disposal route is the safe outcome when human-food eligibility is not established.</p></div></div>
          <div className="trace-list">
            <article className="trace-item"><span className="trace-dot" /><div className="trace-copy"><strong>Insufficient evidence</strong><span>Do not guess or route for consumption.</span></div></article>
            <article className="trace-item"><span className="trace-dot" /><div className="trace-copy"><strong>Recipient decline / no capacity</strong><span>Proceed to approved disposal or manager escalation.</span></div></article>
            <article className="trace-item"><span className="trace-dot" /><div className="trace-copy"><strong>Log request outcome</strong><span>Retain the local request payload for the demo audit.</span></div></article>
          </div>
        </section>
      </div>
    </>
  )
}
