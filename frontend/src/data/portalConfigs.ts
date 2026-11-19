import type { PortalConfig } from '../types'

function localDateTime(hoursAhead: number) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export const reloopConfig: PortalConfig = {
  id: 'reloop',
  name: 'Reloop',
  category: 'Organic-waste fallback',
  eyebrow: 'Partner portal simulation / 04',
  description: 'Create a mock organic-waste collection request for a safe-disposal fallback.',
  notice: 'This is a local simulation. It does not create a real Reloop booking or collection.',
  submitLabel: 'Submit simulated collection request',
  fields: [
    { name: 'venue_name', label: 'Venue name', type: 'text', required: true, defaultValue: 'Demo Hotel Dubai' },
    {
      name: 'waste_stream',
      label: 'Waste stream',
      type: 'select',
      required: true,
      defaultValue: 'food_organics',
      options: [
        { label: 'Food organics', value: 'food_organics' },
        { label: 'Packaging', value: 'packaging' },
        { label: 'Mixed organics', value: 'mixed_organics' },
      ],
    },
    { name: 'estimated_weight_kg', label: 'Estimated weight (kg)', type: 'number', required: true, min: 0.1, step: 0.1, defaultValue: 24 },
    { name: 'collection_date', label: 'Collection date / deadline', type: 'date', required: true, defaultValue: localDateTime(24).slice(0, 10) },
    { name: 'collection_window', label: 'Preferred collection window', type: 'text', required: true, defaultValue: 'Next available' },
    { name: 'collection_point', label: 'Collection point', type: 'text', required: true, defaultValue: 'Loading bay, Business Bay, Dubai', full: true },
    { name: 'notes', label: 'Notes', type: 'textarea', defaultValue: 'Demo fallback request', full: true },
  ],
}

export const collecterooConfig: PortalConfig = {
  id: 'collecteroo',
  name: 'Deliveroo Collecteroo',
  category: 'First-mile food logistics',
  eyebrow: 'Partner portal simulation / 03',
  description: 'Create a mock chilled pickup and delivery request for a selected recipient.',
  notice: 'This is a local simulation. No courier, rider, or vehicle is dispatched.',
  submitLabel: 'Create simulated dispatch',
  fields: [
    { name: 'batch_id', label: 'Rescue batch ID', type: 'text', required: true, defaultValue: 'DEMO-BATCH-001' },
    { name: 'pickup_location', label: 'Pickup location', type: 'text', required: true, defaultValue: 'Demo Hotel Dubai, Business Bay' },
    { name: 'dropoff_location', label: 'Drop-off location', type: 'text', required: true, defaultValue: 'UAE Food Bank hub (simulated)' },
    { name: 'package_count', label: 'Number of packages', type: 'number', required: true, min: 1, step: 1, defaultValue: 3 },
    { name: 'estimated_weight_kg', label: 'Estimated weight (kg)', type: 'number', required: true, min: 0.1, step: 0.1, defaultValue: 24 },
    {
      name: 'transport_type',
      label: 'Transport requirement',
      type: 'select',
      required: true,
      defaultValue: 'chilled',
      options: [
        { label: 'Ambient', value: 'ambient' },
        { label: 'Chilled', value: 'chilled' },
        { label: 'Refrigerated', value: 'refrigerated' },
      ],
    },
    { name: 'pickup_deadline', label: 'Pickup deadline', type: 'text', required: true, defaultValue: localDateTime(2) },
    { name: 'notes', label: 'Dispatch notes', type: 'textarea', defaultValue: 'Demo chilled first-mile request', full: true },
  ],
}

export const foodBankConfig: PortalConfig = {
  id: 'uae-food-bank',
  name: 'UAE Food Bank',
  category: 'Donation intake',
  eyebrow: 'Community partner portal simulation / 01',
  description: 'Submit a mock surplus-food offer with menu-derived dietary information and a human confirmation.',
  notice: 'This is a local simulation. No donation offer is sent to the UAE Food Bank. Halal and allergen fields are venue-provided, not independently verified.',
  submitLabel: 'Submit simulated food offer',
  fields: [
    { name: 'batch_id', label: 'Rescue batch ID', type: 'text', required: true, defaultValue: 'DEMO-BATCH-001' },
    { name: 'donor_venue', label: 'Donor venue', type: 'text', required: true, defaultValue: 'Demo Hotel Dubai' },
    { name: 'event_name', label: 'Event / service', type: 'text', required: true, defaultValue: 'Evening banquet service' },
    { name: 'food_summary', label: 'Food description', type: 'textarea', required: true, defaultValue: 'Vegetable biryani and grilled chicken portions', full: true },
    { name: 'estimated_weight_kg', label: 'Estimated weight (kg)', type: 'number', required: true, min: 0.1, step: 0.1, defaultValue: 24 },
    { name: 'ready_at', label: 'Ready for collection', type: 'text', required: true, defaultValue: localDateTime(1) },
    { name: 'allergens_from_menu', label: 'Menu allergens (comma separated)', type: 'text', defaultValue: 'Dairy, Nuts', full: true },
    {
      name: 'halal_status',
      label: 'Halal status (venue declaration)',
      type: 'select',
      required: true,
      defaultValue: 'verified_by_venue',
      options: [
        { label: 'Verified by venue', value: 'verified_by_venue' },
        { label: 'Declared by venue', value: 'venue_declared' },
        { label: 'Unknown', value: 'unknown' },
      ],
    },
    {
      name: 'simulated_response',
      label: 'Simulated recipient response',
      type: 'select',
      required: true,
      defaultValue: 'accept',
      options: [
        { label: 'Accept', value: 'accept' },
        { label: 'Decline', value: 'decline' },
      ],
    },
    { name: 'untouched_confirmed', label: 'Venue PIC confirms food is untouched / unserved', type: 'checkbox', defaultValue: true, full: true },
  ],
}

export const charityConfig: PortalConfig = {
  id: 'registered-charity',
  name: 'Registered charity',
  category: 'Food rescue fallback',
  eyebrow: 'Registered charity simulation / 02',
  description: 'Review a simulated fallback offer for confirmed, untouched event surplus.',
  notice: 'This is a local simulation. It does not contact a real charity.',
  submitLabel: 'Submit simulated charity response',
  fields: [
    { name: 'batch_id', label: 'Rescue batch ID', type: 'text', required: true, defaultValue: 'DEMO-BATCH-001' },
    { name: 'item_summary', label: 'Food / item description', type: 'textarea', required: true, defaultValue: 'Sealed banquet trays of vegetable biryani', full: true },
    { name: 'estimated_weight_kg', label: 'Estimated weight (kg)', type: 'number', required: true, min: 0.1, step: 0.1, defaultValue: 24 },
    { name: 'charity_name', label: 'Charity name', type: 'text', required: true, defaultValue: 'Registered charity (simulated)' },
    { name: 'pickup_location', label: 'Pickup location', type: 'text', required: true, defaultValue: 'Demo Hotel Dubai' },
    { name: 'required_until', label: 'Storage required until', type: 'text', required: true, defaultValue: localDateTime(12) },
    {
      name: 'simulated_response',
      label: 'Simulated capacity response',
      type: 'select',
      required: true,
      defaultValue: 'accept',
      options: [
        { label: 'Capacity available (accept)', value: 'accept' },
        { label: 'No capacity (decline)', value: 'decline' },
      ],
    },
  ],
}
