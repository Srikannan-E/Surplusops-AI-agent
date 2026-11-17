import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { getEvents, recordCustody } from '../lib/api'
import { useDemoSession } from '../lib/demoSession'
import type { SimulationEvent } from '../types'

export function DriverPage() {
  const session = useDemoSession()
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [temperature, setTemperature] = useState(4)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    if (!session.batch_id) return
    setEvents(await getEvents(session.batch_id))
  }, [session.batch_id])

  useEffect(() => {
    let active = true
    getEvents(session.batch_id)
      .then((loadedEvents) => {
        if (active) setEvents(loadedEvents)
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load custody events.')
      })
    return () => {
      active = false
    }
  }, [session.batch_id])

  const pickupRecorded = events.some((event) => event.event_type === 'DRIVER_PICKUP_CONFIRMED')
  const handoverRecorded = events.some((event) => event.event_type === 'HANDOVER_CONFIRMED')

  async function submit(action: 'pickup' | 'handover') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const event = await recordCustody(session.batch_id, action === 'pickup'
        ? { action, temperature_c: temperature }
        : { action, handover_pin: pin })
      setMessage(event.summary)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record custody action.')
    } finally {
      setBusy(false)
    }
  }

  if (!session.rescue_result) {
    return (
      <section className="panel empty-workflow">
        <div className="eyebrow">04 / Driver and handover</div>
        <h1>Dispatch is not ready</h1>
        <p className="subtitle">Complete the chef intake and recipient decision before the simulated driver pickup.</p>
        <Link className="button" to="/chef">Start the rescue flow</Link>
      </section>
    )
  }

  if (session.rescue_result.selected_recipient === 'reloop') {
    return (
      <section className="panel empty-workflow">
        <div className="eyebrow">04 / Driver and handover</div>
        <h1>No food-rescue dispatch</h1>
        <p className="subtitle">This batch was routed to the simulated compost fallback. A driver handover for human consumption is not authorized.</p>
        <Link className="button" to="/compost">View compost request</Link>
      </section>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">04 / Driver and handover</div>
          <h1>Custody transfer</h1>
          <p className="subtitle">Simulate a QR pickup, record the measured handover temperature, then confirm recipient PIN at drop-off.</p>
        </div>
        <StatusPill tone={handoverRecorded ? 'success' : 'simulated'}>{handoverRecorded ? 'FINAL HANDOVER' : 'SIMULATED DRIVER'}</StatusPill>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>This demo records custody actions only. It does not dispatch a real driver or define a legal temperature threshold. Handover is intentionally irreversible after recipient PIN confirmation.</span>
      </div>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <section className="panel qr-panel">
          <div className="panel-head">
            <div>
              <h2>Pickup QR</h2>
              <p className="panel-description">The QR encodes this batch's demo custody reference.</p>
            </div>
          </div>
          <div className="qr-card">
            <QRCodeSVG value={`surplusops://custody/${session.batch_id}`} size={192} level="M" />
            <strong>{session.batch_id}</strong>
            <span>Scan simulation — no external scanner is contacted</span>
          </div>
          <div className="food-offer compact">
            <div><span>Pickup from</span><strong>{session.pickup_location}</strong></div>
            <div><span>Deliver to</span><strong>{session.rescue_result.selected_recipient.replaceAll('-', ' ')}</strong></div>
            <div><span>Offer</span><strong>{session.food_summary}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Custody checkpoints</h2>
              <p className="panel-description">Driver pickup precedes the final recipient handover lock.</p>
            </div>
          </div>
          <div className="custody-step">
            <span className={`step-number${pickupRecorded ? ' done' : ''}`}>1</span>
            <div className="step-content">
              <strong>{pickupRecorded ? 'Pickup recorded' : 'Pickup at kitchen'}</strong>
              <p>Simulate QR scan and enter the handover temperature.</p>
              {pickupRecorded ? (
                <StatusPill tone="success">RECORDED</StatusPill>
              ) : (
                <>
                  <div className="field temperature-field">
                    <label htmlFor="temperature">Measured food temperature (°C)</label>
                    <input id="temperature" type="number" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
                  </div>
                  <button className="button" disabled={busy} onClick={() => void submit('pickup')} type="button">Simulate QR pickup</button>
                </>
              )}
            </div>
          </div>
          <div className="custody-step">
            <span className={`step-number${handoverRecorded ? ' done' : ''}`}>2</span>
            <div className="step-content">
              <strong>{handoverRecorded ? 'Handover locked' : 'Recipient handover'}</strong>
              <p>The authenticated recipient shares a per-job PIN at handover.</p>
              {handoverRecorded ? (
                <StatusPill tone="success">FINAL / LOCKED</StatusPill>
              ) : (
                <>
                  <div className="field temperature-field">
                    <label htmlFor="pin">Enter recipient PIN</label>
                    <input id="pin" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} />
                  </div>
                  <button className="button" disabled={!pickupRecorded || pin.length !== 6 || busy} onClick={() => void submit('handover')} type="button">Confirm final handover</button>
                </>
              )}
            </div>
          </div>
          {message && <div className="result-banner" role="status">{message}</div>}
          {error && <div className="result-banner error" role="alert">{error}</div>}
        </section>
      </div>
    </>
  )
}
