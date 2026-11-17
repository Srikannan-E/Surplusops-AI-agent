import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { runRescue } from '../lib/api'
import { readDemoSession, rescuePayload, saveDemoSession, useDemoSession } from '../lib/demoSession'

export function RecipientPage() {
  const navigate = useNavigate()
  const current = useDemoSession()
  const [response, setResponse] = useState<'accept' | 'decline' | null>(
    () => current.rescue_result ? current.food_bank_response : null,
  )
  const [reason, setReason] = useState(current.food_bank_decline_reason)
  const [backupResponse, setBackupResponse] = useState<'accept' | 'decline'>(current.cold_storage_response)
  const [backupReason, setBackupReason] = useState(current.cold_storage_decline_reason)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(() => Boolean(current.rescue_result))

  async function submitResponse() {
    if (!response || (response === 'decline' && !reason.trim())) return
    const updated = {
      ...readDemoSession(),
      food_bank_response: response,
      food_bank_decline_reason: response === 'decline' ? reason.trim() : '',
      cold_storage_response: backupResponse,
      cold_storage_decline_reason: backupResponse === 'decline'
        ? backupReason.trim() || 'No recipient capacity was available.'
        : '',
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await runRescue(rescuePayload(updated))
      saveDemoSession({ ...updated, rescue_result: result })
      setCompleted(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record the simulated recipient response.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!current.intake_confirmed) {
    return (
      <section className="panel empty-workflow">
        <div className="eyebrow">02 / Recipient portal</div>
        <h1>No offer to review yet</h1>
        <p className="subtitle">Complete the chef intake first. This screen acts as the simulated recipient and does not contact a charity, bank, or fridge operator.</p>
        <Link className="button" to="/chef">Go to chef intake</Link>
      </section>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">02 / Recipient portal</div>
          <h1>Review a rescue offer</h1>
          <p className="subtitle">This simulated recipient can accept or decline with a reason. A decline triggers the next ladder step automatically.</p>
        </div>
        <StatusPill tone="simulated">SIMULATED PARTNER</StatusPill>
      </div>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <section className="panel offer-card">
          <div className="offer-top">
            <div>
              <span className="small-mono">{current.batch_id}</span>
              <h2>{current.venue_name}</h2>
              <p className="panel-description">{current.event_name}</p>
            </div>
            <StatusPill tone={current.rescue_result ? 'neutral' : 'success'}>
              {current.rescue_result ? `${current.food_bank_response.toUpperCase()} / RECORDED` : 'OFFER OPEN'}
            </StatusPill>
          </div>
          <div className="food-offer">
            <div><span>Dish offer</span><strong>{current.food_summary}</strong></div>
            <div><span>Allergens from venue menu</span><strong>{current.allergens_from_menu.length ? current.allergens_from_menu.join(', ') : 'None listed'}</strong></div>
            <div><span>Halal status</span><strong>{current.halal_status.replaceAll('_', ' ')}</strong></div>
            <div><span>Estimated weight</span><strong>{current.estimated_weight_kg} kg</strong></div>
            <div><span>Pickup ETA</span><strong>{current.pickup_eta_minutes} min (demo estimate)</strong></div>
            <div><span>Collection deadline</span><strong>{new Date(current.collection_deadline).toLocaleString()}</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 16 }}>
            <span aria-hidden="true">!</span>
            <span>Dietary metadata is provided by the venue. It is not independently verified by this demo.</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Recipient decision</h2>
              <p className="panel-description">A simulated acceptance creates a dispatch; a decline moves to the backup recipient.</p>
            </div>
          </div>
          {completed && <div className="notice" style={{ marginBottom: 14 }}>This batch already has a recorded rescue outcome. Start a new batch to simulate another response.</div>}
          <div className="decision-buttons">
            <button aria-pressed={response === 'accept'} className={`decision-button accept${response === 'accept' ? ' active' : ''}`} disabled={completed} onClick={() => setResponse('accept')} type="button">Accept offer</button>
            <button aria-pressed={response === 'decline'} className={`decision-button decline${response === 'decline' ? ' active' : ''}`} disabled={completed} onClick={() => setResponse('decline')} type="button">Decline offer</button>
          </div>
          {response === 'decline' && (
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="decline-reason">Reason for decline (required)</label>
              <select disabled={completed} id="decline-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="">Choose a reason</option>
                <option value="No capacity">No capacity</option>
                <option value="Pickup window too short">Pickup window too short</option>
                <option value="Food type not accepted">Food type not accepted</option>
                <option value="Other operational reason">Other operational reason</option>
              </select>
            </div>
          )}
          {response === 'decline' && (
            <div className="replan-box">
              <strong>Next ladder step: community recipient</strong>
              <span>Backup response</span>
              <select disabled={completed} value={backupResponse} onChange={(event) => setBackupResponse(event.target.value as 'accept' | 'decline')}>
                <option value="accept">Accept — dispatch is simulated</option>
                <option value="decline">Decline — use compost fallback</option>
              </select>
              {backupResponse === 'decline' && (
                <input aria-label="Backup recipient decline reason" disabled={completed} placeholder="Reason (optional)" value={backupReason} onChange={(event) => setBackupReason(event.target.value)} />
              )}
            </div>
          )}
          <div className="button-row">
            <button className="button" disabled={!response || (response === 'decline' && !reason.trim()) || submitting || completed} onClick={() => void submitResponse()} type="button">
              {submitting ? 'Recording response...' : 'Confirm response and re-plan'}
            </button>
          </div>
          {completed && (
            <div className="result-banner" role="status">
              <strong>{current.rescue_result?.outcome.replaceAll('-', ' ') ?? 'Rescue plan recorded'}.</strong> Open the command centre for the decision trace and countdown.
              <div className="button-row"><button className="button secondary" onClick={() => navigate('/command')} type="button">View command centre</button></div>
            </div>
          )}
          {error && <div className="result-banner error" role="alert">{error}</div>}
          <p className="footer-note">Acceptance is a simulated offer response, not a physical handover or food-safety certification.</p>
        </section>
      </div>
    </>
  )
}
