# SurplusOps AI — Master Context

> Portable project memory for code editors, coding agents, product assistants, and architecture reviews.

## 1. Project Identity

**Product name:** SurplusOps AI  
**Initial market:** Dubai, UAE  
**Long-term market:** Worldwide  
**Initial hackathon:** Dubai Chamber AI Agents Championship  
**Target category:** Societal Impact & Urban Circular Economy / Best Societal AI Agent  
**Source master plan:** `surplusops.pdf`  
**Tagline:**  

> The autonomous operational middleware turning midnight commercial surplus into verified community food before it spoils.

## 2. One-Sentence Product Definition

SurplusOps is a policy-aware, vendor-neutral, safety-biased food-rescue orchestration agent that turns commercial food surplus into verified community distribution through AI-assisted intake, deterministic safety decisions, recipient matching, dynamic re-planning, physical chain of custody, revocation controls, and auditable reporting.

## 3. Core Problem

Hotels, convention centers, caterers, and commercial kitchens frequently have untouched food surplus after late-night events. The food may still be suitable for donation, but the rescue window is short and coordination is fragmented.

At the point of surplus:

- Kitchen staff are exhausted and cannot make multiple calls.
- Food safety depends on time, temperature, handling, packaging, and transport.
- Charities and community fridges may have limited capacity.
- Drivers may be delayed or unavailable.
- Food banks, composting services, and logistics providers operate as separate systems.
- Manual paperwork and ESG reporting add operational friction.

The missing capability is an operational decision layer that connects these participants during the time-critical window.

## 4. Product Promise

A chef should be able to:

1. Scan an event or hall QR code.
2. Take one photo of the surplus.
3. Optionally add a short voice note.
4. Confirm the AI extraction.
5. Confirm that the food is untouched and unserved.
6. Let the agent coordinate recipients, logistics, fallback, and audit records.

The chef should not need to:

- Search for charities.
- Make several phone calls.
- Compare routes.
- Complete a long form.
- Track recipient responses.
- Manually create compliance reports.

## 5. Global Product Strategy

Dubai is the first operating environment, not the core product boundary.

The system must be built as a global core with replaceable jurisdiction packs and vendor adapters.

### Global core responsibilities

- Surplus intake
- AI-assisted food and quantity extraction
- Menu matching
- Human confirmation
- Safety eligibility orchestration
- Recipient matching
- Rescue ladder execution
- Dispatch and routing
- Dynamic re-planning
- Revocation and halting
- Chain of custody
- Audit-event recording
- ESG/report generation
- Real-time operational visibility

### Country or region pack responsibilities

- Food-safety rules
- Temperature thresholds
- Time limits
- Food classifications
- Packaging requirements
- Allergen requirements
- Donation restrictions
- Recipient eligibility rules
- Driver and transport requirements
- Data-retention rules
- Consent requirements
- Local reporting formats
- Approved vendors
- Local weather provider
- Local routing provider
- Food banks and charities
- Composting or organic-waste providers
- Languages and notification channels

The core workflow must remain unchanged when changing countries.

## 6. Who Is Harmed If the System Gets It Wrong?

Food-rescue errors have two distinct harm vectors.

### 6.1 Physical / health harm — false positive

Unsafe, contaminated, mishandled, or temperature-abused food could be routed to vulnerable people, causing:

- Foodborne illness
- Harm to vulnerable recipients
- Legal and reputational damage
- Loss of trust in food-rescue programs

### 6.2 Economic / environmental harm — false negative

Edible food could be unnecessarily routed to composting or landfill because the system is too cautious, broken, or unable to coordinate. This causes:

- Lost community meals
- Increased disposal and hauling costs
- Unnecessary emissions
- Lost commercial resources
- Reduced participation by food donors

The system must prioritize prevention of physical harm while measuring and reducing unnecessary disposal.

## 7. Safety Principles

### 7.1 Fail-to-compost safety bias

If safety cannot be established, the system must:

