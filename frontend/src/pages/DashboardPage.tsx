import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { getEvents, revokeRescue } from '../lib/api'
import { saveDemoSession, useDemoSession } from '../lib/demoSession'
import type { SimulationEvent } from '../types'

function remainingMinutes(startedAt: string, originalMinutes: number) {
  if (!startedAt) return originalMinutes
  const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime()) / 60000
  return Math.max(0, Math.ceil(originalMinutes - elapsed))
}

function statusForStep(
  kind: 'policy' | 'recipient' | 'dispatch' | 'handover',
  events: SimulationEvent[],
) {
  const types = events.map((event) => event.event_type)
  if (kind === 'policy') {
    if (types.includes('DETERMINISTIC_SAFETY_GATE')) return 'RECORDED'
    if (types.includes('CHEF_INTAKE_CONFIRMED')) return 'AWAITING POLICY'
  }
  if (kind === 'recipient' && types.some((type) => type.includes('OFFER'))) return 'OFFERED'
  if (kind === 'dispatch' && types.includes('RESCUE_PLAN_COMPLETE')) return 'DISPATCHED'
  if (kind === 'dispatch' && types.includes('RESCUE_REVOKED')) return 'REVOKED / COMPOST'
  if (kind === 'dispatch' && types.includes('SAFE_DISPOSAL_FALLBACK')) return 'COMPOST FALLBACK'
  if (kind === 'handover' && types.includes('HANDOVER_CONFIRMED')) return 'FINAL / LOCKED'
  if (kind === 'handover' && types.includes('DRIVER_PICKUP_CONFIRMED')) return 'IN CUSTODY'
  return 'PENDING'
}

