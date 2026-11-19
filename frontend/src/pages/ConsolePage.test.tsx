import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJobSync } from '../lib/useJobSync'
import type { DemoJob, JobEvent } from '../types'
import { ConsolePage } from './ConsolePage'
import { ComposterPortalPage, DriverPortalPage, RecipientPortalPage } from './Portals'

vi.mock('../lib/useJobSync', () => ({ useJobSync: vi.fn() }))
const apiMocks = vi.hoisted(() => ({
  getFoodEvents: vi.fn(),
  selectFoodEvent: vi.fn(),
  analyzeEventLeftovers: vi.fn(),
  extractEventMenu: vi.fn(),
  createFoodEvent: vi.fn(),
  getRecipientHandoverDetails: vi.fn(),
  getCompostVerificationCode: vi.fn(),
}))
vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/api')>(),
  ...apiMocks,
}))

const demoEvent = {
  id: 'event-demo',
  name: 'Evening banquet',
  type: 'Banquet',
  venue: 'Demo Hotel',
  start: '2026-11-16T18:00:00+04:00',
  end: '2026-11-16T22:00:00+04:00',
  guest_count: 120,
  contact: 'Demo kitchen',
  status: 'planned' as const,
  menu_items: [{
    id: 'menu-1',
    name: 'Vegetable biryani',
    category: 'Main course',
    allergens: ['Dairy'],
    halal: 'unknown' as const,
    diet_tags: ['Vegetarian'],
    planned_qty: { value: 4, unit: 'trays' },
    holding: 'hot' as const,
    serving: 'buffet' as const,
    source: 'user' as const,
    confirmed: true,
  }],
}

const makeEvent = (type: string, summary: string): JobEvent => ({
  id: 1,
  seq: 1,
  ts: new Date().toISOString(),
  actor: 'agent',
  simulated: false,
  type,
  payload: {},
  prev_hash: '',
  hash: '',
  summary,
})

function makeJob(overrides: Partial<DemoJob> = {}): DemoJob {
  const events = [makeEvent('JOB_CREATED', 'A new demo rescue job was created.')]
  return {
    batch_id: 'DEMO-TEST-1',
    status: 'DRAFT',
    venue_name: 'Demo Hotel',
    event_name: 'Banquet',
    dishes: ['Vegetable biryani', 'Grilled chicken'],
    food_summary: 'Vegetable biryani, Grilled chicken',
    photo_name: 'food.jpg',
    estimated_weight_kg: 24,
    untouched_confirmed: false,
    allergens: ['Dairy'],
    halal_status: 'verified by venue',
    pickup_location: 'Business Bay',
    remaining_safe_seconds: 3600,
    clock_speed: 1,
    clock_anchor: new Date().toISOString(),
    current_tier: 0,
    rungs: {
      '1': { label: 'Kitchens and charities', state: 'idle', attempts: [] },
      '2': { label: 'Food Bank', state: 'idle', attempts: [] },
      '3': { label: 'Compost (last resort)', state: 'idle', attempts: [] },
      '4': { label: 'A person steps in', state: 'idle', attempts: [] },
    },
    scenario: 'happy_path',
    food_bank_response: 'accept',
    charity_response: 'accept',
    selected_recipient: '',
    pickup_temperature_c: null,
    cancelled: false,
    human_takeover: false,
    events,
    audit: {
      batch_id: 'DEMO-TEST-1',
      mode: 'SIMULATED',
      events: [],
      records: [],
      total_weight_kg: 24,
      estimated_meals: 60,
      meal_estimate_assumption_kg: 0.4,
      estimated_co2e_kg: 38.4,
      co2e_estimate_factor_kg_per_kg: 2.5,
      estimate_notice: 'Estimate only',
      intake: {},
      hash_chain_verified: true,
      head_hash: 'test-hash',
    },
    server_time: new Date().toISOString(),
    ...overrides,
  }
}

function setJob(job: DemoJob) {
  vi.mocked(useJobSync).mockReturnValue({
    job,
    loading: false,
    error: '',
    reconnecting: false,
    pending: false,
    command: vi.fn().mockResolvedValue(job),
    refresh: vi.fn().mockResolvedValue(undefined),
  })
}