1. Block human-consumption distribution.
2. Revoke or avoid human-consumption authorization.
3. Route to an approved non-human-consumption fallback.
4. Notify the responsible PIC or manager.
5. Record the reason and evidence.

The generic core action should be called `SAFE_DISPOSAL_FALLBACK`, not a Dubai-specific provider name such as Reloop.

Fail-safe triggers include:

- Blurry or unreadable image
- Unknown or unmatched dish
- Missing chef confirmation
- Food not confirmed untouched
- Missing temperature evidence
- Temperature outside the permitted range
- Weather provider failure with no approved fallback
- Route ETA exceeding the safe window
- Recipient capacity not confirmed
- Driver delay
- Timer expiration
- Inconsistent vendor response
- Policy version mismatch
- Unverified state transition

The system must never guess that food is safe.

### 7.2 AI proposes; authorized humans decide

AI may propose:

- Dish identification
- Quantity estimate
- Menu matching
- Recipient candidates
- Route candidates
- Human-readable explanations
- Next operational action

The deterministic jurisdiction policy engine decides:

- Human-consumption eligibility
- Permitted rescue tiers
- Timer expiry
- Handover validity
- Revocation requirement
- Mandatory fallback

Authorized humans confirm:

- Food is unserved and untouched
- AI extraction is correct
- Physical temperature readings
- Pickup condition
- Handover condition where required by local policy

The responsible role must be configurable by jurisdiction. “Licensed food handler,” “PIC,” recipient supervisor, and similar roles must not be globally hardcoded.

### 7.3 Safety is not an LLM decision

The LLM must never directly certify food as safe, override a safety policy, or unlock a blocked route.

Use:

- Closed menu libraries
- Strict structured-output schemas
- Confidence thresholds
- Human confirmation
- Deterministic policy rules
- Original-photo retention
- Model and prompt-version logging
- Manual review for unknown or ambiguous items

## 8. Reversibility and State-Locked Revocation

Food rescue is a physical process that changes over time. Every state must define whether an action can be undone.

```text
INTAKE → DISPATCHED → IN_TRANSIT → HANDOVER
```

### 8.1 Pre-dispatch: instantly reversible

States:

- `INTAKE`
- `VALIDATED`
- `OFFERED`
- `SAFETY_CONFIRMED`

Action:

```text
REVOKE / ROUTE TO SAFE DISPOSAL FALLBACK
```

Example:

> The chef realizes that the banquet staff touched the trays.

System response:

- Stop recipient alerts.
- Cancel outstanding offers.
- Invalidate human-consumption authorization.
- Create fallback routing.
- Notify affected parties.
- Append an immutable audit event.

### 8.2 Dispatched or in transit: recall or reroute

States:

- `DISPATCHED`
- `IN_TRANSIT`

Action:

```text
RECALL_OR_REROUTE
```

Triggers:

- Driver delay
- Temperature excursion
- Vehicle failure
- Recipient closure
- Safe window falling below required margin
- Missing handover evidence
- Safety alert

System response:

- Revoke human-consumption authorization.
- Notify the driver.
- Cancel or block recipient handover.
- Route directly to approved organic fallback.
- Record reason and timestamp.

Driver-facing message:

> Safe window exceeded for human consumption. Proceed directly to approved organic fallback.

### 8.3 Physical handover: final digital lock

State:

- `HANDED_OVER`

Once the receiving party confirms physical custody:

- No automated undo should claim to reverse the handover.
- The final custody record is locked.
- The receiving party, evidence, timestamp, and hash are preserved.
- An incident or recall workflow may be opened if required.
- Authorized stakeholders can be notified.
- Contradictory updates must be prevented.

Digital state must never pretend to reverse physical reality.

## 9. Recommended State Machine

