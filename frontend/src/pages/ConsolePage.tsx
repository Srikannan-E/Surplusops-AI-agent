import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  analyzeEventLeftovers,
  createFoodEvent,
  getCompostVerificationCode,
  extractEventMenu,
  getApiBase,
  getFoodEvents,
  selectFoodEvent,
} from '../lib/api'
import { useJobSync } from '../lib/useJobSync'
import type { DemoJob, EventAnalysis, EventMenuItem, FoodEvent, JobEvent } from '../types'
import './JobConsole.css'

const scenarioLabels = {
  happy_path: 'Everything goes smoothly',
  decline_then_recover: 'A kitchen says no',
  nobody_accepts: 'Nobody can take it',
} as const

type ConsoleState = 'start' | 'working' | 'done'
type SpeechResult = { transcript: string }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: { results: { [index: number]: { [index: number]: SpeechResult }; length: number } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

function getConsoleState(job: DemoJob): ConsoleState {
  if (job.status === 'DRAFT') return 'start'
  if (job.status === 'SEALED') return 'done'
  return 'working'
}

function getOutcome(job: DemoJob) {
  if (job.events.some((event) => event.type === 'COMPOST_CONFIRMED')) return 'compost'
  if (job.events.some((event) => event.type === 'DELIVERY_CONFIRMED')) return 'delivered'
  return 'human'
}

function useRemaining(job: DemoJob) {
  const [remaining, setRemaining] = useState(job.remaining_safe_seconds)
  const remainingSeconds = job.remaining_safe_seconds
  const clockSpeed = job.clock_speed
  const serverTime = job.server_time
  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, (Date.now() - new Date(serverTime).getTime()) / 1000)
      setRemaining(Math.max(0, remainingSeconds - Math.floor(elapsed * clockSpeed)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [remainingSeconds, clockSpeed, serverTime])
  return remaining
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function isDuplicateEvent(event: JobEvent, index: number, events: JobEvent[]) {
  if (event.type === 'SCENARIO_SELECTED') return true
  return events.findIndex((candidate) => candidate.type === event.type && candidate.summary === event.summary) !== index
}

function PortalLinks({ showQr }: { showQr: boolean }) {
  const links = [
    ['Recipient', '/portal/recipient'],
    ['Driver', '/portal/driver'],
    ['Composter', '/portal/composter'],
  ] as const
  return <div className="simple-portal-links">{links.map(([label, path]) => <div className="simple-portal-link" key={path}>
    {showQr && <QRCodeSVG aria-label={`${label} portal QR code`} value={`${window.location.origin}${path}`} size={64} />}
    <span>{label}</span><a href={path} target="_blank" rel="noreferrer">Open</a>
  </div>)}</div>
}

function HallContextLink({ event }: { event: FoodEvent }) {
  const url = `${window.location.origin}/?hall=${encodeURIComponent(event.id)}`
  return <div className="hall-context-link">
    <QRCodeSVG aria-label={`${event.name} hall QR code`} value={url} size={72} />
    <span>Hall QR · {event.venue}</span>
    <a href={url} target="_blank" rel="noreferrer">Open chef link</a>
  </div>
}

function ConsoleHeader({ job, reconnecting, onDemo }: { job: DemoJob; reconnecting: boolean; onDemo: () => void }) {
  return <header className="simple-header">
    <a className="simple-brand" href="/" aria-label="SurplusOps home">SurplusOps</a>
    <div className="simple-header-actions">
      {reconnecting && <span className="simple-reconnect" role="status">Reconnecting</span>}
      {job.clock_speed === 60 && <span className="simple-speed" role="status">Sped up</span>}
      <button className="simple-secondary" onClick={onDemo} type="button">Demo controls</button>
    </div>
  </header>
}

function IntakeStepper({ active }: { active: 'Event' | 'Photos' | 'Check' | 'Place' }) {
  const steps = ['Event', 'Photos', 'Check', 'Place'] as const
  const activeIndex = steps.indexOf(active)
  return <ol className="intake-stepper" aria-label="Rescue progress">{steps.map((label, index) => <li className={index === activeIndex ? 'current' : index < activeIndex ? 'complete' : ''} key={label}>
    <span aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span>{label}
  </li>)}</ol>
}

function StartView({ job }: { job: DemoJob }) {
  const { command, pending } = useJobSync()
  const photoInput = useRef<HTMLInputElement>(null)
  const menuInput = useRef<HTMLInputElement>(null)
  const [events, setEvents] = useState<FoodEvent[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<FoodEvent | null>(null)
  const [managerSelectedEvent, setManagerSelectedEvent] = useState<FoodEvent | null>(null)
  const [step, setStep] = useState<'event' | 'photos' | 'check'>('photos')
  const [photos, setPhotos] = useState<File[]>([])
  const [analysis, setAnalysis] = useState<EventAnalysis | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [looksRight, setLooksRight] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const [listening, setListening] = useState(false)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const [managerMode, setManagerMode] = useState(false)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [eventName, setEventName] = useState('')
  const [menuItems, setMenuItems] = useState<EventMenuItem[]>([])
  const [menuFiles, setMenuFiles] = useState<File[]>([])
  const [menuExtractionProvider, setMenuExtractionProvider] = useState('')
  const [menuExtractionFallback, setMenuExtractionFallback] = useState(false)
  const [menuConfirmed, setMenuConfirmed] = useState(false)
  const [menuNote, setMenuNote] = useState('')
  const [menuError, setMenuError] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    const loadEvents = async () => {
      try {
        const available = await getFoodEvents()
        if (!active) return
        setEvents(available)
        const params = new URLSearchParams(window.location.search)
        const requestedId = params.get('hall') ?? params.get('event_id')
        const matchingEvent = requestedId
          ? available.find((item) => item.id === requestedId) ?? null
          : job.event_id
            ? available.find((item) => item.id === job.event_id) ?? null
            : available.length === 1 ? available[0] : null
        if (matchingEvent) {
          if (job.event_id !== matchingEvent.id) await selectFoodEvent(matchingEvent.id)
          if (active) {
            setSelectedEvent(matchingEvent)
            setStep('photos')
          }
        } else {
          setStep('event')
        }
      } catch (cause) {
        if (active) setFormError(cause instanceof Error ? cause.message : 'Could not load the venue menu.')
      } finally {
        if (active) setEventsLoaded(true)
      }
    }
    void loadEvents()
    return () => {
      active = false
      recognition.current?.stop()
    }
  }, [job.event_id])

  const analyzePhotos = async (files: File[]) => {
    if (!selectedEvent) return
    if (!files.length || files.length > 3) {
      setFormError('Choose between one and three leftover photos.')
      return
    }
    setPhotos(files)
    setAnalysis(null)
    setLooksRight(false)
    setBusy(true)
    setFormError('')
    try {
      let result: EventAnalysis | null = null
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
          reader.readAsDataURL(file)
        })
        result = await analyzeEventLeftovers(selectedEvent.id, {
          photo_name: file.name,
          photo_base64: dataUrl.split(',')[1] ?? '',
          served_status: 'untouched',
          voice_note: voiceNote.trim(),
        })
      }
      if (!result) throw new Error('Choose at least one leftover photo.')
      setAnalysis(result)
      setSelected(result.approved_items)
      setStep('check')
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Photo analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length) await analyzePhotos(files)
  }

  const startVoiceNote = (update: (value: string) => void = (value) => setVoiceNote((current) => `${current} ${value}`.trim())) => {
    if (!window.isSecureContext) {
      setFormError('Voice input needs a secure HTTPS page on this device. You can type a short note instead.')
      return
    }
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition
      ?? (window as SpeechWindow).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setFormError('Voice dictation is not available in this browser. You can type a short note instead.')
      return
    }
    const instance = new SpeechRecognition()
    instance.lang = navigator.language || 'en'
    instance.interimResults = false
    instance.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? '').join(' ')
      update(transcript)
    }
    instance.onerror = () => {
      setListening(false)
      setFormError('Voice note was not captured. You can type a short note instead.')
    }
    instance.onend = () => setListening(false)
    recognition.current = instance
    setListening(true)
    try {
      instance.start()
    } catch {
      setListening(false)
      setFormError('Could not access voice input. Allow microphone access or type a short note instead.')
    }
  }

  const extractMenuFiles = async (files: File[], notes: string) => {
    if (!files.length) return
    setBusy(true)
    setMenuError('')
    try {
      const extracted: Array<Awaited<ReturnType<typeof extractEventMenu>>> = []
      for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase()
        const contentType = file.type || (
          extension === 'pdf' ? 'application/pdf'
            : extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : extension === 'csv' ? 'text/csv' : 'application/octet-stream'
        )
        const isText = contentType.startsWith('text/')
        let text = notes
        let fileBase64 = ''
        if (isText) text = `${await file.text()}\n${notes}`
        else {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result ?? ''))
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
            reader.readAsDataURL(file)
          })
          fileBase64 = dataUrl.split(',')[1] ?? ''
        }
        extracted.push(await extractEventMenu({
          text,
          filename: file.name,
          content_type: contentType,
          file_base64: fileBase64,
        }))
      }
      const uniqueItems = new Map<string, EventMenuItem>()
      extracted.flatMap((result) => result.items).forEach((item) => {
        const key = item.name.trim().toLocaleLowerCase()
        if (!uniqueItems.has(key)) uniqueItems.set(key, { ...item, confirmed: false })
      })
      const items = [...uniqueItems.values()]
      setMenuItems(items)
      setMenuConfirmed(false)
      setMenuExtractionProvider([...new Set(extracted.map((result) => result.model.provider))].join(', '))
      setMenuExtractionFallback(extracted.some((result) => result.model.fallback))
      if (!items.length) {
        const imageOnly = files.every((file) => file.type.startsWith('image/'))
        setMenuError(imageOnly
          ? 'No dishes were found in these images. Image menu reading needs GEMINI_API_KEY; otherwise upload a text-based PDF/Word menu.'
          : 'No dishes were found. Try a clearer menu file or add a short voice note.')
      }
    } catch (cause) {
      setMenuError(cause instanceof Error ? cause.message : 'Menu extraction failed.')
    } finally {
      setBusy(false)
    }
  }

  const chooseMenuFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!files.length) return
    if (files.length > 3) {
      setMenuError('Upload one menu document or up to three menu images.')
      return
    }
    setMenuFiles(files)
    setEventName((files[0]?.name ?? 'Event menu').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    setMenuConfirmed(false)
    await extractMenuFiles(files, menuNote)
  }

  const saveEvent = async () => {
    if (!menuFiles.length || !menuItems.length || !menuConfirmed) {
      setMenuError('Upload a menu, review the dietary details and confirm them to save.')
      return
    }
    setBusy(true)
    try {
      const now = new Date()
      const event = await createFoodEvent({
        id: `event-${crypto.randomUUID()}`,
        name: eventName.trim() || 'Event menu',
        type: 'Event menu',
        venue: 'Venue details to confirm',
        start: now.toISOString(),
        end: new Date(now.getTime() + 4 * 60 * 60_000).toISOString(),
        guest_count: 1,
        contact: 'Venue manager',
        status: 'planned',
        menu_items: menuItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          allergens: item.allergens,
          halal: item.halal,
          diet_tags: item.diet_tags,
          planned_qty: item.planned_qty,
          holding: item.holding,
          serving: item.serving,
          source: item.source,
          confirmed: true,
        })),
      })
      setEvents((current) => [event, ...current])
      setManagerSelectedEvent(event)
      setShowNewEvent(false)
      setMenuError('')
    } catch (cause) {
      setMenuError(cause instanceof Error ? cause.message : 'Could not save this event.')
    } finally {
      setBusy(false)
    }
  }

  const chooseEvent = async (event: FoodEvent) => {
    setBusy(true)
    try {
      await selectFoodEvent(event.id)
      setSelectedEvent(event)
      setStep('photos')
      setManagerMode(false)
      setFormError('')
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not select this event.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!selected.length || !looksRight || !analysis || !selectedEvent) {
      setFormError(!looksRight ? 'Confirm the proposed dishes before continuing.' : 'No menu dishes were identified. Retake the photo or route to compost.')
      return
    }
    try {
      await command('CHEF_CONFIRMED', 'chef', {
        dishes: selected,
        photo_name: photos.map((photo) => photo.name).join(', ') || 'leftover-photo',
        untouched_confirmed: true,
        estimated_weight_kg: job.estimated_weight_kg,
      })
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The rescue could not be started.')
    }
  }

  const managerView = <section className="simple-intake">
    <div className="simple-intake-title">
      <p className="simple-eyebrow">DAYTIME SETUP</p>
      <h1>Dish library</h1>
      <p>Prepare menus and hall QR codes before service. Chefs won’t see setup fields during a rescue.</p>
    </div>
    {managerSelectedEvent ? <section className="manager-event-detail">
      <button className="simple-text-button" onClick={() => setManagerSelectedEvent(null)} type="button">← All menus</button>
      <h2>{managerSelectedEvent.name}</h2>
      <p>{managerSelectedEvent.venue} · {managerSelectedEvent.menu_items.length} dishes</p>
      <HallContextLink event={managerSelectedEvent} />
      <h3>Menu for this hall</h3>
      <ul className="manager-menu-list">{managerSelectedEvent.menu_items.map((item) => <li key={item.id}>
        <strong>{item.name}</strong><span>{item.allergens.length ? `Allergens: ${item.allergens.join(', ')}` : 'No allergens listed'} · Halal: {item.halal}</span>
      </li>)}</ul>
      <button className="simple-primary" disabled={busy} onClick={() => void chooseEvent(managerSelectedEvent)} type="button">
        {busy ? 'Opening chef intake…' : 'Open chef intake'}
      </button>
    </section> : !showNewEvent ? <>
      {events.length ? <div className="event-list">{events.map((event) => <div className="event-setup-card" key={event.id}>
        <button className="event-card" onClick={() => setManagerSelectedEvent(event)} type="button">
          <strong>{event.name}</strong><span>{event.venue}</span><small>{event.menu_items.length} dishes · View menu & hall QR</small>
        </button>
        <HallContextLink event={event} />
      </div>)}</div> : <p className="simple-hint">No saved menus yet. Add a menu here before the next service.</p>}
      <button className="simple-primary" onClick={() => {
        setMenuFiles([])
        setMenuItems([])
        setMenuNote('')
        setMenuExtractionProvider('')
        setMenuExtractionFallback(false)
        setMenuConfirmed(false)
        setMenuError('')
        setShowNewEvent(true)
      }} type="button">+ Add event menu</button>
    </> : <div className="new-event-form menu-upload-panel">
      <h2>{eventName || 'Add a menu'}</h2>
      <p>Upload a PDF, Word document, CSV, or up to three menu photos. We’ll draft the dishes and dietary details for a quick review.</p>
      <input ref={menuInput} accept=".csv,.pdf,.docx,image/*" className="visually-hidden" multiple onChange={(event) => void chooseMenuFiles(event)} type="file" />
      <button className="simple-primary" disabled={busy} onClick={() => menuInput.current?.click()} type="button">{busy ? 'Reading menu…' : menuFiles.length ? 'Replace menu files' : 'Upload menu files'}</button>
      {menuFiles.length > 0 && <ul aria-label="Uploaded menu files" className="menu-file-list">{menuFiles.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
      {menuExtractionProvider && <p className="ai-source-label" role="status">
        Menu reader: {menuExtractionProvider} · {menuExtractionFallback ? 'fallback draft' : 'AI-assisted draft'}
      </p>}
      {menuItems.length > 0 && <div className="menu-dietary-summary">
        <h3>Review menu and venue-declared details</h3>
        {menuItems.map((item, index) => <fieldset key={item.id}>
          <strong>{item.name}</strong>
          <label>Allergens<input aria-label={`${item.name} allergens`} value={item.allergens.join(', ')} onChange={(event) => setMenuItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, allergens: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) } : entry))} /></label>
          <label>Halal status<select aria-label={`${item.name} halal`} value={item.halal} onChange={(event) => setMenuItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, halal: event.target.value as EventMenuItem['halal'] } : entry))}><option value="unknown">Not confirmed</option><option value="yes">Venue declared halal</option><option value="no">Venue declared not halal</option></select></label>
        </fieldset>)}
        <label className="leftover-note">Optional voice or text update<textarea className="menu-note" onChange={(event) => setMenuNote(event.target.value)} placeholder="For example: all dishes are halal; the biryani contains nuts." rows={2} value={menuNote} /></label>
        <div className="intake-actions">
          <button className="simple-secondary" disabled={busy} onClick={() => startVoiceNote((transcript) => setMenuNote((current) => `${current} ${transcript}`.trim()))} type="button">{listening ? 'Listening…' : 'Speak update'}</button>
          <button className="simple-secondary" disabled={busy} onClick={() => void extractMenuFiles(menuFiles, menuNote)} type="button">Apply update</button>
        </div>
        <label className="menu-confirm-row"><input checked={menuConfirmed} onChange={(event) => setMenuConfirmed(event.target.checked)} type="checkbox" /> I confirm these dishes and venue-declared allergens/halal details.</label>
      </div>}
      {menuError && <p className="simple-error" role="alert">{menuError}</p>}
      <div className="intake-actions"><button className="simple-secondary" onClick={() => setShowNewEvent(false)} type="button">Cancel</button><button className="simple-primary" disabled={busy || !menuItems.length} onClick={() => void saveEvent()} type="button">{busy ? 'Saving…' : 'Create event card'}</button></div>
    </div>}
    {formError && <p className="simple-error" role="alert">{formError}</p>}
  </section>

  const quickView = <section className="simple-intake">
      {!selectedEvent && <div className="simple-intake-title"><p className="simple-eyebrow">HALL MENU</p><h1>{eventsLoaded ? 'Choose this hall’s menu' : 'Loading hall menu…'}</h1><p>Scan the hall QR code next time to skip this step.</p></div>}
      {selectedEvent && <div className="simple-intake-title"><p className="simple-eyebrow">CHEF INTAKE · {selectedEvent.venue}</p><h1>Food left over?</h1><p>Add one to three photos. A short description or voice note is optional.</p></div>}
      {!selectedEvent && events.length > 0 && <div className="event-list">{events.map((event) => <button className="event-card" disabled={busy} key={event.id} onClick={() => void chooseEvent(event)} type="button">
        <strong>{event.name}</strong><span>{event.venue}</span>
      </button>)}</div>}
      <input ref={photoInput} accept="image/*" capture="environment" className="visually-hidden" multiple onChange={(event) => void choosePhoto(event)} type="file" />
      {selectedEvent && <button className="simple-primary photo-button" disabled={busy} onClick={() => photoInput.current?.click()} type="button">{busy ? 'Checking the photos…' : 'Add 1–3 leftover photos'}</button>}
      {selectedEvent && <>
        {photos.length > 0 && <p className="simple-hint">{photos.length} leftover photo{photos.length === 1 ? '' : 's'} selected</p>}
        <label className="leftover-note" htmlFor="voice-note">Short description (optional)<textarea id="voice-note" placeholder="For example: three full biryani trays, kept hot in the kitchen." rows={2} value={voiceNote} onChange={(event) => setVoiceNote(event.target.value)} /></label>
        <button className="simple-secondary" disabled={listening} onClick={() => startVoiceNote()} type="button">{listening ? 'Listening…' : 'Add description by voice'}</button>
      </>}
      {formError && <p className="simple-error" role="alert">{formError}</p>}
      {!eventsLoaded && <p role="status">Connecting to the venue menu…</p>}
    </section>;

  const verifyView = analysis ? <section className="simple-intake" aria-label="Verify detected food">
      <div className="simple-intake-title"><p className="simple-eyebrow">PHOTO CHECK</p><h1>{looksRight ? 'One safety check' : 'Does this look right?'}</h1></div>
      <p className="ai-source-label">Photo reader: {analysis.model.provider} · {analysis.model.fallback ? 'fallback draft' : 'AI-assisted draft'}</p>
      <div className="detected-food-list">
        {analysis.observations.filter((item) => item.detected).map((item) => <div className="detected-food-item" key={item.menu_item}>
          <span aria-hidden="true">✓</span><strong>{item.menu_item}</strong><small>{item.tray_count_min}–{item.tray_count_max} trays · AI estimate</small>
        </div>)}
      </div>
      {analysis.unmatched.length > 0 && <p className="simple-safety-note">Couldn’t match: {analysis.unmatched.join(', ')}. These won’t be offered.</p>}
      {analysis.model.fallback && <p className="simple-hint">Photo check is a draft. Please verify what you see.</p>}
      {!looksRight ? <>
        <button className="simple-primary" disabled={selected.length === 0} onClick={() => setLooksRight(true)} type="button">Looks right</button>
        <button className="simple-secondary" onClick={() => { setAnalysis(null); setStep('photos'); setFormError('') }} type="button">Retake photo</button>
      </> : <>
        <p className="safety-confirm-copy">Only food kept in the back-of-house and never served can go to people.</p>
        <button className="simple-primary" disabled={pending || selected.length === 0} onClick={() => void submit()} type="button">{pending ? 'Finding a safe home…' : '100% Unserved Back-of-House'}</button>
        <button className="simple-secondary" disabled={pending} onClick={() => void command('CHEF_CONFIRMED', 'chef', {
          dishes: selected,
          photo_name: photos.map((photo) => photo.name).join(', ') || 'leftover-photo',
          untouched_confirmed: false,
          estimated_weight_kg: job.estimated_weight_kg,
        })} type="button">Not sure / some served — compost only</button>
      </>}
      {formError && <p className="simple-error" role="alert">{formError}</p>}
    </section> : null;

  return <main className="simple-main start-view">
    <div className="frontline-tools">
      {selectedEvent && !managerMode && <span className="event-context">Menu loaded · {selectedEvent.name}</span>}
      <button className="simple-text-button" onClick={() => setManagerMode((active) => !active)} type="button">
        {managerMode ? 'Back to chef intake' : 'Dish library setup'}
      </button>
    </div>
    {managerMode ? managerView : step === 'check' ? verifyView : quickView}
  </main>
}

