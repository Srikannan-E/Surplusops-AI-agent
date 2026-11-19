# Event lifecycle and audit events

SurplusOps uses one persisted active job as the source of truth. Commands are validated by the API, stored as hash-chained events, and published to console and portal clients through SSE with polling fallback. Clients do not own authoritative state.

## Event and intent data

An event card contains:

```text
Event {
  id, name, type, venue, start, end, guest_count, contact, status,
  menu_items: MenuItem[]
}

MenuItem {
  id, name, category, allergens[], halal, diet_tags[],
  planned_qty, holding, serving, source, confirmed
}
```

Menu allergens and halal details are venue-declared. AI extraction creates drafts; a manager confirms the event menu before saving it.

The job keeps a `DonationIntent`:

```json
{
  "status": "standby | confirmed | cancelled_no_surplus",
  "size_class": "none_likely | small | medium | large | null",
  "is_estimate": true
}
```

`size_class` is a non-binding estimate. Its quantitative thresholds are unset; do not infer kilograms from a size class. The confirmed end-of-service weight replaces the estimate.

The `reconcile` object stores explicit variance signals, confirmed actual weight, unsafe or compost-only items, event delay, and per-dish recipient acceptance. A recipient accepting only part of an offer must also enter the estimated weight for the accepted dishes; otherwise the command is rejected.

## State transitions

```text
DRAFT / EVENT_READY
  ├─ HEADS_UP_SENT → standby (estimated, non-binding)
  │    └─ SLOT_ACKNOWLEDGED
  ├─ END_OF_SERVICE_CONFIRMED(nothing_left)
  │    └─ HEADS_UP_CANCELLED (if sent) → slot released → SEALED(no_surplus)
  └─ END_OF_SERVICE_CONFIRMED(some_left | not_sure)
       ├─ no heads-up → ADHOC_REQUESTED
       └─ photo analysis and chef confirmation
            ├─ SURPLUS_CONFIRMED → countdown → OFFERING
            └─ uncertain / unsafe → compost-only path

OFFERING → OFFER_ACCEPTED | OFFER_DECLINED → REPLAN
  → COLLECTION_DISPATCHED → PICKUP_CONFIRMED → DELIVERY_CONFIRMED → AUDIT_SEALED
  → WINDOW_EXPIRED → COMPOST_REQUESTED → COMPOST_CONFIRMED → AUDIT_SEALED
```

The countdown stays stopped in `DRAFT`. It starts only when the chef confirms leftover items and their untouched, back-of-house handling history. Without that handling-history confirmation, deterministic policy prevents offers to people. `not_sure` can be reviewed and explicitly changed to `some_left`; a no-surplus outcome is final.

## Commands and event mapping

Commands are submitted to `POST /api/jobs/{batch_id}/commands` with an idempotency key. The server validates the actor and state, updates the job snapshot, appends events, and broadcasts the new snapshot.

| Command | Actor | Event(s) |
|---|---|---|
| Event selection | chef | `EVENT_READY` |
| `HEADS_UP_SENT` | organiser | `HEADS_UP_SENT`, `TOOL_CALL(send_heads_up)` |
| `SLOT_ACKNOWLEDGED` | recipient | `SLOT_ACKNOWLEDGED` |
| `REMINDER_SENT` | organiser | `REMINDER_SENT`, `TOOL_CALL(send_reminder)` |
| `END_OF_SERVICE_CONFIRMED` | chef | `END_OF_SERVICE_CONFIRMED`; no-surplus also cancels/releases and seals |
| `CHEF_CONFIRMED` | chef | `ITEMS_PROPOSED`, `CHEF_CONFIRMED`, `SURPLUS_CONFIRMED`, `WINDOW_COMPUTED` |
| Partial recipient acceptance | recipient | `INSPECTION_RESULT`, `REQUEST_UPDATED`, `OFFER_ACCEPTED` |
| Pickup / delivery | driver | `PICKUP_CONFIRMED`, `DELIVERY_CONFIRMED` |
| Compost collection | composter | `COMPOST_CONFIRMED`, `AUDIT_SEALED` |

Existing event names such as `OFFER_SENT`, `OFFER_ACCEPTED`, `OFFER_DECLINED`, `REPLAN`, `ESCALATED`, `HUMAN_TAKEOVER`, `WINDOW_EXPIRED`, `COMPOST_REQUESTED`, `DEMO_CLOCK_CHANGED`, `JOB_RESET`, and `AUDIT_SEALED` remain unchanged. Tool activity uses `TOOL_CALL`, `POLICY_BLOCK`, or `FALLBACK`.

The event envelope includes event ID, sequence, timestamp, actor, simulated flag, type, payload, previous hash, and hash. One-time pickup, delivery, and compost codes are not included in public snapshots or audit event payloads.

## Assumptions

All partner records and partner acknowledgements are simulations. The size-class labels, standby workflow, reminder timing, and any collection slot are illustrative and unverified. They must not be presented as UAE Food Bank requirements. Safe-window policy values are demo placeholders, not food-safety advice.