```text
CREATED
  ↓
PHOTO_RECEIVED
  ↓
EXTRACTED
  ↓
AWAITING_CHEF_CONFIRMATION
  ↓
SAFETY_CONFIRMED
  ↓
EVALUATING_RECIPIENTS
  ↓
RECIPIENT_OFFERED
  ├── RECIPIENT_ACCEPTED
  │      ↓
  │   DRIVER_ASSIGNED
  │      ↓
  │   PICKUP_PENDING
  │      ↓
  │   PICKED_UP
  │      ↓
  │   IN_TRANSIT
  │      ↓
  │   HANDOVER_PENDING
  │      ↓
  │   DELIVERED
  │      ↓
  │   CLOSED
  │
  ├── RECIPIENT_DECLINED
  │      ↓
  │   REROUTING
  │      ↓
  │   next permitted tier
  │
  ├── COMPOST_FALLBACK
  │
  └── MANAGER_ESCALATION
```

Every transition must record:

- Timestamp
- Actor
- Previous state
- New state
- Reason
- Input data
- Policy decision
- Evidence snapshot
- Previous event hash
- Current event hash

## 10. Rescue Ladder

The ladder is policy-driven and configurable.

| Tier | Generic destination | Example Dubai destination | Activation condition |
|---|---|---|---|
| 1 | Community fridge or local charity | Smart fridge / local charity | Untouched food, permitted category, sufficient safe window, confirmed capacity |
| 2 | Food bank or consolidation hub | UAE Food Bank hub | Packaged, ambient, chilled, or bulk stock suitable for regional distribution |
| 3 | Approved organic-waste fallback | Reloop-style composting provider | Touched food, expired safe window, failed safety evidence, or all human recipients decline |
| 4 | Human manager escalation | On-duty venue manager | Technical error, ambiguous safety evidence, logistics failure, or policy exception |

If the untouched-food confirmation is missing or negative, human-consumption tiers must be blocked.

## 11. Policy-Pack Architecture

No safety threshold, legal rule, recipient rule, or report format should be hardcoded into the global orchestration engine.

Suggested policy contract:

```python
class FoodSafetyPolicy(Protocol):
    policy_id: str
    jurisdiction: str
    version: str

    def classify_food(self, item: FoodItem) -> FoodClass: ...

    def evaluate_intake(
        self,
        batch: SurplusBatch,
        evidence: SafetyEvidence,
    ) -> SafetyDecision: ...

    def evaluate_transport(
        self,
        batch: SurplusBatch,
        route: RoutePlan,
        evidence: SafetyEvidence,
    ) -> SafetyDecision: ...

    def evaluate_handover(
        self,
        batch: SurplusBatch,
        handover: HandoverEvidence,
    ) -> SafetyDecision: ...

    def permitted_recipient_types(
        self,
        batch: SurplusBatch,
    ) -> list[RecipientType]: ...
```

Suggested directory:

```text
policy_packs/
  base/
    schemas.py
    decisions.py
    evidence.py

  uae_dubai/
    policy.yaml
    food_categories.yaml
    thresholds.yaml
    recipient_rules.yaml
    reporting_schema.yaml
    translations/
    tests/

  country_b/
    policy.yaml
    food_categories.yaml
    thresholds.yaml
    recipient_rules.yaml
    reporting_schema.yaml
    translations/
    tests/
```

Every safety decision must store:

```json
{
  "jurisdiction": "UAE-Dubai",
  "policy_id": "dubai-food-rescue-demo",
  "policy_version": "0.1.0",
  "decision_timestamp": "2026-10-31T23:32:08Z"
}
```

The policy version is essential for explaining decisions after rules change.

## 12. Vendor-Neutral Adapter Architecture

The orchestrator must depend on internal interfaces, never directly on a Dubai vendor.

### Weather

```python
class WeatherProvider(Protocol):
    async def get_conditions(
        self,
        location: Location,
        timestamp: datetime,
    ) -> WeatherConditions: ...
```

Possible adapters:

- Open-Meteo
- Government weather services
- Commercial weather APIs
- Cached provider
- Demo simulator

### Routing

```python
class RoutingProvider(Protocol):
    async def estimate_route(
        self,
        origin: Location,
        destination: Location,
        transport_mode: TransportMode,
    ) -> RouteEstimate: ...
```

Possible adapters:

- OSRM
- Google Maps
- Mapbox
- HERE
- Local logistics providers