function getEarlierAttempts(job: DemoJob) {
  return Object.values(job.rungs).flatMap((rung) => rung.attempts
    .filter((attempt) => attempt.state === 'declined')
    .map((attempt) => `${attempt.recipient} said no${attempt.reason ? ` (${attempt.reason})` : ''}`))
}

function Journey({ job }: { job: DemoJob }) {
  const labels = ['Asking', 'Pickup', 'Delivered']
  const current = job.status === 'PICKED_UP' ? 2 : job.status === 'ACCEPTED' ? 1 : job.status === 'SEALED' ? 3 : 0
  return <ol className="simple-journey" aria-label="Rescue progress">{labels.map((label, index) => <li className={index < current ? 'complete' : index === current ? 'current' : ''} key={label}>
    <span aria-hidden="true">{index < current ? '✓' : index + 1}</span><strong>{label}</strong>
  </li>)}</ol>
}

function ChecksPanel({ job }: { job: DemoJob }) {
  const has = (eventType: string) => job.events.some((event) => event.type === eventType)
  const checks = [
    ['Kitchen confirmed untouched status', job.untouched_confirmed],
    ['A recipient accepted', ['ACCEPTED', 'PICKED_UP', 'SEALED'].includes(job.status) && getOutcome(job) === 'delivered'],
    ['Pickup recorded', has('PICKUP_CONFIRMED')],
    ['Handover confirmed', has('DELIVERY_CONFIRMED')],
    ['Record sealed', has('AUDIT_SEALED')],
  ] as const
  return <section className="details-content"><h3>Checks</h3><ul className="details-checks">{checks.map(([label, complete]) => <li key={label}><span aria-hidden="true">{complete ? '✓' : '○'}</span><span>{label}</span><strong>{complete ? 'Done' : 'Not yet'}</strong></li>)}</ul></section>
}

