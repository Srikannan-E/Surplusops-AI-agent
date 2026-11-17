import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { getApiBase, getAudit } from '../lib/api'
import { useDemoSession } from '../lib/demoSession'
import type { AuditSummary } from '../types'

function shortHash(value: string) {
  return value ? `${value.slice(0, 16)}...${value.slice(-8)}` : 'No events recorded'
}

export function AuditPage() {
  const session = useDemoSession()
  const [audit, setAudit] = useState<AuditSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setAudit(await getAudit(session.batch_id))
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load the audit package.')
    } finally {
      setLoading(false)
    }
  }, [session.batch_id])

  useEffect(() => {
    let active = true
    getAudit(session.batch_id)
      .then((loadedAudit) => {
        if (active) {
          setAudit(loadedAudit)
          setError('')
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load the audit package.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [session.batch_id])

  if (!session.intake_confirmed) {
    return (
      <section className="panel empty-workflow">
        <div className="eyebrow">07 / Audit and dashboard</div>
        <h1>Start a batch to build its audit package</h1>
        <p className="subtitle">The dashboard summarizes event records for one rescue batch.</p>
        <Link className="button" to="/chef">Go to chef intake</Link>
      </section>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">07 / Audit and dashboard</div>
          <h1>Tamper-evident audit package</h1>
          <p className="subtitle">Event-level evidence and clearly labelled estimates for batch {session.batch_id}.</p>
        </div>
        {audit && <StatusPill tone={audit.hash_chain_verified ? 'success' : 'blocked'}>{audit.hash_chain_verified ? 'HASH CHAIN VERIFIED' : 'HASH CHECK FAILED'}</StatusPill>}
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>These values are estimates, not measured impact. Meal and CO2e conversion factors below are illustrative placeholders and must be replaced with sourced factors before reporting externally.</span>
      </div>

      <div className="grid three" style={{ marginBottom: 16 }}>
        <div className="metric-card"><div className="metric-label">Surplus weight · estimate</div><div className="metric-value">{loading ? '...' : `${audit?.total_weight_kg ?? 0} kg`}</div></div>
        <div className="metric-card"><div className="metric-label">Meals · estimate</div><div className="metric-value">{loading ? '...' : audit?.estimated_meals ?? 0}</div></div>
        <div className="metric-card"><div className="metric-label">CO2e · estimate</div><div className="metric-value">{loading ? '...' : `${audit?.estimated_co2e_kg ?? 0} kg`}</div></div>
      </div>

      {audit && (
        <div className="grid two" style={{ alignItems: 'start' }}>
          <section className="panel">
            <div className="panel-head">
              <div><h2>Hash-chained event log</h2><p className="panel-description">Each event hash includes the previous event hash for this batch.</p></div>
              <StatusPill tone={audit.hash_chain_verified ? 'success' : 'blocked'}>{`${audit.events.length} EVENTS`}</StatusPill>
            </div>
            {audit.events.length === 0 ? <div className="empty-state">No events recorded yet for this batch.</div> : (
              <div className="trace-list">
                {audit.events.map((event) => (
                  <article className="trace-item hash-event" key={event.id}>
                    <span className="trace-dot" />
                    <div className="trace-copy">
                      <strong>{event.event_type.replaceAll('_', ' ')}</strong>
                      <span>{event.summary}</span>
                      <span className="small-mono">{event.status} · SHA-256 {shortHash(event.event_hash)}</span>
                    </div>
                    <span className="trace-time">{new Date(event.created_at).toLocaleTimeString()}</span>
                  </article>
                ))}
              </div>
            )}
            <div className="hash-head">Chain head: <code>{shortHash(audit.head_hash)}</code></div>
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>Impact summary</h2><p className="panel-description">Batch evidence and calculation assumptions.</p></div></div>
            <div className="food-offer compact">
              <div><span>Venue</span><strong>{session.venue_name}</strong></div>
              <div><span>Menu items</span><strong>{session.selected_dishes.join(', ')}</strong></div>
              <div><span>Photo</span><strong>{session.photo_name || 'Recorded in browser session'}</strong></div>
              <div><span>Meal estimate factor</span><strong>{`${audit.meal_estimate_assumption_kg} kg per meal`}</strong></div>
              <div><span>CO2e estimate factor</span><strong>{`${audit.co2e_estimate_factor_kg_per_kg} kg CO2e / kg surplus`}</strong></div>
              <div><span>Estimate basis</span><strong>{audit.estimate_notice}</strong></div>
            </div>
            <div className="button-row">
              <a className="button" href={`${getApiBase()}/api/demo/audit/${encodeURIComponent(session.batch_id)}/pdf`}>Download audit PDF</a>
              <button className="button secondary" onClick={() => void refresh()} type="button">Refresh audit</button>
            </div>
            <p className="footer-note">The PDF is a demo evidence package, not a certificate, official submission, or proof of regulatory compliance.</p>
          </section>
        </div>
      )}
      {error && <div className="result-banner error" role="alert">{error}</div>}
    </>
  )
}