### Recipient network

```python
class RecipientNetworkAdapter(Protocol):
    async def search_recipients(
        self,
        criteria: RecipientCriteria,
    ) -> list[RecipientCandidate]: ...

    async def create_offer(
        self,
        offer: RescueOffer,
    ) -> OfferResponse: ...

    async def revoke_offer(
        self,
        offer_id: str,
        reason: RevocationReason,
    ) -> OfferResponse: ...
```

Possible adapters:

- UAE Food Bank
- Community-fridge networks
- Local charities
- Food-rescue NGOs
- Municipal distribution systems

### Logistics

```python
class LogisticsProvider(Protocol):
    async def create_dispatch(
        self,
        dispatch: DispatchRequest,
    ) -> DispatchResponse: ...

    async def update_dispatch(
        self,
        dispatch_id: str,
        update: DispatchUpdate,
    ) -> DispatchResponse: ...

    async def revoke_dispatch(
        self,
        dispatch_id: str,
        reason: RevocationReason,
    ) -> DispatchResponse: ...
```

Possible adapters:

- Deliveroo/Collecteroo-style logistics
- Local courier fleets
- Hotel-owned drivers
- Volunteer logistics systems
- Demo logistics simulator

### Organic fallback

```python
class OrganicFallbackProvider(Protocol):
    async def create_fallback(
        self,
        batch: SurplusBatch,
        reason: FallbackReason,
    ) -> FallbackResponse: ...

    async def update_fallback(
        self,
        fallback_id: str,
        update: FallbackUpdate,
    ) -> FallbackResponse: ...
```

Possible providers:

- Reloop
- Composting services
- Anaerobic digestion facilities
- Municipal organic-waste systems
- Approved landfill fallback where no better option exists

Each adapter must expose whether data is:

- `LIVE`
- `CACHED`
- `SIMULATED`
- `HUMAN_CONFIRMED`

The UI must show this status. Simulations must never be silently represented as live.

## 13. Authorization Model

Issue short-lived, revocable authorizations for physical stages:

```text
HUMAN_CONSUMPTION_AUTHORIZATION
PICKUP_AUTHORIZATION
TRANSIT_AUTHORIZATION
HANDOVER_AUTHORIZATION
```

Each authorization must be:

- Bound to the batch
- Bound to the current state
- Short-lived
- Revocable
- Signed or integrity-protected
- Invalidated when safety evidence fails

Example:

```json
{
  "batch_id": "batch_001",
  "authorization": "HUMAN_CONSUMPTION",
  "valid_until": "2026-10-31T23:58:00Z",
  "policy_version": "dubai-demo-0.1",
  "revoked": false
}
```

When the window expires, the interface must clearly show:

```text
HUMAN CONSUMPTION AUTHORIZATION REVOKED
PROCEED TO APPROVED ORGANIC FALLBACK
```

## 14. Revocation Service

Revocation must be a first-class domain operation.

```python
class RevocationService:
    async def revoke(
        self,
        batch_id: str,
        reason: RevocationReason,
        actor: Actor,
    ) -> RevocationResult:
        ...
```

Required behavior:

1. Validate that the current state permits revocation.
2. Lock the batch to prevent concurrent conflicting actions.
3. Revoke active recipient offers.
4. Revoke or update logistics dispatches.
5. Invalidate human-consumption authorization.
6. Create fallback routing.
7. Notify all affected parties.
8. Append an immutable audit event.
9. Publish a real-time dashboard event.

Use optimistic locking or database row locks to prevent duplicate or contradictory transitions.

## 15. Chain of Custody and Audit

Record an immutable event chain for:

- Intake
- AI extraction
- Human confirmation
- Safety decisions
- Recipient offers
- Recipient declines
- Dispatch
- Revocation
- Pickup
- Temperature verification
- Handover
- Fallback
- Closure

Suggested event fields:

```text
id
batch_id
event_type
decision
policy_pack_id
policy_version
evidence_snapshot
actor
timestamp
previous_event_hash
event_hash
```

The audit package should include:

- Venue and event
- Surplus items and weights
- AI extraction confidence
- Chef confirmations
- Temperature records
- Weather source and timestamp
- Recipient decisions
- Re-routing history
- Pickup and delivery events
- Estimated meals
- Emissions-factor calculation
- SHA-256 integrity hash
- Policy version
- Live/cached/simulated labels
- Demo-policy disclaimer where applicable

Do not call the hackathon PDF a legally certified report unless an authorized certification process exists. Use:

> Tamper-evident audit package for pilot and ESG workflow validation.

## 16. Dubai Initial Implementation

### Dubai-specific context

The Dubai pilot may integrate or simulate:

- ne’ma
- UAE Food Bank
- Reloop
- Deliveroo/Collecteroo-style logistics
- Smart community fridges
- Volunteers.ae
- Open-Meteo
- OSRM
- Telegram
- Dubai Municipality-oriented reporting

These are adapters and policy-pack content, not global assumptions.

### Dubai pilot policy

The Dubai implementation must encode:

- Local food categories
- Local safety thresholds
- Required untouched/unserved confirmation
- Temperature and transport evidence
- Recipient eligibility
- Local reporting fields
- Arabic/English support where practical
- Dubai-specific vendor and fallback adapters

All legal and safety thresholds must be validated with a qualified local food-safety expert before production use. Hackathon values must be labelled as demo policy values.

## 17. Recommended Technology Stack

### Backend

- Python 3.11+
- Langgraph
- FastAPI
- Pydantic v2
- SQLAlchemy or SQLModel
- SQLite for the prototype
- Repository abstraction for future PostgreSQL support
- WebSockets for real-time updates
- Structured JSON logging

### AI

- Gemini 2.5 Flash or an equivalent multimodal model
- Strict JSON schema
- Closed event menu context
- Optional voice transcription and parsing

### Messaging

- Telegram Bot API
- aiogram 3.x

### Frontend

- React or Vanilla JavaScript
- Leaflet.js
- OpenStreetMap
- WebSocket event stream

### External services

- Open-Meteo for initial weather integration
- OSRM for initial routing
- Mock adapters for unavailable partner APIs

### Audit

- ReportLab or WeasyPrint
- SHA-256 hash chain

## 18. Suggested Repository Structure

```text
surplusops/
  app/
    main.py
    config.py

    api/
      routes_events.py
      routes_batches.py
      routes_dispatch.py
      routes_audit.py
      routes_demo.py
      websocket.py

    domain/
      models.py
      enums.py
      policies.py
      custody.py
      authorizations.py

    intake/
      vision_client.py
      voice_parser.py
      menu_matcher.py
      schemas.py

    safety/
      decay_engine.py
      eligibility.py
      evidence.py
      revocation.py

    orchestration/
      state_machine.py
      ladder.py
      recipient_scoring.py
      replan.py

    integrations/
      weather/
      routing/
      recipients/
      logistics/
      organic_fallback/
      telegram.py

    audit/
      events.py
      hash_chain.py
      pdf_generator.py

    persistence/
      database.py
      repositories.py
      migrations/
      seed.py

    realtime/
      event_bus.py
      websocket_manager.py

  policy_packs/
    base/
    uae_dubai/
    example_country_b/

  web/
    dashboard/
      panes/
      map/
      trace/
      mobile-twin/

  tests/
    unit/
    integration/
    policy_packs/
    safety/
    state_machine/
    demo/

  scripts/
    seed_demo.py
    reset_demo.py
    run_demo.py
    verify_audit.py

  docker/
  .env.example
  README.md
```

## 19. Four-Week Execution Plan

### Week 1 — Global domain core, policy abstraction, safety, and AI intake

Build:

- Global domain models
- Jurisdiction and policy-pack interfaces
- UAE/Dubai initial policy pack
- Example second-country or mock policy pack
- Deterministic safety engine
- Evidence model
- Food classification model
- State machine
- Immutable event log
- Strict AI intake schemas
- Vendor adapter interfaces  
- Seeded venue, event, menu, recipient, and route data
- Unit tests for policy and state transitions