function TimelinePanel({ events }: { events: JobEvent[] }) {
  const timeline = events.filter((event, index) => !isDuplicateEvent(event, index, events))
  return <section className="details-content"><h3>Timeline</h3><ol className="details-timeline">{[...timeline].reverse().map((event) => <li key={`${event.id}-${event.seq}`}>
    <time dateTime={event.ts}>{new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    <span>{event.summary}</span>{event.simulated && <small className="simple-simulated">SIMULATED</small>}
  </li>)}</ol></section>
}

function RecordPanel({ job }: { job: DemoJob }) {
  const audit = job.audit
  const partnerRequests = job.events.filter((event) => {
    const name = event.payload.name
    return event.type === 'TOOL_CALL' && (name === 'request_compost_booking' || name === 'submit_food_bank_request')
  })
  return <section className="details-content"><h3>Record</h3>
    <div className="simple-impact-grid">
      <div><strong>{audit.total_weight_kg} kg</strong><span>Estimated weight</span></div>
      <div><strong>{Math.round(audit.total_weight_kg / 0.4)}</strong><span>Estimated meals · 0.4 kg per meal</span></div>
      <div><strong>{audit.estimated_co2e_kg} kg</strong><span>Estimated CO₂e</span></div>
    </div>
    <p>CO₂e factor: {audit.co2e_estimate_factor_kg_per_kg} kg per kg of surplus. Estimate, not a measured result.</p>
    <p>Agent model usage: {job.token_usage?.calls ?? 0} calls · {job.token_usage?.prompt_tokens ?? 0} input tokens · {job.token_usage?.output_tokens ?? 0} output tokens.</p>
    <div className={`simple-integrity ${audit.hash_chain_verified ? 'verified' : 'invalid'}`}><strong>{audit.hash_chain_verified ? 'Tamper-evident record' : 'Record verification failed'}</strong><span>{audit.hash_chain_verified ? 'Event links verified' : 'The event links could not be verified'}</span></div>
    {partnerRequests.map((event) => {
      const inputs = event.payload.inputs as Record<string, unknown> | undefined
      const label = event.payload.name === 'request_compost_booking' ? 'Compost collection' : 'Food Bank request'
      const summary = event.payload.name === 'request_compost_booking'
        ? `Collection request for ${String(inputs?.weight_kg ?? 'the estimated')} kg of food. ${String(inputs?.reason ?? '')}`.trim()
        : `Request prepared for ${Array.isArray(inputs?.items) ? inputs.items.join(', ') : 'confirmed menu items'}.`
      return <div className="tool-call-detail partner-request-summary" key={event.id}>
        <strong>{label}</strong><p>{summary}</p><small className="simple-simulated">SIMULATED PARTNER</small>
      </div>
    })}
    <a className="simple-secondary simple-download" href={`${getApiBase()}/api/demo/audit/${encodeURIComponent(job.batch_id)}/pdf`}>Download record</a>
  </section>
}

const toolTitles: Record<string, string> = {
  parse_menu: 'Read the saved menu',
  build_event_card: 'Load event details',
  analyze_leftover_photo: 'Check leftover photos',
  compare_to_menu: 'Match dishes to the menu',
  get_weather: 'Check local conditions',
  compute_safe_window: 'Set the safe time window',
  rank_recipients: 'Choose eligible recipients',
  estimate_eta: 'Estimate pickup time',
  send_offer: 'Send a food offer',
  replan: 'Choose the next safe option',
  generate_handover_codes: 'Prepare secure handover codes',
  record_handover: 'Record custody handover',
  escalate_to_human: 'Alert a human',
  request_compost_booking: 'Request compost collection',
  submit_food_bank_request: 'Prepare Food Bank request',
  seal_audit_record: 'Seal the event record',
  calculate_impact: 'Estimate meals and impact',
}

function agentStepTitle(event: JobEvent) {
  if (event.type === 'POLICY_BLOCK') return 'Safety check stopped an action'
  if (event.type === 'FALLBACK') return 'Use the safe fallback plan'
  const toolName = String(event.payload.name ?? '')
  return toolTitles[toolName] ?? event.summary
}

function agentStepSummary(event: JobEvent) {
  if (event.type === 'POLICY_BLOCK' || event.type === 'FALLBACK') {
    return String(event.payload.reason ?? event.payload.rationale ?? event.summary)
  }
  const name = String(event.payload.name ?? '')
  const output = event.payload.outputs as Record<string, unknown> | undefined
  if (name === 'get_weather' && output?.available === false) return String(output.message ?? 'Live weather unavailable; no reading was assumed.')
  if (name === 'get_weather' && typeof output?.temperature_c === 'number') {
    return `Live weather: ${output.conditions ?? 'Conditions checked'}, ${output.temperature_c}°C (feels like ${output.apparent_temperature_c ?? output.temperature_c}°C), humidity ${output.relative_humidity_percent ?? '—'}%. Safety timing remains deterministic.`
  }
  if (name === 'compute_safe_window' && typeof output?.remaining_minutes === 'number') return `Safe window calculated: ${output.remaining_minutes} minutes, using deterministic rules.`
  if (name === 'estimate_eta' && typeof output?.minutes === 'number') return `Pickup estimate: about ${Math.round(output.minutes)} minutes (${String(output.method ?? 'route estimate')}).`
  if (name === 'send_offer') return `Offer sent to ${String(output?.recipient ?? 'the next eligible partner')}. Waiting for their response.`
  if (name === 'generate_handover_codes') return 'Pickup QR prepared. The delivery PIN is available only on the signed-in recipient screen.'
  if (name === 'record_handover') return `Recorded ${String((event.payload.inputs as Record<string, unknown> | undefined)?.stage ?? 'handover')} custody details.`
  if (name === 'rank_recipients') return 'Ranked eligible recipients using the deterministic rescue policy.'
  if (name === 'replan') return 'Re-checked the next safe destination after the previous response.'
  if (name === 'request_compost_booking') return 'Fallback compost collection request created (simulated).'
  if (name === 'submit_food_bank_request') return 'Prepared the simulated Food Bank request.'
  if (name === 'seal_audit_record') return 'The tamper-evident audit record is sealed.'
  if (name === 'calculate_impact' && typeof output?.meals_estimate === 'number') return `Impact estimate recorded: about ${output.meals_estimate} meals.`
  return String(event.payload.rationale ?? event.summary)
}

function DetailsDrawer({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const [tab, setTab] = useState<'Timeline' | 'Checks' | 'Record'>('Timeline')
  return <div className="simple-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside aria-label="Details" aria-modal="true" className="simple-drawer" role="dialog">
      <div className="simple-drawer-heading"><h2>Details</h2><button aria-label="Close details" className="simple-close" onClick={onClose} type="button">×</button></div>
      <div aria-label="Details sections" className="simple-tabs" role="tablist">
        {(['Timeline', 'Checks', 'Record'] as const).map((value) => <button aria-selected={tab === value} id={`details-tab-${value.toLowerCase()}`} key={value} onClick={() => setTab(value)} role="tab" type="button">{value}</button>)}
      </div>
      <div aria-labelledby={`details-tab-${tab.toLowerCase()}`} role="tabpanel">
        {tab === 'Timeline' ? <TimelinePanel events={job.events} /> : tab === 'Checks' ? <ChecksPanel job={job} /> : <RecordPanel job={job} />}
      </div>
    </aside>
  </div>
}

function DemoControls({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const { command, pending } = useJobSync()
  const [showQr, setShowQr] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const reset = () => {
    if (window.confirm('Start a new rescue job? The current demo job will be reset.')) {
      void command('JOB_RESET', 'organiser')
      onClose()
    }
  }
  return <div className="simple-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside aria-label="Demo controls" aria-modal="true" className="simple-drawer compact-drawer" role="dialog">
      <div className="simple-drawer-heading"><h2>Demo controls</h2><button aria-label="Close demo controls" className="simple-close" onClick={onClose} type="button">×</button></div>
      <section className="simple-control-section"><h3>Pick a story</h3><div className="simple-story-list">
        {Object.entries(scenarioLabels).map(([value, label]) => <button aria-pressed={job.scenario === value} className="simple-story" disabled={pending || job.status !== 'DRAFT'} key={value} onClick={() => void command('SCENARIO_SELECTED', 'organiser', { scenario: value })} type="button">{label}</button>)}
      </div></section>
      <section className="simple-control-section"><h3>Speed</h3><div className="simple-speed-controls">
        {[1, 60].map((speed) => <button aria-pressed={job.clock_speed === speed} className="simple-story" disabled={pending} key={speed} onClick={() => void command('DEMO_CLOCK_CHANGED', 'organiser', { speed })} type="button">{speed === 1 ? 'Real time' : '60x sped up'}</button>)}
      </div></section>
      <section className="simple-control-section"><h3>Other screens</h3><PortalLinks showQr={showQr} />
        <label className="simple-qr-toggle"><input checked={showQr} onChange={(event) => setShowQr(event.target.checked)} type="checkbox" />Show QR codes</label>
      </section>
      <div className="simple-reset-menu">
        <button aria-expanded={menuOpen} className="simple-secondary" onClick={() => setMenuOpen((open) => !open)} type="button">…</button>
        {menuOpen && <button className="simple-story" disabled={pending} onClick={reset} type="button">Reset job</button>}
      </div>
    </aside>
  </div>
}

function WorkingView({ job }: { job: DemoJob }) {
  const { command, pending } = useJobSync()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [compostCredentials, setCompostCredentials] = useState<{ batchId: string; code?: string; error?: string } | null>(null)
  const compostRequested = job.status === 'COMPOST_REQUESTED'
  useEffect(() => {
    if (!compostRequested) return
    let active = true
    getCompostVerificationCode(job.batch_id).then((result) => {
      if (active) setCompostCredentials({ batchId: job.batch_id, code: result.verification_code })
    }).catch((cause: unknown) => {
      if (active) setCompostCredentials({
        batchId: job.batch_id,
        error: cause instanceof Error ? cause.message : 'Could not load the compost collection code.',
      })
    })
    return () => { active = false }
  }, [compostRequested, job.batch_id])
  const compostCredential = compostCredentials?.batchId === job.batch_id ? compostCredentials : null
  const remaining = useRemaining(job)
  const latest = [...job.events].reverse().find((event) => event.type !== 'SCENARIO_SELECTED')
  const earlier = getEarlierAttempts(job)
  const escalation = job.events.some((event) => event.type === 'ESCALATED')
  const isTakingOver = job.status === 'HUMAN_TAKEOVER'
  const journeyJob = isTakingOver ? { ...job, status: 'OFFERING' } : job
  const agentEvents = job.events.filter((event) => ['TOOL_CALL', 'POLICY_BLOCK', 'FALLBACK'].includes(event.type))
  return <main className="simple-main working-view">
    <IntakeStepper active="Place" />
    <section className="working-hero">
      <p className="simple-eyebrow">RESCUE IN PROGRESS</p>
      <h1>Finding a home for {job.estimated_weight_kg} kg of food</h1>
      <strong className={`simple-countdown${remaining <= 900 ? ' urgent' : ''}`} aria-label={`${formatClock(remaining)} time left`}>{formatClock(remaining)}</strong>
      <p className="countdown-caption">Time left to place it safely</p>
    </section>
    <Journey job={journeyJob} />
    <section className="simple-current-status" aria-live="polite">
      <p><strong>Now:</strong> {isTakingOver ? 'A person has taken over this rescue.' : latest?.summary ?? 'Finding a safe home for this food.'}</p>
      {earlier.length > 0 && <p><strong>Earlier:</strong> {earlier.join(' · ')}</p>}
      {compostRequested && <div className="console-verification-code" aria-label="Compost collection verification">
        <strong>Compost collection code</strong>
        {compostCredential?.code ? <><span>{compostCredential.code}</span><small>Share this one-time code with the compost service to confirm collection.</small></> : <p role="status">{compostCredential?.error || 'Loading the one-time collection code…'}</p>}
      </div>}
    </section>
    <section className="agent-action-list" aria-label="Agent progress">
      <h2>What the agent is doing</h2>
      {agentEvents.length > 0 ? <ol className="agent-progress-list">{agentEvents.slice(-5).map((event, index, recentEvents) => {
        const latestStep = index === recentEvents.length - 1
        const waitingForPartner = latestStep && job.status === 'OFFERING' && event.payload.name === 'send_offer'
        const toolName = String(event.payload.name ?? event.type.toLowerCase())
        const duration = event.payload.duration_ms
        return <li className={latestStep ? 'agent-progress-current' : 'agent-progress-done'} key={`${event.id}-${event.seq}`}>
          <span aria-hidden="true" className="agent-progress-icon">{event.type === 'POLICY_BLOCK' ? '!' : latestStep && !waitingForPartner ? '›' : '✓'}</span>
          <div><strong>{agentStepTitle(event)}</strong><p>{agentStepSummary(event)}</p>
            {waitingForPartner && <small>Waiting for partner response</small>}
            <small className="agent-step-meta"><code>{toolName}</code> · {typeof duration === 'number' ? `${duration} ms` : 'deterministic step'}</small>
            {event.simulated && <small className="simple-simulated">SIMULATED</small>}
          </div>
        </li>
      })}</ol> : <p>Preparing the event and checking safe options.</p>}
      <p className="agent-panel-footnote">Each row shows the action, result, tool name, and run time. Partner steps are marked simulated.</p>
    </section>
    <p className="simple-fallback">If nobody can take it: Food Bank, then compost, then a person steps in.</p>
    {escalation && !['SEALED', 'COMPOST_REQUESTED', 'HUMAN_TAKEOVER'].includes(job.status) && <section className="simple-alert"><span>A person has been alerted</span><button className="simple-primary" disabled={pending} onClick={() => void command('HUMAN_TAKEOVER', 'organiser', { reason: 'Escalation threshold reached' })} type="button">Take over</button></section>}
    <button className="simple-secondary details-button" onClick={() => setDrawerOpen(true)} type="button">Details</button>
    {drawerOpen && <DetailsDrawer job={job} onClose={() => setDrawerOpen(false)} />}
  </main>
}

function DoneView({ job, onStartAnother }: { job: DemoJob; onStartAnother: () => void }) {
  const outcome = getOutcome(job)
  const delivered = outcome === 'delivered'
  return <main className="simple-main done-view">
    <section className="done-card">
      <span aria-hidden="true" className="done-check">{delivered ? '✓' : outcome === 'compost' ? '♻' : '✓'}</span>
      {delivered ? <>
        <p className="simple-eyebrow">DONE</p>
        <h1>{job.estimated_weight_kg} kg reached people tonight</h1>
        <p className="done-meals">estimate: about {Math.round(job.estimated_weight_kg / 0.4)} meals</p>
      </> : outcome === 'compost' ? <>
        <p className="simple-eyebrow">DONE</p>
        <h1>Composted. No safe home was found in time. Record saved.</h1>
      </> : <>
        <p className="simple-eyebrow">DONE</p>
        <h1>A person stepped in to handle this rescue.</h1>
      </>}
      <div className="done-actions">
        <a className="simple-secondary" href={`${getApiBase()}/api/demo/audit/${encodeURIComponent(job.batch_id)}/pdf`}>Download record</a>
        <button className="simple-primary" onClick={onStartAnother} type="button">Start another</button>
      </div>
    </section>
  </main>
}

function LoadingError({ loading, error, reconnecting, refresh }: { loading: boolean; error: string; reconnecting: boolean; refresh: () => Promise<void> }) {
  if (loading) return <main className="state-screen" aria-live="polite">Loading the rescue…</main>
  if (error && !reconnecting) return <main className="state-screen"><p role="alert">{error}</p><button className="simple-primary" onClick={() => void refresh()}>Retry</button></main>
  return null
}

export function ConsolePage() {
  const { job, loading, error, reconnecting, refresh } = useJobSync()
  if (loading) return <LoadingError loading={loading} error={error} reconnecting={reconnecting} refresh={refresh} />
  if (!job) return <main className="state-screen" aria-live="polite"><span role="alert">{error || (reconnecting ? 'Reconnecting to the rescue…' : 'No active rescue job.')}</span><button className="simple-primary" onClick={() => void refresh()}>Retry</button></main>
  return <ConsoleReady job={job} reconnecting={reconnecting} error={error} />
}

function ConsoleReady({ job, reconnecting, error }: { job: DemoJob; reconnecting: boolean; error: string }) {
  const { command } = useJobSync()
  const [demoOpen, setDemoOpen] = useState(false)
  const state = getConsoleState(job)
  return <div className="simple-console">
    <ConsoleHeader job={job} reconnecting={reconnecting} onDemo={() => setDemoOpen(true)} />
    {error && <p className="simple-global-error" role="status">{error}</p>}
    {state === 'start' ? <StartView job={job} />
      : state === 'done' ? <DoneView job={job} onStartAnother={() => {
        if (window.confirm('Start a new rescue job?')) void command('JOB_RESET', 'organiser')
      }} />
        : <WorkingView job={job} />}
    {demoOpen && <DemoControls job={job} onClose={() => setDemoOpen(false)} />}
  </div>
}
