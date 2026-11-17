import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { recordOrganiserTakeover } from '../lib/api'
import { useDemoSession } from '../lib/demoSession'

export function OrganiserPage() {
  const session = useDemoSession()
  const [seconds, setSeconds] = useState(30 * 60)
  const [running, setRunning] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const [takenOver, setTakenOver] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          setRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  function startTimer() {
    setRunning(true)
  }

  async function takeOver() {
    setTakingOver(true)
    setError('')
    try {
      await recordOrganiserTakeover(
        session.batch_id,
        'Hotel organiser took control at the 30-minute escalation threshold.',
      )
      setTakenOver(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record organiser takeover.')
    } finally {
      setTakingOver(false)
    }
  }

  const displayTime = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  if (!session.intake_confirmed) {
    return (
      <section className="panel empty-workflow">
        <div className="eyebrow">05 / Organiser oversight</div>
        <h1>No active rescue</h1>
        <p className="subtitle">Start the chef intake to create a batch for organiser escalation.</p>
        <Link className="button" to="/chef">Go to chef intake</Link>
      </section>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">05 / Organiser oversight</div>
          <h1>Escalation and human takeover</h1>
          <p className="subtitle">A demo alert is raised at the 30-minute mark. The organiser can take control instead of leaving the agent to continue.</p>
        </div>
        <StatusPill tone={takenOver ? 'success' : 'blocked'}>{takenOver ? 'HUMAN IN CONTROL' : 'ESCALATION ACTIVE'}</StatusPill>
      </div>

      <section className="panel escalation-panel">
        <div className="escalation-header">
          <div>
            <span className="small-mono">BATCH {session.batch_id}</span>
            <h2>{session.venue_name} · {session.event_name}</h2>
          </div>
          <StatusPill tone="blocked">30 MINUTES LEFT / DEMO ALERT</StatusPill>
        </div>
        <div className="countdown-large" aria-live="polite">{displayTime}</div>
        <p className="panel-description">Illustrative escalation countdown. It is not a food safety window or a live timer from a venue system.</p>
        <div className="button-row">
          <button className="button secondary" disabled={running || seconds === 0 || takenOver} onClick={startTimer} type="button">
            {running ? 'Demo countdown running...' : 'Start / resume demo countdown'}
          </button>
          <button className="button danger-button" disabled={takingOver || takenOver} onClick={() => void takeOver()} type="button">
            {takingOver ? 'Recording takeover...' : takenOver ? 'Takeover recorded' : 'Take over rescue now'}
          </button>
        </div>
        {takenOver && <div className="result-banner">Human organiser takeover is recorded in the tamper-evident event chain. Automated actions should pause pending a human decision.</div>}
        {error && <div className="result-banner error" role="alert">{error}</div>}
      </section>
    </>
  )
}