Milestone:

- A photo becomes validated structured surplus data.
- The safety engine returns eligible, blocked, or review-required.
- The same workflow can run against Dubai and a mock non-Dubai policy pack.
- No LLM output can override safety rules.

### Week 2 — Dubai adapters, Telegram, re-planning, and revocation

Build:

- Open-Meteo adapter
- OSRM adapter
- Telegram bot
- Event QR deep links
- Photo and optional voice-note intake
- Confirmation buttons
- Recipient offer flow
- Accept/decline actions
- Rescue-ladder state machine
- Recipient capacity and timeout simulation
- Pre-dispatch revoke
- In-transit revoke simulation
- Driver safety-window notification
- Fallback escalation

Milestone:

- Two phones can participate in a live flow.
- A recipient decline causes automatic rerouting.
- A chef can revoke before dispatch.
- Human-consumption authorization is invalidated on revoke.
- Every transition appears in the trace.

### Week 3 — Command center, custody controls, map, and audit

Build:

- Tri-pane dashboard
- Mobile/Telegram twin
- Agent trace console
- Dubai map and route
- Countdown and authorization status
- Current custodian display
- Reversible/locked state display
- Revocation control
- Chain-of-custody timeline
- PDF audit package
- Hash-chain verification
- Cached and simulated integration indicators

Milestone:

- Judges can see the full workflow in one browser window.
- Live mobile actions update the dashboard.
- Decline and revocation are obvious.
- Handover becomes visibly locked.
- Audit package is generated quickly.

### Week 4 — Reliability, deployment, global extensibility proof, and rehearsal

Build:

- Cloud deployment
- HTTPS and Telegram webhook
- Authentication
- Rate limiting
- Upload-size limits
- Health checks
- Structured error reporting
- API response caching
- Vendor simulator
- Demo reset
- Live/cached/simulated status indicators
- Offline fallback recording
- Policy-pack swap demonstration
- Second-country mock integration
- Mobile responsiveness
- Accessibility improvements

Milestone:

- Ten consecutive successful demo runs.
- At least three forced recipient declines.
- At least three forced fallback routes.
- No duplicate dispatches.
- No lost state after refresh.
- Recovery from external API timeout.
- Demo reset works without manual database changes.
- Changing policy/vendor packs does not require changing core orchestration.

## 20. Demo-Critical Golden Path

```text
Event QR scan
    ↓
Chef photo + optional voice note
    ↓
Multimodal AI extracts dishes and quantities
    ↓
Chef confirms extraction
    ↓
Chef confirms 100% untouched / unserved
    ↓
Deterministic safety engine calculates safe window
    ↓
Recipient scoring selects Tier 1
    ↓
Charity receives accept/decline request
    ↓
Charity declines because capacity is full
    ↓
Agent automatically reroutes to Tier 2
    ↓
Driver dispatch is created
    ↓
Pickup QR and temperature recorded
    ↓
Drop-off PIN/QR confirmed
    ↓
Audit PDF generated with hash and metrics
```

## 21. Recommended Three-Minute Demo

### 0:00–0:30 — Problem

Explain that safe commercial surplus expires because late-night coordination is slow and fragmented.

### 0:30–1:00 — Intake

Show:

- Chef scans QR.
- Chef submits a tray photo.
- AI extracts:

```text
Mutton biryani — 3 trays
Roasted vegetables — 2 trays
Confidence — 96%
```

- Chef taps `Looks right`.
- Chef taps `100% untouched`.

### 1:00–1:40 — Agent decision

Show:

- Dubai weather
- Ambient temperature
- Safe transport window
- Tier 1 recipient
- Route and ETA
- Recipient offer

Say:

> AI extracts and proposes; the deterministic safety engine controls eligibility.

### 1:40–2:15 — Failure test

On the second phone tap:

```text
Decline — Capacity Full
```

Show:

- Recipient decline
- Countdown update
- Tier 1 removal
- Tier 2 selection
- New route
- Driver dispatch

