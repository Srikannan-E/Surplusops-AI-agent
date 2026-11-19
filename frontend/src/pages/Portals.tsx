import { useEffect, useState, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getRecipientHandoverDetails } from '../lib/api'
import { useJobSync } from '../lib/useJobSync'
import type { DemoJob } from '../types'
import './JobConsole.css'

function usePortalClock(job: DemoJob | null) {
  const [remaining, setRemaining] = useState(job?.remaining_safe_seconds ?? 0)
  const remainingSeconds = job?.remaining_safe_seconds
  const clockSpeed = job?.clock_speed
  const serverTime = job?.server_time
  useEffect(() => {
    if (remainingSeconds === undefined || clockSpeed === undefined || !serverTime) return
    const update = () => {
      const elapsed = Math.max(0, (Date.now() - new Date(serverTime).getTime()) / 1000)
      setRemaining(Math.max(0, remainingSeconds - Math.floor(elapsed * clockSpeed)))
    }
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [remainingSeconds, clockSpeed, serverTime])
  return remaining
}

function clockText(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function PortalFrame({ children, error, reconnecting }: { children: ReactNode; error: string; reconnecting: boolean }) {
  const { job, refresh } = useJobSync()
  return <main className="portal-screen">
    <header className="portal-header"><a className="portal-brand" href="/"><span className="brand-symbol">S</span><span>SurplusOps</span></a><div className="portal-header-badges">{job?.clock_speed === 60 && <span className="clock-badge">Sped up</span>}<span className="simulated-tag">SIMULATED PARTNER</span></div></header>
    {reconnecting && <div className="portal-reconnect" role="status">◌ Reconnecting to live job…</div>}
    {error && <div className="portal-error" role="alert"><span>{error}</span>{!reconnecting && <button className="button button-outline" onClick={() => void refresh()} type="button">Retry</button>}</div>}
    {children}
    <footer className="portal-footer">Demo portal · no external service contacted</footer>
  </main>
}

function PortalLoading({ title }: { title: string }) {
  return <div className="portal-loading" aria-live="polite"><span className="spinner" />Connecting to active rescue job…<small>{title}</small></div>
}

export function RecipientPortalPage() {
  return <FoodBankPortalPage />
}

export function FoodBankPortalPage() {
  const [tab, setTab] = useState<'inbox' | 'collection'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'collection' ? 'collection' : 'inbox',
  )
  return <div className="portal-tabs">
    <nav aria-label="Food Bank portal sections" className="portal-tab-list">
      <button aria-pressed={tab === 'inbox'} className="simple-secondary" onClick={() => setTab('inbox')} type="button">Heads-up & offers</button>
      <button aria-pressed={tab === 'collection'} className="simple-secondary" onClick={() => setTab('collection')} type="button">Collection</button>
    </nav>
    {tab === 'inbox' ? <RecipientPortalContent targetTier={1} /> : <DriverPortalContent />}
  </div>
}

export function CharityPortalPage() {
  return <RecipientPortalContent targetTier={2} />
}

function RecipientPortalContent({ targetTier }: { targetTier: 1 | 2 }) {
  const { job, loading, error, reconnecting, command, pending } = useJobSync()
  const [reason, setReason] = useState('')
  const [acceptedSelection, setAcceptedSelection] = useState<{ batchId: string; dishes: string[] } | null>(null)
  const [acceptedWeight, setAcceptedWeight] = useState('')
  const [handoverDetails, setHandoverDetails] = useState<{ pickup_code: string; delivery_pin: string } | null>(null)
  const [pinError, setPinError] = useState('')
  const remaining = usePortalClock(job)
  const batchId = job?.batch_id
  const canRetrievePin = Boolean(job && ['ACCEPTED', 'PICKED_UP'].includes(job.status))
  useEffect(() => {
    if (!batchId || !canRetrievePin || handoverDetails) return
    let active = true
    getRecipientHandoverDetails(batchId).then((details) => {
      if (active) setHandoverDetails(details)
    }).catch((cause: unknown) => {
      if (active) setPinError(cause instanceof Error ? cause.message : 'Could not load the handover PIN.')
    })
    return () => { active = false }
  }, [batchId, canRetrievePin, handoverDetails])
  if (loading || !job) return <PortalFrame error={error} reconnecting={reconnecting}><PortalLoading title="Recipient portal" /></PortalFrame>
  const awaiting = job.status === 'OFFERING' && job.current_tier === targetTier
  const delivered = job.events.some((event) => event.type === 'DELIVERY_CONFIRMED')
  const accepted = ['ACCEPTED', 'PICKED_UP'].includes(job.status) && job.selected_recipient
  const currentRecipient = targetTier === 1 ? 'Simulated Food Bank' : 'Registered charity'
  const presetAccepts = job.scenario === 'nothing_left' || job.scenario === 'happy_path'
    || ((job.scenario === 'bigger_expected' || job.scenario === 'decline_then_recover') && targetTier === 2)
  const presetReason = targetTier === 1 ? 'No capacity' : 'Pickup window too short'
  const presetLabel = presetAccepts ? 'Accept' : 'Decline'
  const selectedDishes = acceptedSelection?.batchId === job.batch_id ? acceptedSelection.dishes : job.dishes
  const acknowledgeHeadsUp = () => command('SLOT_ACKNOWLEDGED', 'recipient', { response: 'acknowledged' })
  const submit = async (type: 'OFFER_ACCEPTED' | 'OFFER_DECLINED') => {
    if (type === 'OFFER_DECLINED') {
      await command(type, 'recipient', { reason })
    } else {
      const partial = selectedDishes.length !== job.dishes.length
      await command(type, 'recipient', {
        accepted_items: selectedDishes,
        ...(partial ? { accepted_weight_kg: Number(acceptedWeight) } : {}),
      })
    }
    setReason('')
  }
  const applyPreset = () => command(
    presetAccepts ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
    'recipient',
    presetAccepts ? {
      accepted_items: selectedDishes,
      ...(selectedDishes.length !== job.dishes.length ? { accepted_weight_kg: Number(acceptedWeight) } : {}),
    } : { reason: presetReason },
  )
  return <PortalFrame error={error} reconnecting={reconnecting}>
    <div className="portal-content">
      <div className="portal-heading"><span className="step-kicker">{targetTier === 1 ? 'FOOD BANK · SIMULATED' : 'REGISTERED CHARITY · SIMULATED'}</span><h1>{accepted ? 'Offer accepted' : awaiting ? `Can you take ${job.estimated_weight_kg} kg of ${job.dishes.join(' and ')}?` : 'Waiting for an offer'}</h1><p>{job.batch_id}</p></div>
      {targetTier === 1 && job.status === 'DRAFT' && job.heads_up_sent ? <section className="offer-card">
        <div className="offer-partner"><span className="partner-avatar">♡</span><span><strong>Possible surplus heads-up</strong><small>SIMULATED PARTNER · non-binding estimate</small></span><span className="offer-live">STANDBY</span></div>
        <div className="offer-data"><div><span>Event</span><strong>{job.event_name}</strong></div><div><span>Expected size</span><strong>{job.donation_intent?.size_class ?? 'Not stated'} · Estimate</strong></div></div>
        <p className="portal-caveat">This is not a confirmed donation or a guaranteed collection. Actual food details follow end-of-service confirmation.</p>
        <button className="button button-primary portal-wide" disabled={pending || job.slot_acknowledged} onClick={() => void acknowledgeHeadsUp()} type="button">{job.slot_acknowledged ? 'Standby acknowledged' : 'Acknowledge standby'}</button>
      </section> : awaiting ? <section className="offer-card">
        <div className="offer-partner"><span className="partner-avatar">♡</span><span><strong>{currentRecipient}</strong><small>Simulated partner</small></span><span className="offer-live">OFFER OPEN</span></div>
        <div className="offer-dishes"><span>PICKUP</span><strong>Pickup by {new Date(new Date(job.server_time).getTime() + 20 * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · demo estimate</strong></div>
        <fieldset className="dish-acceptance"><legend>Choose dishes you can accept</legend>
          {job.dishes.map((dish) => <label key={dish}><input checked={selectedDishes.includes(dish)} onChange={(event) => {
            const next = event.target.checked
              ? [...selectedDishes, dish]
              : selectedDishes.filter((item) => item !== dish)
            setAcceptedSelection({ batchId: job.batch_id, dishes: next })
          }} type="checkbox" />{dish}</label>)}
        </fieldset>
        {selectedDishes.length > 0 && selectedDishes.length < job.dishes.length && <label className="portal-field">Estimated weight for accepted dishes (kg)<input inputMode="decimal" min="0.1" max={job.estimated_weight_kg} step="0.1" type="number" value={acceptedWeight} onChange={(event) => setAcceptedWeight(event.target.value)} /></label>}
        <div className="offer-data"><div><span>Allergens</span><strong>{job.allergens.join(', ') || 'None listed'}</strong></div><div><span>Halal status</span><strong>{job.halal_status}</strong></div><div><span>Time left to place it safely</span><strong className={remaining < 900 ? 'urgent-text' : ''}>{clockText(remaining)}</strong></div></div>
        <p className="portal-caveat">Dietary details are venue-provided, not independently verified. An offer is not food-safety certification.</p>
        <div className="preset-response"><span>Story response: {presetLabel}{presetAccepts ? '' : ` · ${presetReason}`}</span><button className="text-button" disabled={pending} onClick={() => void applyPreset()} type="button">Use story response</button></div>
        <button className="button button-primary portal-wide" disabled={pending || selectedDishes.length === 0 || (selectedDishes.length !== job.dishes.length && (!acceptedWeight || Number(acceptedWeight) <= 0 || Number(acceptedWeight) > job.estimated_weight_kg))} onClick={() => void submit('OFFER_ACCEPTED')} type="button">Yes, we'll take it</button>
        <div className="decline-block"><span>Choose a reason if you can't take it</span><div className="reason-chips">{['No capacity', 'Pickup window too short', 'Food type not accepted'].map((value) => <button aria-pressed={reason === value} className={`reason-chip${reason === value ? ' selected' : ''}`} key={value} onClick={() => setReason(value)} type="button">{value}</button>)}</div><button className="button button-outline portal-wide" disabled={pending || !reason} onClick={() => void submit('OFFER_DECLINED')} type="button">No</button></div>
      </section>       : delivered ? <section className="portal-state-card success-state"><span className="state-symbol">✓</span><h2>Food received</h2><p>The delivery PIN was confirmed and the handover is complete.</p></section>
        : accepted && targetTier === job.current_tier ? <section className="portal-state-card success-state"><span className="state-symbol">✓</span><h2>Waiting for driver</h2><p>{currentRecipient} accepted the offer. Keep the food ready for the simulated pickup scan.</p><span className="status-pill status-accepted">{job.status}</span>{handoverDetails && <div className="recipient-pin"><p>Share these per-job credentials with the assigned driver only.</p><QRCodeSVG aria-label="Pickup code for the driver" value={handoverDetails.pickup_code} size={128} /><span>Recipient pickup code · 8 digits</span><strong className="recipient-pin-code">{handoverDetails.pickup_code}</strong><span>Driver enters this delivery PIN at handover · 6 digits</span><strong className="recipient-pin-code">{handoverDetails.delivery_pin}</strong></div>}{pinError && <p className="inline-error" role="alert">{pinError}</p>}</section>
        : job.status === 'COMPOST_REQUESTED' || job.cancelled ? <section className="portal-state-card stop-state"><span className="state-symbol">!</span><h2>Offer cancelled</h2><p>Do not collect or consume. The batch has been stopped and routed away from human consumption.</p></section>
          : <section className="portal-state-card"><span className="state-symbol">◌</span><h2>{job.heads_up_sent && !job.end_of_service_outcome ? 'Waiting for end of service' : 'No open offer'}</h2><p>{job.heads_up_sent ? 'The heads-up is only an estimate. A confirmed offer will appear after the chef reports actual surplus.' : 'An incoming offer will appear here when the chef confirms intake on the command console.'}</p></section>}
    </div>
  </PortalFrame>
}

export function DriverPortalPage() {
  return <DriverPortalContent />
}

function DriverPortalContent() {
  const { job, loading, error, reconnecting, command, pending } = useJobSync()
  const [pickupCode, setPickupCode] = useState('')
  const [temperature, setTemperature] = useState('4')
  const [pin, setPin] = useState('')
  const [formError, setFormError] = useState('')
  const remaining = usePortalClock(job)
  if (loading || !job) return <PortalFrame error={error} reconnecting={reconnecting}><PortalLoading title="Driver portal" /></PortalFrame>
  const pickedUp = job.status === 'PICKED_UP'
  const delivered = job.events.some((event) => event.type === 'DELIVERY_CONFIRMED')
  const stopped = job.cancelled || ['COMPOST_REQUESTED', 'HUMAN_TAKEOVER'].includes(job.status)
  const pickup = async () => {
    setFormError('')
    try {
      await command('PICKUP_CONFIRMED', 'driver', { pickup_code: pickupCode.trim(), temperature_c: Number(temperature) })
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Pickup could not be recorded.')
    }
  }
  const handover = async () => {
    setFormError('')
    try {
      await command('DELIVERY_CONFIRMED', 'driver', { pin })
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Delivery could not be confirmed.')
    }
  }
  return <PortalFrame error={error} reconnecting={reconnecting}>
    <div className="portal-content">
      <div className="portal-heading"><span className="step-kicker">SIMULATED LOGISTICS</span><h1>Driver handover</h1><p>{job.batch_id} · {job.venue_name}</p></div>
      <section className="driver-card">
        {stopped ? <div className="stop-state driver-stop"><span className="stop-icon">STOP</span><h2>Do not collect or consume</h2><p>This job was cancelled or diverted from human consumption. Follow the updated command-console status.</p></div>
          : delivered ? <div className="portal-state-card success-state"><span className="state-symbol">✓</span><h2>Handover complete</h2><p>Delivery PIN recorded. Physical handover is locked.</p></div>
            : <><div className="driver-countdown"><span>Time left to place it safely</span><strong className={remaining < 900 ? 'urgent-text' : ''}>{clockText(remaining)}</strong>{job.clock_speed === 60 && <small>Sped up</small>}</div>
              {job.status === 'ACCEPTED' ? <div className="driver-step"><h2>Step 1 · Pickup</h2><p>Ask the recipient to show their one-time pickup code. Enter it to record custody.</p><label className="portal-field">Recipient pickup code<input autoComplete="off" inputMode="numeric" maxLength={8} value={pickupCode} onChange={(event) => setPickupCode(event.target.value.replace(/\D/g, ''))} placeholder="8-digit code" /></label><label className="portal-field">Recorded temperature (°C)<input inputMode="decimal" type="number" value={temperature} onChange={(event) => setTemperature(event.target.value)} /></label><p className="portal-caveat">Recorded at pickup only; this is not live temperature monitoring.</p><button className="button button-primary portal-wide" disabled={pending || pickupCode.length !== 8} onClick={() => void pickup()} type="button">Verify code & record pickup</button></div>
                : pickedUp ? <div className="driver-step"><h2>Step 2 · Delivery</h2><p>Ask the recipient for the one-time delivery PIN at handover.</p><label className="portal-field">Recipient delivery PIN<input autoComplete="off" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="6-digit PIN" /></label><button className="button button-primary portal-wide" disabled={pending || pin.length !== 6} onClick={() => void handover()} type="button">Verify PIN & confirm delivery</button></div>
                  : <div className="portal-state-card"><span className="state-symbol">◌</span><h2>Waiting for an accepted offer</h2><p>A pickup QR and code will be available after a recipient accepts.</p></div>}
            </>}
        {formError && <p className="inline-error" role="alert">{formError}</p>}
      </section>
    </div>
  </PortalFrame>
}

export function ComposterPortalPage() {
  return <ComposterPortalContent />
}

function ComposterPortalContent() {
  const { job, loading, error, reconnecting, command, pending } = useJobSync()
  const [verificationCode, setVerificationCode] = useState('')
  const [formError, setFormError] = useState('')
  const confirmed = job?.events.some((event) => event.type === 'COMPOST_CONFIRMED') ?? false
  if (loading || !job) return <PortalFrame error={error} reconnecting={reconnecting}><PortalLoading title="Composter portal" /></PortalFrame>
  const requested = job.status === 'COMPOST_REQUESTED'
  return <PortalFrame error={error} reconnecting={reconnecting}>
    <div className="portal-content">
      <div className="portal-heading"><span className="step-kicker">ORGANIC WASTE FALLBACK</span><h1>{requested ? 'Confirm collection' : 'Compost portal'}</h1><p>{job.batch_id}</p></div>
      {requested ? <section className="offer-card compost-card"><div className="offer-partner"><span className="partner-avatar">♻</span><span><strong>Simulated compost collection</strong><small>Simulated partner</small></span><span className="offer-live">BOOKING REQUESTED</span></div><div className="offer-dishes"><span>FOOD STREAM</span><strong>{job.dishes.join(' and ')}</strong></div><div className="offer-data"><div><span>Estimated weight</span><strong>{job.estimated_weight_kg} kg</strong></div><div><span>Collection point</span><strong>{job.pickup_location}</strong></div><div><span>Request reference</span><strong>{job.batch_id}</strong></div></div><p className="portal-caveat">Ask the kitchen for the one-time collection code shown on their console. Enter it to confirm pickup.</p><label className="portal-field">Kitchen collection code<input autoComplete="off" inputMode="numeric" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /></label><button className="button button-primary portal-wide" disabled={pending || verificationCode.length !== 6} onClick={() => {
        setFormError('')
        void command('COMPOST_CONFIRMED', 'composter', { verification_code: verificationCode }).then(() => setVerificationCode('')).catch((cause: unknown) => setFormError(cause instanceof Error ? cause.message : 'Collection code verification failed.'))
      }} type="button">Verify code & confirm collection</button>{formError && <p className="inline-error" role="alert">{formError}</p>}</section>
        : confirmed ? <section className="portal-state-card success-state"><span className="state-symbol">✓</span><h2>Booking confirmed</h2><p>The simulated compost outcome is recorded in the tamper-evident audit package.</p></section>
          : <section className="portal-state-card"><span className="state-symbol">◌</span><h2>No compost request yet</h2><p>If recipient routing is unsafe or unsuccessful, the agent will create a compost fallback request here.</p></section>}
    </div>
  </PortalFrame>
}
