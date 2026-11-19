import { useEffect, useState } from 'react'
import type { DemoSession, RescueResult } from '../types'

const SESSION_KEY = 'surplusops-demo-session'
const SESSION_EVENT = 'surplusops-demo-session-updated'

function deadlineFromNow(hours: number) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function newBatchId() {
  return `DEMO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function createDefaultSession(): DemoSession {
  return {
    batch_id: newBatchId(),
    venue_name: 'Demo Hotel Dubai',
    event_name: 'Evening banquet service',
    food_summary: 'Vegetable biryani and grilled chicken portions',
    selected_dishes: ['Vegetable biryani', 'Grilled chicken'],
    photo_name: '',
    estimated_weight_kg: 24,
    untouched_confirmed: false,
    allergens_from_menu: ['Dairy', 'Nuts'],
    halal_status: 'verified_by_venue',
    remaining_safe_minutes: 60,
    pickup_eta_minutes: 20,
    safety_buffer_minutes: 15,
    food_bank_response: 'accept',
    food_bank_decline_reason: '',
    charity_response: 'accept',
    charity_decline_reason: '',
    pickup_location: 'Demo Hotel Dubai, Business Bay',
    food_bank_location: 'Community recipient hub (simulated)',
    charity_location: 'Registered charity hub (simulated)',
    collection_deadline: deadlineFromNow(1),
    intake_confirmed: false,
    intake_confirmed_at: '',
    rescue_result: null,
  }
}

export function readDemoSession(): DemoSession {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (raw) {
    try {
      return { ...createDefaultSession(), ...JSON.parse(raw) as Partial<DemoSession> }
    } catch (error) {
      throw new Error('Saved demo session is unreadable. Use the New batch action to start over.', { cause: error })
    }
  }
  return createDefaultSession()
}

export function saveDemoSession(session: DemoSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function useDemoSession() {
  const [session, setSession] = useState(readDemoSession)

  useEffect(() => {
    const refresh = () => setSession(readDemoSession())
    window.addEventListener(SESSION_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SESSION_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return session
}

export function rescuePayload(session: DemoSession, overrides: Partial<DemoSession> = {}) {
  const current = { ...session, ...overrides, rescue_result: null }
  const payload: Record<string, unknown> = { ...current }
  delete payload.rescue_result
  delete payload.photo_name
  delete payload.selected_dishes
  delete payload.intake_confirmed
  delete payload.intake_confirmed_at
  return payload
}

export function setSessionResult(session: DemoSession, result: RescueResult) {
  const updated = { ...session, rescue_result: result }
  saveDemoSession(updated)
  return updated
}
