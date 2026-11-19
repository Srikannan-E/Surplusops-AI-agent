import { useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirmIntake, runRescue } from '../lib/api'
import { createDefaultSession, readDemoSession, rescuePayload, saveDemoSession } from '../lib/demoSession'
import type { DemoSession } from '../types'
import { StatusPill } from '../components/StatusPill'

const menuTiles = [
  { name: 'Vegetable biryani', allergens: ['Dairy'], halal: 'Venue menu' },
  { name: 'Grilled chicken', allergens: [], halal: 'Venue menu' },
  { name: 'Garden salad', allergens: [], halal: 'Not applicable' },
  { name: 'Chocolate tart', allergens: ['Dairy', 'Nuts', 'Gluten'], halal: 'Venue menu' },
]

export function ChefIntakePage() {
  const navigate = useNavigate()
  const [session, setSession] = useState(readDemoSession)
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [photoConfirmed, setPhotoConfirmed] = useState(false)
  const [untouched, setUntouched] = useState(() => session.untouched_confirmed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function update<K extends keyof DemoSession>(key: K, value: DemoSession[K]) {
    setSession((current) => ({ ...current, [key]: value }))
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    setPhoto(selected)
    setPreviewUrl(selected ? URL.createObjectURL(selected) : '')
    setPhotoConfirmed(false)
    if (selected) {
      update('photo_name', selected.name)
    }
  }

  async function loadPresetImage() {
    try {
      const response = await fetch('/demo-banquet-illustration.svg')
      if (!response.ok) throw new Error('Preset demo image could not be loaded.')
      const blob = await response.blob()
      const preset = new File([blob], 'demo-banquet-illustration.svg', { type: 'image/svg+xml' })
      setPhoto(preset)
      setPreviewUrl(URL.createObjectURL(preset))
      setPhotoConfirmed(false)
      update('photo_name', preset.name)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load the preset image.')
    }
  }

  function toggleDish(dish: string) {
    const selected = session.selected_dishes.includes(dish)
      ? session.selected_dishes.filter((item) => item !== dish)
      : [...session.selected_dishes, dish]
    const allergens = [...new Set(menuTiles
      .filter((tile) => selected.includes(tile.name))
      .flatMap((tile) => tile.allergens))]
    update('selected_dishes', selected)
    update('food_summary', selected.join(', '))
    update('allergens_from_menu', allergens)
  }

  async function submitIntake() {
    if (!photo || !photoConfirmed || !untouched || session.selected_dishes.length === 0) return
    const updated: DemoSession = {
      ...session,
      photo_name: photo.name,
      untouched_confirmed: true,
      intake_confirmed: true,
      intake_confirmed_at: new Date().toISOString(),
      rescue_result: null,
    }
    setSaving(true)
    setError('')
    try {
      await confirmIntake(session.batch_id, {
        photo_name: photo.name,
        selected_dishes: session.selected_dishes,
        untouched_confirmed: true,
        estimated_weight_kg: session.estimated_weight_kg,
        venue_name: session.venue_name,
        pickup_location: session.pickup_location,
      })
      saveDemoSession(updated)
      navigate('/recipient')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record intake confirmation.')
    } finally {
      setSaving(false)
    }
  }

  async function runUnconfirmedFallback() {
    if (!photo || !photoConfirmed || untouched || session.selected_dishes.length === 0) return
    const updated: DemoSession = {
      ...session,
      photo_name: photo.name,
      untouched_confirmed: false,
      intake_confirmed: true,
      intake_confirmed_at: new Date().toISOString(),
      food_bank_response: 'accept',
      charity_response: 'accept',
      rescue_result: null,
    }
    setSaving(true)
    setError('')
    try {
      await confirmIntake(session.batch_id, {
        photo_name: photo.name,
        selected_dishes: session.selected_dishes,
        untouched_confirmed: false,
        estimated_weight_kg: session.estimated_weight_kg,
        venue_name: session.venue_name,
        pickup_location: session.pickup_location,
      })
      const result = await runRescue(rescuePayload(updated))
      saveDemoSession({ ...updated, rescue_result: result })
      navigate('/command')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not run the safety fallback scenario.')
    } finally {
      setSaving(false)
    }
  }

  function startNewBatch() {
    const next = createDefaultSession()
    saveDemoSession(next)
    setSession(next)
    setPhoto(null)
    setPreviewUrl('')
    setPhotoConfirmed(false)
    setUntouched(false)
    setError('')
  }

  const ready = Boolean(photo && photoConfirmed && untouched && session.selected_dishes.length)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">01 / Chef intake</div>
          <h1>Capture surplus once</h1>
          <p className="subtitle">Take or upload one photo, choose the dishes from the hotel menu, then confirm the photo and unserved status.</p>
        </div>
        <div className="button-row" style={{ marginTop: 0 }}>
          <button className="button secondary" onClick={startNewBatch} type="button">Start new batch</button>
          <StatusPill tone="neutral">HUMAN CONFIRMATION</StatusPill>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">!</span>
        <span>Photo is displayed only in this browser and is not uploaded to an AI service. Menu allergens and halal status are shown as venue-provided data, not inferred or certified.</span>
      </div>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>One photo</h2>
              <p className="panel-description">Use the device camera or choose a saved image.</p>
            </div>
            <span className="small-mono">{session.batch_id}</span>
          </div>
          <label className="photo-upload" htmlFor="food-photo">
            {previewUrl ? <img src={previewUrl} alt="Selected surplus food preview" /> : (
              <span className="photo-placeholder">
                <strong>Take a photo or upload</strong>
                <span>JPG, PNG, or WebP · local preview only</span>
              </span>
            )}
          </label>
          <input
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            id="food-photo"
            onChange={handlePhoto}
            type="file"
          />
          <div className="button-row">
            <button className="button secondary" onClick={() => void loadPresetImage()} type="button">Use preset demo illustration</button>
          </div>
          {photo && <p className="photo-name">Selected: {photo.name}</p>}

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="venue">Hotel / venue</label>
              <input id="venue" value={session.venue_name} onChange={(event) => update('venue_name', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="event">Event / service</label>
              <input id="event" value={session.event_name} onChange={(event) => update('event_name', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="weight">Estimated surplus weight (kg)</label>
              <input id="weight" type="number" min="0.1" max="5000" step="0.1" value={session.estimated_weight_kg} onChange={(event) => update('estimated_weight_kg', Number(event.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="pickup-location">Kitchen pickup location</label>
              <input id="pickup-location" value={session.pickup_location} onChange={(event) => update('pickup_location', event.target.value)} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Menu tiles</h2>
              <p className="panel-description">Select only dishes from the preloaded demo menu.</p>
            </div>
          </div>
          <div className="menu-tiles">
            {menuTiles.map((tile) => {
              const selected = session.selected_dishes.includes(tile.name)
              return (
                <button
                  aria-pressed={selected}
                  className={`menu-tile${selected ? ' selected' : ''}`}
                  key={tile.name}
                  onClick={() => toggleDish(tile.name)}
                  type="button"
                >
                  <span className="tile-check">{selected ? '✓' : '+'}</span>
                  <strong>{tile.name}</strong>
                  <small>Allergens: {tile.allergens.length ? tile.allergens.join(', ') : 'None listed'}</small>
                  <small>Halal: {tile.halal}</small>
                </button>
              )
            })}
          </div>
          <div className="divider" />
          <div className="tap-confirmations">
            <button
              aria-pressed={photoConfirmed}
              className={`tap-button${photoConfirmed ? ' confirmed' : ''}`}
              disabled={!photo}
              onClick={() => setPhotoConfirmed((value) => !value)}
              type="button"
            >
              <span>Tap 1</span>
              {photoConfirmed ? 'Photo reviewed' : 'Confirm photo is current'}
            </button>
            <button
              aria-pressed={untouched}
              className={`tap-button${untouched ? ' confirmed' : ''}`}
              onClick={() => {
                setUntouched((value) => !value)
                update('untouched_confirmed', !untouched)
              }}
              type="button"
            >
              <span>Tap 2</span>
              {untouched ? 'Unserved status confirmed' : 'Confirm food is unserved'}
            </button>
          </div>
          <div className="button-row">
            <button className="button" disabled={!ready || saving} onClick={() => void submitIntake()} type="button">
              {saving ? 'Recording intake...' : 'Confirm intake and send offer'}
            </button>
            {!untouched && (
              <button
                className="button secondary"
                disabled={!photo || !photoConfirmed || session.selected_dishes.length === 0 || saving}
                onClick={() => void runUnconfirmedFallback()}
                type="button"
              >
                {saving ? 'Running fallback...' : 'Run unconfirmed → compost demo'}
              </button>
            )}
            <button className="button secondary" onClick={() => navigate('/command')} type="button">
              View command centre
            </button>
          </div>
          {error && <div className="result-banner error" role="alert">{error}</div>}
          <p className="footer-note">Menu and dietary values are preloaded venue-declared demo data. If the image or human safety confirmation is missing, the system must not authorize food for human consumption.</p>
        </section>
      </div>
    </>
  )
}