### 2:15–2:35 — Revocation test

Chef taps:

```text
Revoke — Staff Touched Trays
```

Show:

- Offer cancellation
- Human-consumption authorization revoked
- Fallback route created
- Immutable event added

### 2:35–2:50 — Successful handover path

Reset demo, accept the offer, show pickup QR, temperature, and drop-off PIN.

### 2:50–3:00 — Audit and close

Generate the audit package and show:

- Food diverted
- Estimated meals
- Re-routing history
- Custody timeline
- Policy version
- SHA-256 integrity hash

Closing statement:

> SurplusOps does not replace food banks, charities, logistics providers, or composting services. It connects them at the moment when time, safety, and coordination matter most.

## 22. What Must Be Real

- Photo-to-structured-dish extraction
- Closed-menu matching
- Chef confirmation
- Untouched-food safety gate
- Deterministic decay calculation
- Recipient scoring
- Recipient decline and re-planning
- State transitions
- Real-time dashboard trace
- Revocation behavior
- PDF audit generation
- Hash calculation
- QR event lookup
- At least one real Telegram phone

## 23. What May Be Simulated, But Must Be Labelled

- UAE Food Bank API
- Reloop API
- Deliveroo/Collecteroo dispatch
- Driver GPS movement
- Smart-fridge live capacity
- Municipality submission
- Volunteer courier network
- Actual food-safety certification
- Real meal distribution

Use explicit badges:

```text
LIVE
CACHED
SIMULATED
AI-EXTRACTED
HUMAN-CONFIRMED
POLICY-DERIVED
```

## 24. Metrics

### Operational metrics

- Time from photo submission to first recipient offer
- Time from decline to successful reroute
- Number of kitchen interactions
- Percentage of batches with complete audit trail
- Percentage safely routed
- Percentage routed to fallback
- Duplicate-dispatch rate
- External API failure recovery rate
- Revocation response time

### Impact metrics

- Kilograms diverted
- Estimated meals recovered
- Estimated emissions avoided
- Disposal reduction
- Kitchen hours saved
- Manual coordination steps removed

All estimates must show their assumptions. For example:

```text
Estimated meals = edible kilograms / configured meal-size factor
```

Do not present estimates as official measurements.

## 25. Business Model

The product uses a B2B2C model.

### B2B

Hotels, convention centers, resorts, caterers, and venues pay SaaS fees for:

- Waste-reduction operations
- Compliance workflow
- ESG reporting
- Administrative savings
- Overproduction insights
- Fallback and disposal optimization

Indicative Dubai pricing from the original plan:

- Boutique / standalone: AED 800 per month
- Large resort / convention center: AED 2,200 per month
- Common pitch example: AED 1,200 per month

These prices are hypotheses to validate, not guaranteed market facts.

### B2C / community layer

The B2B revenue can subsidize a free public distribution layer:

- Community-fridge map
- Food availability information
- Camp or worker-accommodation deliveries
- Multilingual access

Do not build the full public B2C surface before the rescue workflow is reliable.

## 26. Positioning Against Existing Ecosystem

SurplusOps is not a replacement for existing organizations.

- ne’ma: policy, strategy, and national food-waste initiatives
- UAE Food Bank: redistribution infrastructure
- Winnow: measurement and computer-vision waste analytics
- Reloop: composting and organic-waste services
- Deliveroo/Collecteroo: logistics capacity
- Volunteer platforms: volunteer coordination

SurplusOps provides the operational decision layer connecting them at the time-critical moment.

Key distinction:

> Winnow measures food after it enters the waste stream. SurplusOps intervenes upstream before safe, unserved food reaches the bin.

## 27. Security, Privacy, and Reliability Requirements

- Never place secrets in source code.
- Use environment variables for API keys and bot tokens.
- Authenticate admin and dashboard endpoints.
- Restrict image upload size and type.
- Validate all AI and vendor payloads.
- Use idempotency keys for actions and callbacks.
- Protect webhook endpoints.
- Use row locking or optimistic concurrency for state transitions.
- Avoid duplicate dispatches.
- Keep audit events append-only.
- Encrypt sensitive data at rest where production requirements demand it.
- Minimize personal data in recipient and driver records.
- Define retention and deletion rules per jurisdiction.
- Do not expose private recipient information on public maps.
- Log errors explicitly; never silently convert failures into successful-looking actions.