export function DashboardPage() {
  const session = useDemoSession()
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [now, setNow] = useState(Date.now)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeMessage, setRevokeMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadEvents = async () => {
      try {
        const latest = await getEvents(session.batch_id)
        if (active) {
          setEvents(latest)
          setError('')
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Could not load workflow events.')
        }
      }
    }
    void loadEvents()
    const timer = window.setInterval(() => void loadEvents(), 5000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.clearInterval(clock)
    }
  }, [session.batch_id])

  const secondsElapsed = session.intake_confirmed_at
    ? Math.max(0, Math.floor((now - new Date(session.intake_confirmed_at).getTime()) / 1000))
    : 0
  const secondsLeft = Math.max(0, session.remaining_safe_minutes * 60 - secondsElapsed)
  const minutesLeft = remainingMinutes(session.intake_confirmed_at, session.remaining_safe_minutes)
  const countdown = `${String(Math.floor(secondsLeft / 3600)).padStart(2, '0')}:${String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
  const handoverLocked = events.some((event) => event.event_type === 'HANDOVER_CONFIRMED')
  const rescueRevoked = events.some((event) => event.event_type === 'RESCUE_REVOKED')

  async function revokeCurrentRescue() {
    setRevoking(true)
    setError('')
    try {
      const result = await revokeRescue(session.batch_id, 'Human operator revoked authorization; route to compost.')
      saveDemoSession({ ...session, rescue_result: result })
      setConfirmRevoke(false)
      setRevokeMessage('Rescue authorization revoked. A simulated compost fallback was recorded; driver pickup is blocked.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not revoke the rescue.')
    } finally {
      setRevoking(false)
    }
  }

  const steps = [
    { title: 'Human intake + policy gate', kind: 'policy' as const, detail: 'PIC confirmation, safe-window rule, deterministic policy' },
    { title: 'Recipient offer ladder', kind: 'recipient' as const, detail: 'Accept / decline, then simulated community recipient' },
    { title: 'Dispatch or compost fallback', kind: 'dispatch' as const, detail: 'Mock logistics request or safe-disposal adapter' },
    { title: 'Custody handover', kind: 'handover' as const, detail: 'Driver temperature, QR pickup, recipient PIN final lock' },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">SurplusOps / Agent command centre</div>
          <h1>Rescue orchestration</h1>
          <p className="subtitle">The agent proposes and coordinates; deterministic demo policy gates eligibility; authorized people confirm physical facts and custody.</p>
        </div>
        <StatusPill tone="simulated">SIMULATION MODE</StatusPill>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>All partners, route outcomes, timer settings, and impact calculations are simulated. No live government, charity, courier, or waste-provider service is connected.</span>
      </div>

      <div className="command-summary">
        <section className="panel countdown-panel">
          <div className="eyebrow">Remaining demo-safe window</div>
          <div className={`countdown-large${minutesLeft <= 30 ? ' warning' : ''}`} aria-live="polite">{countdown}</div>
          <p className="panel-description">Timer is illustrative and based on the entered demo window; not a legal food-safety determination.</p>
          <span className="small-mono">BATCH {session.batch_id}</span>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Decision trace</h2><p className="panel-description">Latest persisted events in the rescue plan.</p></div><StatusPill tone="neutral">{`${events.length} EVENTS`}</StatusPill></div>
          {!session.intake_confirmed ? (
            <div className="empty-workflow-inline">
              <p>Begin with one photo and the chef's two confirmations.</p>
              <Link className="button" to="/chef">Open chef intake</Link>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-workflow-inline">
              <p>Intake is confirmed. Send the offer to the simulated recipient portal to start the decision ladder.</p>
              <Link className="button" to="/recipient">Open recipient offer</Link>
            </div>
          ) : (
            <div className="trace-list compact-trace">
              {events.map((event) => (
                <article className="trace-item" key={event.id}>
                  <span className="trace-dot" />
                  <div className="trace-copy">
                    <strong>{event.event_type.replaceAll('_', ' ')}</strong>
                    <span>{event.summary}</span>
                    <span className="small-mono">{event.status} · {event.event_hash.slice(0, 12)}</span>
                  </div>
                  <span className="trace-time">{new Date(event.created_at).toLocaleTimeString()}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 16, alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><div><h2>Rescue ladder</h2><p className="panel-description">Ordered stages with persisted status.</p></div></div>
          <div className="ladder-list">
            {steps.map((step, index) => {
              const status = statusForStep(step.kind, events)
              return (
                <article className="ladder-step" key={step.title}>
                  <span className={`ladder-number${status !== 'PENDING' ? ' done' : ''}`}>{index + 1}</span>
                  <div className="ladder-content"><strong>{step.title}</strong><span>{step.detail}</span></div>
                  <StatusPill tone={status === 'PENDING' ? 'neutral' : status.includes('FALLBACK') ? 'blocked' : 'success'}>{status}</StatusPill>
                </article>
              )
            })}
          </div>
          <div className="button-row">
            {!session.intake_confirmed && <Link className="button" to="/chef">Start intake</Link>}
            {session.intake_confirmed && !session.rescue_result && <Link className="button" to="/recipient">Open recipient offer</Link>}
            {session.rescue_result && session.rescue_result.selected_recipient !== 'reloop' && <Link className="button" to="/driver">Continue to driver handover</Link>}
            {session.rescue_result?.selected_recipient === 'reloop' && <Link className="button" to="/compost">View compost fallback</Link>}
            <Link className="button secondary" to="/organiser">Organiser escalation</Link>
          </div>
          {session.rescue_result && session.rescue_result.selected_recipient !== 'reloop' && !handoverLocked && !rescueRevoked && (
            <div className="revoke-panel">
              <strong>Reversible before final physical handover</strong>
              <span>Revoking will block driver pickup and create a compost fallback record.</span>
              {confirmRevoke ? (
                <div className="button-row">
                  <button className="button danger-button" disabled={revoking} onClick={() => void revokeCurrentRescue()} type="button">
                    {revoking ? 'Revoking...' : 'Confirm revoke and fallback'}
                  </button>
                  <button className="button secondary" disabled={revoking} onClick={() => setConfirmRevoke(false)} type="button">Keep rescue active</button>
                </div>
              ) : (
                <button className="button secondary" onClick={() => setConfirmRevoke(true)} type="button">Revoke rescue</button>
              )}
            </div>
          )}
          {revokeMessage && <div className="result-banner" role="status">{revokeMessage}</div>}
          {handoverLocked && <div className="notice final-lock-note" style={{ marginTop: 14 }}>Final handover is locked. The physical custody transfer cannot be revoked digitally.</div>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>Safeguards and current batch</h2><p className="panel-description">Visible controls for the judge walkthrough.</p></div></div>
          <div className="safeguard-list">
            <div><span className={session.untouched_confirmed ? 'safeguard-check' : 'safeguard-wait'}>{session.untouched_confirmed ? '✓' : '!'}</span><span><strong>Human PIC confirmation</strong><small>{session.untouched_confirmed ? 'Unserved status confirmed' : 'Not confirmed — route blocked'}</small></span></div>
            <div><span className="safeguard-check">✓</span><span><strong>Policy separated from AI</strong><small>Demo eligibility gate is deterministic</small></span></div>
            <div><span className="safeguard-check">✓</span><span><strong>Human custody confirmation</strong><small>Temperature entry and final recipient PIN</small></span></div>
            <div><span className="safeguard-check">✓</span><span><strong>Final handover lock</strong><small>Post-handover state cannot be revoked</small></span></div>
          </div>
          <div className="divider" />
          <div className="food-offer compact">
            <div><span>Menu</span><strong>{session.food_summary}</strong></div>
            <div><span>Allergens (venue menu)</span><strong>{session.allergens_from_menu.join(', ') || 'None listed'}</strong></div>
            <div><span>Halal status (venue-provided)</span><strong>{session.halal_status.replaceAll('_', ' ')}</strong></div>
            <div><span>Estimated weight</span><strong>{`${session.estimated_weight_kg} kg`}</strong></div>
          </div>
          <div className="button-row">
            <Link className="button secondary" to="/compost">Compost fallback</Link>
            <Link className="button secondary" to="/audit">Open audit package</Link>
            <Link className="button secondary" to="/requests">Partner request log</Link>
          </div>
        </section>
      </div>
      {error && <div className="result-banner error" role="alert">{error}</div>}
    </>
  )
}
