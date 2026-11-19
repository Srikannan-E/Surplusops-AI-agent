export type ServiceId =
  | 'reloop'
  | 'collecteroo'
  | 'uae-food-bank'
  | 'registered-charity'
  | 'ne-ma-style-report'

export type PortalRecord = {
  id: string
  service: ServiceId
  status: string
  created_at: string
  payload: Record<string, unknown>
}

export type SimulationEvent = {
  id: number
  batch_id: string
  event_type: string
  status: string
  summary: string
  created_at: string
  metadata: Record<string, unknown>
  previous_hash: string
  event_hash: string
}

export type RescueResult = {
  batch_id: string
  outcome: string
  selected_recipient: string
  safety_eligible: boolean
  safety_reason: string
  record_id: string
  mode: 'SIMULATED'
}

export type DemoSession = {
  batch_id: string
  venue_name: string
  event_name: string
  food_summary: string
  selected_dishes: string[]
  photo_name: string
  estimated_weight_kg: number
  untouched_confirmed: boolean
  allergens_from_menu: string[]
  halal_status: string
  remaining_safe_minutes: number
  pickup_eta_minutes: number
  safety_buffer_minutes: number
  food_bank_response: 'accept' | 'decline'
  food_bank_decline_reason: string
  charity_response: 'accept' | 'decline'
  charity_decline_reason: string
  pickup_location: string
  food_bank_location: string
  charity_location: string
  collection_deadline: string
  intake_confirmed: boolean
  intake_confirmed_at: string
  rescue_result: RescueResult | null
}

export type JobEvent = {
  id: number
  seq: number
  ts: string
  actor: 'chef' | 'agent' | 'recipient' | 'driver' | 'composter' | 'organiser' | 'system'
  simulated: boolean
  type: string
  payload: Record<string, unknown>
  prev_hash: string
  hash: string
  summary: string
}

export type JobRung = {
  label: string
  state: 'idle' | 'offered' | 'declined' | 'accepted' | 'active' | 'failed' | 'done'
  attempts: Array<{ recipient: string; state: string; reason?: string }>
}

export type DemoJob = {
  batch_id: string
  event_id?: string
  event_name: string
  status: string
  outcome?: string
  end_of_service_outcome?: 'nothing_left' | 'some_left' | 'not_sure' | ''
  donation_intent?: {
    status: 'standby' | 'confirmed' | 'cancelled_no_surplus'
    size_class: 'none_likely' | 'small' | 'medium' | 'large' | null
    is_estimate: boolean
  }
  heads_up_sent?: boolean
  slot_acknowledged?: boolean
  slot_released?: boolean
  reconcile?: {
    variance_types: string[]
    actual_weight_kg: number | null
    unsafe_items: string[]
    delay_minutes: number
    per_dish_acceptance: Record<string, boolean>
  }
  venue_name: string
  dishes: string[]
  food_summary: string
  photo_name: string
  estimated_weight_kg: number
  untouched_confirmed: boolean
  allergens: string[]
  halal_status: string
  pickup_location: string
  remaining_safe_seconds: number
  clock_speed: number
  clock_anchor: string
  current_tier: number
  rungs: Record<'1' | '2' | '3' | '4', JobRung>
  scenario: 'bigger_expected' | 'nothing_left' | 'nobody_accepts' | 'happy_path' | 'decline_then_recover'
  food_bank_response: 'accept' | 'decline'
  charity_response: 'accept' | 'decline'
  selected_recipient: string
  pickup_temperature_c: number | null
  cancelled: boolean
  human_takeover: boolean
  events: JobEvent[]
  audit: AuditSummary
  server_time: string
  photos?: Array<{ name: string; content_type: string }>
  observations?: Array<{
    menu_item: string
    detected: boolean
    tray_count_min: number
    tray_count_max: number
    confidence: number
    notes: string
  }>
  unmatched?: string[]
  approved_items?: string[]
  compost_only?: string[]
  token_usage?: { prompt_tokens: number; output_tokens: number; calls: number }
}

export type EventMenuItem = {
  id: string
  name: string
  category: string
  allergens: string[]
  halal: 'yes' | 'no' | 'unknown'
  diet_tags: string[]
  planned_qty: { value?: number; unit?: string }
  holding: 'hot' | 'chilled' | 'ambient'
  serving: 'buffet' | 'plated' | 'packaged'
  source: 'ai' | 'user'
  confirmed: boolean
}

export type FoodEvent = {
  id: string
  name: string
  type: string
  venue: string
  start: string
  end: string
  guest_count: number
  contact: string
  status: 'planned' | 'active' | 'completed'
  menu_items: EventMenuItem[]
}

export type EventAnalysis = {
  observations: NonNullable<DemoJob['observations']>
  unmatched: string[]
  menu_items_not_seen: string[]
  approved_items: string[]
  compost_only: string[]
  model: { provider: string; fallback: boolean }
}

export type JobCommandType =
  | 'HEADS_UP_SENT'
  | 'HEADS_UP_CANCELLED'
  | 'SLOT_ACKNOWLEDGED'
  | 'REMINDER_SENT'
  | 'END_OF_SERVICE_CONFIRMED'
  | 'SURPLUS_CONFIRMED'
  | 'VARIANCE_CLASSIFIED'
  | 'REQUEST_UPDATED'
  | 'ADHOC_REQUESTED'
  | 'CHEF_CONFIRMED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'PICKUP_CONFIRMED'
  | 'DELIVERY_CONFIRMED'
  | 'COMPOST_CONFIRMED'
  | 'HUMAN_TAKEOVER'
  | 'DEMO_CLOCK_CHANGED'
  | 'SCENARIO_SELECTED'
  | 'JOB_RESET'

export type AuditSummary = {
  batch_id: string
  mode: 'SIMULATED'
  events: SimulationEvent[]
  records: PortalRecord[]
  total_weight_kg: number
  estimated_meals: number
  meal_estimate_assumption_kg: number
  estimated_co2e_kg: number
  co2e_estimate_factor_kg_per_kg: number
  estimate_notice: string
  intake: Record<string, unknown>
  hash_chain_verified: boolean
  head_hash: string
}

export type FieldOption = {
  label: string
  value: string
}

export type PortalField = {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'time' | 'select' | 'checkbox' | 'textarea'
  required?: boolean
  defaultValue?: string | number | boolean
  options?: FieldOption[]
  full?: boolean
  min?: number
  step?: number
}

export type PortalConfig = {
  id: ServiceId
  name: string
  category: string
  eyebrow: string
  description: string
  notice: string
  submitLabel: string
  fields: PortalField[]
}