describe('ConsolePage three-state presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFoodEvents.mockResolvedValue([demoEvent])
    apiMocks.selectFoodEvent.mockResolvedValue(makeJob({ event_id: demoEvent.id }))
    apiMocks.extractEventMenu.mockResolvedValue({
      items: [{
        id: 'draft-menu-1',
        name: 'Vegetable biryani',
        category: 'Main course',
        allergens: ['Dairy'],
        halal: 'unknown',
        diet_tags: ['Vegetarian'],
        planned_qty: { value: 4, unit: 'trays' },
        holding: 'hot',
        serving: 'buffet',
        source: 'ai',
        confirmed: false,
      }],
      model: { provider: 'deterministic-fallback', fallback: true },
    })
    apiMocks.createFoodEvent.mockResolvedValue(demoEvent)
    apiMocks.getRecipientHandoverDetails.mockResolvedValue({ pickup_code: '12345678', delivery_pin: '654321' })
    apiMocks.getCompostVerificationCode.mockResolvedValue({ verification_code: '321654' })
    apiMocks.analyzeEventLeftovers.mockResolvedValue({
      observations: [{
        menu_item: 'Vegetable biryani',
        detected: true,
        tray_count_min: 1,
        tray_count_max: 2,
        confidence: 0.9,
        notes: '',
      }],
      unmatched: [],
      menu_items_not_seen: ['Grilled chicken'],
      approved_items: ['Vegetable biryani'],
      compost_only: [],
      model: { provider: 'deterministic-fallback', fallback: true },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the one-photo chef intake and does not display a countdown', async () => {
    setJob(makeJob())
    render(<ConsolePage />)

    expect(await screen.findByRole('heading', { name: 'Food left over?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Some left — add photos' })).toBeTruthy()
    expect(screen.getByText('Menu loaded · Evening banquet')).toBeTruthy()
    expect(screen.queryByText('60:00')).toBeNull()
  })

  it('shows the event menu and hall QR in manager setup without opening intake fields', async () => {
    setJob(makeJob())
    render(<ConsolePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Dish library setup' }))
    fireEvent.click(await screen.findByRole('button', { name: /Evening banquet/ }))

    expect(await screen.findByRole('heading', { name: 'Evening banquet' })).toBeTruthy()
    expect(screen.getByText('Vegetable biryani')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Evening banquet hall QR code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open chef intake' })).toBeTruthy()
    expect(screen.queryByLabelText('Upload menu')).toBeNull()
  })

  it('creates an event card from an uploaded menu with a single dietary confirmation', async () => {
    setJob(makeJob())
    render(<ConsolePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dish library setup' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add event menu' }))

    expect(screen.queryByLabelText('Event name')).toBeNull()
    expect(screen.queryByLabelText('Venue')).toBeNull()
    const menuInput = document.querySelector<HTMLInputElement>('input[type="file"][multiple]')
    if (!menuInput) throw new Error('Menu upload input was not rendered.')
    fireEvent.change(menuInput, { target: { files: [new File(['menu'], 'Evening banquet.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByRole('heading', { name: 'Review menu and venue-declared details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm these dishes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create event card' }))

    expect(await screen.findByRole('heading', { name: 'Evening banquet' })).toBeTruthy()
    expect(apiMocks.extractEventMenu).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'Evening banquet.pdf',
      content_type: 'application/pdf',
      file_base64: expect.any(String),
    }))
    expect(apiMocks.createFoodEvent).toHaveBeenCalledWith(expect.objectContaining({
      venue: 'Venue details to confirm',
      menu_items: [expect.objectContaining({ name: 'Vegetable biryani', confirmed: true })],
    }))
  })

  it('shows the WORKING state with one plain-language status and no ladder', () => {
    const toolEvent = {
      ...makeEvent('TOOL_CALL', 'Current weather checked.'),
      payload: {
        name: 'get_weather',
        duration_ms: 140,
        outputs: {
          available: true,
          temperature_c: 34,
          apparent_temperature_c: 38,
          relative_humidity_percent: 55,
          conditions: 'Clear',
        },
        rationale: 'Check current ambient conditions.',
      },
    }
    setJob(makeJob({
      status: 'OFFERING',
      untouched_confirmed: true,
      current_tier: 1,
      events: [makeEvent('JOB_CREATED', 'Job created.'), toolEvent, makeEvent('OFFER_SENT', 'An offer was sent to Food Bank / charity.')],
    }))
    render(<ConsolePage />)

    expect(screen.getByRole('heading', { name: 'Finding a home for 24 kg of food' })).toBeTruthy()
    expect(screen.getByText('Time left to place it safely')).toBeTruthy()
    expect(screen.getByText('If nobody can take it: Food Bank, then compost, then a person steps in.')).toBeTruthy()
    expect(screen.queryByText('Rescue ladder')).toBeNull()
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'What the agent is doing' })).toBeTruthy()
    expect(screen.getAllByText('Check local conditions').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Live weather: Clear, 34°C \(feels like 38°C\), humidity 55%/).length).toBeGreaterThan(0)
    const weatherToolName = screen.getByText('get_weather')
    expect(weatherToolName.parentElement?.textContent).toContain('140 ms')
    expect(screen.queryByText(/"temperature_c"/)).toBeNull()
    expect(screen.queryByText('Technical tool details')).toBeNull()
  })

  it('states clearly when the live weather service is unavailable', () => {
    const toolEvent = {
      ...makeEvent('TOOL_CALL', 'Live weather could not be reached.'),
      payload: {
        name: 'get_weather',
        outputs: {
          available: false,
          source: 'Open-Meteo',
          message: 'Live weather could not be reached. No weather value was assumed; deterministic safety rules remain in force.',
        },
      },
    }
    setJob(makeJob({
      status: 'OFFERING',
      events: [makeEvent('JOB_CREATED', 'Job created.'), toolEvent],
    }))
    render(<ConsolePage />)

    expect(screen.getByText(/No weather value was assumed/)).toBeTruthy()
    expect(screen.queryByText(/Local temperature checked: 24°C/)).toBeNull()
  })

  it('shows the DONE state, meal estimate, record link, and new-job action', () => {
    setJob(makeJob({
      status: 'SEALED',
      events: [makeEvent('DELIVERY_CONFIRMED', 'The delivery PIN was verified and handover was recorded.')],
    }))
    render(<ConsolePage />)

    expect(screen.getByRole('heading', { name: '24 kg reached people tonight' })).toBeTruthy()
    expect(screen.getByText('estimate: about 60 meals')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download record' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start another' })).toBeTruthy()
  })

  it('shows the no-surplus outcome as a successful closed record', () => {
    setJob(makeJob({ status: 'SEALED', outcome: 'no_surplus' }))
    render(<ConsolePage />)

    expect(screen.getByRole('heading', { name: /No surplus remained/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download record' })).toBeTruthy()
  })

  it('opens the driver portal without a static code and requires per-job handover codes', async () => {
    const job = makeJob({ status: 'ACCEPTED', current_tier: 1, selected_recipient: 'uae-food-bank' })
    setJob(job)
    render(<DriverPortalPage />)

    expect(await screen.findByRole('heading', { name: 'Driver handover' })).toBeTruthy()
    expect(screen.getByLabelText('Recipient pickup code')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify code & record pickup' })).toBeTruthy()
    expect(screen.queryByText('12345678')).toBeNull()
    expect(screen.queryByText('654321')).toBeNull()
  })

  it('shows one-time pickup and delivery codes only in the recipient handover portal', async () => {
    const job = makeJob({ status: 'ACCEPTED', current_tier: 1, selected_recipient: 'uae-food-bank' })
    setJob(job)
    render(<RecipientPortalPage />)

    expect(await screen.findByText('12345678')).toBeTruthy()
    expect(screen.getByText('654321')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Pickup code for the driver' })).toBeTruthy()
    expect(apiMocks.getRecipientHandoverDetails).toHaveBeenCalledWith(job.batch_id)
  })

  it('requires a one-time compost collection code instead of a portal access code', async () => {
    const job = makeJob({ status: 'COMPOST_REQUESTED', cancelled: true })
    setJob(job)
    render(<ComposterPortalPage />)

    expect(await screen.findByRole('heading', { name: 'Confirm collection' })).toBeTruthy()
    expect(screen.getByLabelText('Kitchen collection code')).toBeTruthy()
    const verify = screen.getByRole('button', { name: 'Verify code & confirm collection' })
    expect((verify as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Kitchen collection code'), { target: { value: '321654' } })
    expect((verify as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByLabelText('Access code')).toBeNull()
  })

  async function getToCheckView() {
    await screen.findByRole('heading', { name: 'Food left over?' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')
    if (!input) throw new Error('Photo input was not rendered.')
    fireEvent.change(input, { target: { files: [new File(['food'], 'meal.jpg', { type: 'image/jpeg' })] } })
    await screen.findByRole('heading', { name: 'Does this look right?' })
  }

  it('analyzes up to three leftover photos with the optional description', async () => {
    setJob(makeJob())
    render(<ConsolePage />)
    await screen.findByRole('heading', { name: 'Food left over?' })
    fireEvent.change(screen.getByLabelText('Short description (optional)'), {
      target: { value: 'Three trays, still hot and never served.' },
    })
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')
    if (!input) throw new Error('Leftover photo input was not rendered.')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['one'], 'tray-1.jpg', { type: 'image/jpeg' }),
          new File(['two'], 'tray-2.jpg', { type: 'image/jpeg' }),
          new File(['three'], 'tray-3.jpg', { type: 'image/jpeg' }),
        ],
      },
    })

    expect(await screen.findByRole('heading', { name: 'Does this look right?' })).toBeTruthy()
    expect(apiMocks.analyzeEventLeftovers).toHaveBeenCalledTimes(3)
    expect(apiMocks.analyzeEventLeftovers).toHaveBeenLastCalledWith(demoEvent.id, expect.objectContaining({
      voice_note: 'Three trays, still hot and never served.',
    }))
  })

  it('offers the three end-of-service choices and records zero surplus without starting a rescue', async () => {
    const command = vi.fn().mockResolvedValue(makeJob({ status: 'SEALED', outcome: 'no_surplus' }))
    vi.mocked(useJobSync).mockReturnValue({
      job: makeJob({ event_id: demoEvent.id }),
      loading: false,
      error: '',
      reconnecting: false,
      pending: false,
      command,
      refresh: vi.fn().mockResolvedValue(undefined),
    })
    render(<ConsolePage />)
    await screen.findByRole('heading', { name: 'Food left over?' })

    expect(screen.getByRole('button', { name: 'Nothing left' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Some left — add photos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not sure — review photos' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nothing left' }))
    expect(command).toHaveBeenCalledWith('END_OF_SERVICE_CONFIRMED', 'chef', { outcome: 'nothing_left' })
  })

  it('starts the server countdown only after the intake confirmation command', async () => {
    const job = makeJob()
    setJob(job)
    render(<ConsolePage />)
    await getToCheckView()

    expect(screen.queryByText('60:00')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and find a home' }))

    expect(vi.mocked(useJobSync).mock.results[0]?.value.command).toHaveBeenCalledWith(
      'CHEF_CONFIRMED',
      'chef',
      expect.objectContaining({ untouched_confirmed: true, photo_name: 'meal.jpg' }),
    )
    expect(screen.queryByText('60:00')).toBeNull()
  })

  it('keeps a partly served batch out of human-consumption routing', async () => {
    const job = makeJob()
    setJob(job)
    render(<ConsolePage />)
    await getToCheckView()
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))

    expect(screen.getByText('Only food kept in the back-of-house and never served can go to people.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not sure — compost only' }))
    expect(vi.mocked(useJobSync).mock.results[0]?.value.command).toHaveBeenCalledWith(
      'CHEF_CONFIRMED',
      'chef',
      expect.objectContaining({ untouched_confirmed: false }),
    )
  })

  it('does not repeat scenario-selection noise in the Details timeline', () => {
    setJob(makeJob({
      status: 'OFFERING',
      events: [
        makeEvent('SCENARIO_SELECTED', 'Scenario selected'),
        makeEvent('SCENARIO_SELECTED', 'Scenario selected'),
        makeEvent('OFFER_SENT', 'An offer was sent to Food Bank / charity.'),
      ],
    }))
    render(<ConsolePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))

    expect(screen.queryByText('Scenario selected')).toBeNull()
    expect(within(screen.getByRole('tabpanel')).getByText('An offer was sent to Food Bank / charity.')).toBeTruthy()
  })
})
