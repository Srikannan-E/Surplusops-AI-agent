import { useCallback, useEffect, useState } from 'react'
import { StatusPill } from '../components/StatusPill'
import { createNemaStyleRecord, getAllRecords } from '../lib/api'
import { useDemoSession } from '../lib/demoSession'
import type { PortalRecord } from '../types'

const serviceNames: Record<string, string> = {
  'uae-food-bank': 'Recipient offer',
  'registered-charity': 'Registered charity offer',
  collecteroo: 'Logistics dispatch',
  reloop: 'Compost booking',
  'ne-ma-style-report': 'ne’ma-style impact record',
}

export function PartnerRequestsPage() {
  const session = useDemoSession()
  const [records, setRecords] = useState<PortalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      const allRecords = await getAllRecords()
      setRecords(allRecords.filter((record) => record.payload.batch_id === session.batch_id))
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load simulated partner requests.')
    } finally {
      setLoading(false)
    }
  }, [session.batch_id])

  useEffect(() => {
    let active = true
    getAllRecords()
      .then((allRecords) => {
        if (active) {
          setRecords(allRecords.filter((record) => record.payload.batch_id === session.batch_id))
          setError('')
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load simulated partner requests.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [session.batch_id])

  async function createNemaRecord() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const record = await createNemaStyleRecord({
        batch_id: session.batch_id,
        estimated_weight_kg: session.estimated_weight_kg,
        estimated_co2e_kg: Number((session.estimated_weight_kg * 2.5).toFixed(2)),
        data_label: 'SIMULATED',
      })
      setNotice(`Local ne’ma-style record ${record.id} recorded. No data was sent to ne’ma.`)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record the mock impact data.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">08 / Partner requests log</div>
          <h1>One intake, many simulated systems</h1>
          <p className="subtitle">Review mock recipient offers, compost requests, logistics dispatches, and a ne’ma-style data record for the current batch.</p>
        </div>
        <StatusPill tone="simulated">ALL MOCK / NO EXTERNAL SUBMISSION</StatusPill>
      </div>
      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>No Reloop, UAE Food Bank, Deliveroo Collecteroo, ne’ma, DET, or government account is contacted by this log. The ne’ma-style record is an illustrative schema only.</span>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div><h2>{session.batch_id}</h2><p className="panel-description">Requests persisted locally by the demo backend.</p></div>
          <div className="button-row" style={{ marginTop: 0 }}>
            <StatusPill tone="neutral">{`${records.length} REQUESTS`}</StatusPill>
            <button className="button secondary" disabled={busy} onClick={() => void createNemaRecord()} type="button">{busy ? 'Recording...' : 'Add ne’ma-style record'}</button>
          </div>
        </div>
        {notice && <div className="result-banner" role="status">{notice}</div>}
        {error && <div className="result-banner error" role="alert">{error}</div>}
        {loading ? <div className="empty-state">Loading partner requests...</div> : records.length === 0 ? (
          <div className="empty-state">No partner requests are recorded yet. Run the recipient flow or create a compost request.</div>
        ) : (
          <div className="record-list">
            {records.map((record) => (
              <article className="record-item partner-request" key={record.id}>
                <span className="trace-dot" />
                <div className="record-copy">
                  <strong>{serviceNames[record.service] ?? record.service}</strong>
                  <span>{record.id} · {record.created_at ? new Date(record.created_at).toLocaleString() : ''}</span>
                  <span>{`${record.status} · ${Object.entries(record.payload).filter(([key]) => key !== 'batch_id').slice(0, 4).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ')}`}</span>
                </div>
                <StatusPill tone="simulated">SIMULATED</StatusPill>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
