import type { AuditSummary, DemoJob, EventAnalysis, FoodEvent, JobCommandType, PortalRecord, RescueResult, ServiceId, SimulationEvent } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ?? `${window.location.protocol}//${window.location.hostname}:8000`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('Cannot reach the simulation API. Start the backend on port 8000.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { detail?: unknown } | undefined
    const detail = typeof body?.detail === 'string'
      ? body.detail
      : 'Request rejected. Check the form fields and try again.'
    if (response.status === 404 && detail === 'Not Found') {
      throw new Error(`The backend does not recognize ${path}. Restart it from the current backend/app/main.py so event menus and hall QR links are available.`)
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export function getRecipientHandoverDetails(batchId: string) {
  return request<{ pickup_code: string; delivery_pin: string }>(`/api/jobs/${encodeURIComponent(batchId)}/handover-credentials`, { cache: 'no-store' })
}

export function getCompostVerificationCode(batchId: string) {
  return request<{ verification_code: string }>(`/api/jobs/${encodeURIComponent(batchId)}/compost-credentials`, { cache: 'no-store' })
}

export function getHealth() {
  return request<{ status: string; mode: string }>('/api/health')
}

export function getActiveJob() {
  return request<DemoJob>('/api/jobs/active')
}

export function getFoodEvents() {
  return request<FoodEvent[]>('/api/events')
}

export function extractEventMenu(payload: { text?: string; filename: string; content_type: string; file_base64?: string }) {
  return request<{ items: FoodEvent['menu_items']; model: { provider: string; fallback: boolean } }>('/api/events/extract', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createFoodEvent(payload: FoodEvent) {
  return request<FoodEvent>('/api/events', { method: 'POST', body: JSON.stringify(payload) })
}

export function selectFoodEvent(eventId: string) {
  return request<DemoJob>(`/api/events/${encodeURIComponent(eventId)}/select`, { method: 'POST' })
}

export function analyzeEventLeftovers(eventId: string, payload: { photo_name: string; photo_base64: string; voice_note?: string; served_status: 'untouched' | 'some_served' | 'unknown' }) {
  return request<EventAnalysis>(`/api/events/${encodeURIComponent(eventId)}/analyze`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getJob(batchId: string) {
  return request<DemoJob>(`/api/jobs/${encodeURIComponent(batchId)}`)
}

export function sendJobCommand(
  batchId: string,
  type: JobCommandType,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  return request<DemoJob>(`/api/jobs/${encodeURIComponent(batchId)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ type, actor, payload, idempotency_key: crypto.randomUUID() }),
  })
}

export function getJobStreamUrl(batchId: string) {
  return `${API_BASE}/api/jobs/${encodeURIComponent(batchId)}/stream`
}

export function getRecords(service: ServiceId) {
  return request<PortalRecord[]>(`/api/services/${service}/requests`)
}

export function submitPortalRequest(service: ServiceId, payload: Record<string, unknown>) {
  return request<PortalRecord>(`/api/services/${service}/requests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function runRescue(payload: Record<string, unknown>) {
  return request<RescueResult>('/api/demo/rescue', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getEvents(batchId: string) {
  return request<SimulationEvent[]>(`/api/demo/events/${encodeURIComponent(batchId)}`)
}

export function confirmIntake(batchId: string, payload: Record<string, unknown>) {
  return request<SimulationEvent>(`/api/demo/intake/${encodeURIComponent(batchId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function recordCustody(batchId: string, payload: Record<string, unknown>) {
  return request<SimulationEvent>(`/api/demo/custody/${encodeURIComponent(batchId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function revokeRescue(batchId: string, reason: string) {
  return request<RescueResult>(`/api/demo/revoke/${encodeURIComponent(batchId)}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function recordOrganiserTakeover(batchId: string, reason: string) {
  return request<SimulationEvent>(`/api/demo/organiser/${encodeURIComponent(batchId)}/takeover`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function getAudit(batchId: string) {
  return request<AuditSummary>(`/api/demo/audit/${encodeURIComponent(batchId)}`)
}

export function getAllRecords() {
  return request<PortalRecord[]>('/api/demo/requests')
}

export function createNemaStyleRecord(payload: Record<string, unknown>) {
  return request<PortalRecord>('/api/demo/requests/ne-ma-style', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getApiBase() {
  return API_BASE
}