## 28. Product and Engineering Non-Negotiables

1. Safety dominates optimization.
2. Uncertainty is not permission.
3. Every decision is jurisdiction-aware.
4. Every vendor is replaceable.
5. Revocation is a first-class operation.
6. Physical custody outranks digital state.
7. Digital handover creates a final lock.
8. Every simulation is labelled.
9. The LLM cannot override deterministic policy.
10. Every important decision is auditable.
11. External failures must be visible and handled explicitly.
12. Keep the rescue workflow reliable before adding broad features.

## 29. Definition of Done

The prototype is demo-ready when:

- Chef intake takes under 20 seconds after opening the bot.
- AI extraction produces validated structured data.
- Chef confirms extraction and untouched status.
- Safety engine shows a visible countdown.
- Tier 1 is selected using recipient capacity and route ETA.
- A recipient decline automatically triggers Tier 2 re-planning.
- Chef revocation cancels the human-consumption route.
- Human-consumption authorization is visibly revoked when required.
- Every state transition appears in the dashboard.
- The map updates without a refresh.
- Pickup and delivery can be completed through QR/PIN actions.
- Handover locks the final custody state.
- PDF audit package is generated.
- PDF includes integrity hash and policy version.
- Unsafe or ambiguous food cannot reach human-consumption tiers.
- External API failure is handled through a visible cached or simulation adapter.
- Ten consecutive rehearsals complete without manual intervention.
- Simulated components are visibly labelled.
- No unsupported legal or impact claim is presented as fact.
- Swapping policy/vendor packs does not require rewriting the global orchestration core.

## 30. Priority Order Under Time Pressure

Build in this order:

1. Global domain model
2. Policy-pack abstraction
3. Deterministic fail-safe safety engine
4. State-locked revocation
5. Vendor adapter interfaces
6. Dubai implementation pack
7. Recipient decline and re-planning
8. Chain of custody
9. Real-time command center
10. Audit package
11. Deployment and demo recovery
12. Map polish
13. Analytics
14. Public B2C map
15. Additional integrations

Cut or postpone:

- Full volunteer marketplace
- Broad multilingual expansion
- Predictive overproduction analytics
- Multiple real external integrations
- Full public community map

Do not cut:

- Safety gate
- Deterministic policy engine
- Recipient decline and rerouting
- Revocation
- Chain of custody
- Auditability
- Demo reset and fallback behavior

## 31. Key Judge Message

Use this explanation:

> SurplusOps is not an AI that decides whether food is safe. It is an AI-assisted operational coordinator. AI extracts and proposes. A configured jurisdiction policy evaluates eligibility. Authorized humans provide the required physical confirmations. If evidence is missing or a technical link fails, human-consumption authorization is revoked and the batch goes to the approved organic fallback.

## 32. Key Product Message

> SurplusOps is the autonomous operational layer that turns commercial food surplus into verified community meals before the safe window expires.

## 33. Implementation Guidance for Future AI Assistants

When modifying this project:

- Read this file before changing architecture or scope.
- Preserve the global-core / local-pack separation.
- Do not hardcode Dubai vendors into core orchestration.
- Do not move safety decisions into an LLM prompt.
- Treat revocation and custody state as domain-critical.
- Preserve explicit live/cached/simulated status.
- Add tests for every policy and state transition.
- Prefer adapter interfaces over provider-specific conditionals.
- Keep policy versions in all safety decisions and audit outputs.
- Treat missing evidence as unsafe for human consumption.
- Never silently fall back to a success-shaped response.
- Avoid unrelated refactors during the four-week build.
- Validate the exact demo path after changes.

## 34. Reference File

The original product master plan is available at:

`/Users/sniper/Documents/AI-agent/surplusops.pdf`

