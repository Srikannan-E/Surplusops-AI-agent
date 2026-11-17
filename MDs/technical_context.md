# SurplusOps AI — Technical Context

> Read this guide for product architecture, safety, domain modeling, integrations, and engineering constraints. The short project overview and links are in [master_context.md](./master_context.md).

Before provisioning accounts or external services, use the [external setup checklist](./external_setup_checklist.md). It distinguishes local development/testing from the hosted judge demo and identifies which partner integrations should remain simulated.

## Product and architecture

SurplusOps is a global, policy-aware and vendor-neutral food-rescue orchestration agent. Dubai is the first implementation, not the boundary of the core system.

**Required orchestration framework:** LangGraph. Use a typed graph/state machine for intake, policy evaluation, recipient offers, re-planning, revocation, human approval interrupts, and audit events. Keep food-safety eligibility and state-transition rules deterministic; LangGraph organizes execution but does not make an LLM the safety authority.

**Required model portability:** Implement AI calls behind a provider-neutral interface compatible with LangChain chat-model abstractions. Gemini is the initial candidate; Anthropic Claude and other providers should be addable through configuration/provider adapters without changing domain logic or graph nodes.

**Required caching:** Separate durable LangGraph checkpoints from response/data caching. Checkpoints resume workflow state; caches reuse eligible provider or deterministic results. Neither may bypass current safety-policy evaluation, authorization expiry, human confirmation, or audit logging.

```text
Global orchestration core
  ├── Jurisdiction policy packs (UAE/Dubai first)
  ├── Vendor adapters (weather, routing, recipients, logistics, fallback)
  ├── Localized interfaces and reporting
  └── Append-only safety and custody audit events
```

Changing countries should primarily mean selecting a policy pack and adapters—not rewriting the orchestration workflow.

### Global core responsibilities

- Surplus intake and menu matching
- AI-assisted dish/quantity extraction
- Required human confirmations
- Safety eligibility orchestration
- Recipient matching and rescue ladder
- Dispatch, re-planning, revocation, and escalation
- Physical chain of custody
- Audit-event recording and reporting
- Real-time operational visibility

### Jurisdiction-pack responsibilities

Country/region configuration must cover food categories, safety rules, temperature/time limits, packaging, allergens, donation restrictions, recipient eligibility, transport requirements, required roles/evidence, privacy/retention, reporting, languages, and approved vendors. Store the pack ID and version with every safety decision.

## Safety and harm model

There are two harm vectors:

1. **False positive:** unsafe food reaches people, risking illness and loss of trust.
2. **False negative:** safe food is unnecessarily discarded, wasting food, money, and potential community meals.

Physical safety takes priority. Measure and reduce unnecessary fallback without weakening required safety evidence.

### Fail-safe behavior

If evidence is missing, inconsistent, expired, or unverifiable:

1. Block or revoke authorization for human consumption.
2. Do not infer safety from an LLM, default value, or unavailable API.
3. Use a configured and available approved organic-waste fallback, or escalate to the responsible manager.
4. Record the evidence, reason, policy version, action, actor, and timestamp.

Use the generic core action `SAFE_DISPOSAL_FALLBACK`; a provider such as Reloop is a Dubai adapter, not a global assumption.

Possible triggers: unreadable image, unknown dish, missing confirmation, food not confirmed untouched, missing/out-of-policy temperature evidence, route beyond permitted window, unconfirmed recipient capacity, driver delay, expired authorization, policy mismatch, malformed vendor response, or failed state transition.

### AI proposes; policy and authorized humans decide

AI may propose dish identity, quantity, menu matches, recipient candidates, routes, or explanations. It must not certify food as safe or unlock a blocked route.

A deterministic jurisdiction policy decides eligibility, permitted tiers, expiry, handover validity, revocation, and fallback. Authorized humans confirm extraction and the physical facts required by the local policy.

Use closed menus, schema validation, confidence thresholds, human confirmation, manual review for unknown items, and model/prompt version logging.

### LangGraph orchestration and model portability

- Define a versioned, typed `SurplusOpsState` containing batch ID, state, policy-pack/version, evidence references, recipient attempts, authorization expiry, and audit/event references. Avoid placing raw secrets or unnecessary personal data in graph state/checkpoints.
- Represent steps as explicit graph nodes with typed inputs/outputs. Use conditional edges for eligibility, decline/timeout, re-plan, revoke, fallback, and escalation.
- Use LangGraph checkpointing for workflow recovery and human-in-the-loop interrupt/resume. Persist a stable thread/run identifier and apply access controls and retention to checkpoint storage.
- Keep external side effects (recipient offers, dispatch, revoke, report submission) in dedicated adapter/service nodes with idempotency keys. Do not retry side effects blindly; reconcile provider status before retrying.
- Keep policy decisions in deterministic, versioned functions called by graph nodes. An LLM can return a typed proposal, but graph edges must be selected from validated policy/service results—not free-form model text.
- Place image/voice extraction behind an application-owned contract such as `FoodIntakeModel.extract(...) -> IntakeProposal`. Provider/model selection must happen server-side from an allowlist/configuration, never from an arbitrary browser-supplied model name.
- Keep provider-specific message/image conversion, structured-output behavior, retry rules, token accounting, and model metadata inside provider adapters. Normalize responses into a common validated schema.
- Record provider, model ID, prompt version, schema version, request ID, latency, token/usage data when available, cache status, and parse/validation outcome for observability and cost analysis.
- Test each supported provider against the same intake contract and fixtures. Model switching must not change safety decisions or the graph's domain semantics.

Suggested configuration:

```text
AI_PROVIDER=gemini|anthropic
AI_MODEL_NAME=<provider-specific model ID>
AI_TEMPERATURE=<task configuration; prefer deterministic extraction settings>
AI_REQUEST_TIMEOUT_SECONDS=30
AI_MAX_RETRIES=1
AI_RESPONSE_CACHE_TTL_SECONDS=...
```

Keep credentials provider-specific and server-side (for example `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`). Do not require all provider accounts at once; only configure credentials for providers enabled in the environment. Model IDs and capabilities change, so validate the selected model against current official provider documentation before deployment.

## Caching and persistence

Treat these as separate mechanisms:

1. **LangGraph checkpoint store:** durable workflow state used to resume a batch after interruption or await human action. It is not a cache and must follow privacy, access-control, and retention requirements.
2. **Provider response cache:** optional reuse for safe, identical AI extraction requests in development/demo mode. Scope by tenant/user and include hashes/versions for image content, menu context, policy-independent prompt, output schema, provider, and model. Never share private image/audio results across users.
3. **External-data cache:** weather and route estimates may use bounded TTLs with source timestamp, location/route key, and freshness status. Re-evaluate safety using current time, policy, remaining window, and available evidence after every cache hit.
4. **Deterministic fixture cache:** preset judge scenarios may use committed synthetic fixtures and stable outputs, visibly labelled `SIMULATED`; do not present these as live model responses.
5. **Application/database state:** source of truth for batches, audit events, authorization, offers, and custody. A cache must never be authoritative for these.

Cache only pure, repeatable operations. Do not cache:

- Safety eligibility or remaining-time decisions without re-evaluating them against current time/evidence/policy.
- Recipient capacity/acceptance as if still current.
- Dispatch, revoke, handover, or other side effects.
- User-specific sensitive content across users or tenants.

Cache key versioning must include all inputs that can affect the result. Invalidate or namespace entries when provider/model, prompt, schema, menu, policy, or configuration versions change. Expose cache hits and data age in the UI/logs. Add cache bypass controls for tests.

Use node-level LangGraph caching only for pure nodes whose full inputs are represented in the key. Never cache side-effect nodes. Persist/restore workflow state using the configured checkpointer; do not confuse graph replay/checkpointing with rerunning non-idempotent external actions.

### Allergen and halal/dietary metadata

Allergen, halal, and dietary values must come from a venue-approved menu or another traceable source, with provenance and confirmation status displayed. Vision/LLM output must not infer allergens, ingredients, halal status, or cross-contact safety.

Suggested statuses:

- `VENUE_DECLARED`: supplied by the venue; not independently certified by SurplusOps.
- `VERIFIED_BY_VENUE`: confirmed by an authorized venue role; record who and when.
- `UNKNOWN`: no reliable metadata is available.

Do not present these as legal, religious, laboratory, or third-party certification. Missing cross-contact information remains unknown and follows local policy.

## State machine, custody, and revocation

Suggested lifecycle:

```text
CREATED → PHOTO_RECEIVED → EXTRACTED → AWAITING_CONFIRMATION
→ SAFETY_CONFIRMED → EVALUATING_RECIPIENTS → RECIPIENT_OFFERED
→ DRIVER_ASSIGNED → PICKUP_PENDING → PICKED_UP → IN_TRANSIT
→ HANDOVER_PENDING → DELIVERED → CLOSED
```

Declines/timeouts lead to `REROUTING`; safety failures lead to `COMPOST_FALLBACK`/`SAFE_DISPOSAL_FALLBACK`; technical or ambiguous cases can lead to `MANAGER_ESCALATION`.

### Reversibility

- **Pre-dispatch:** revoke offers, invalidate human-consumption authorization, and route to fallback.
- **Dispatched/in transit:** recall or reroute; invalidate authorization and notify driver/recipient.
- **After physical handover:** do not pretend to undo custody. Lock the record and, if needed, open an incident/recall workflow.

Revocation is a first-class, idempotent operation. Lock or version state transitions to prevent conflicting concurrent actions. A revocation must cancel/update active offers and dispatches, invalidate authorization, create fallback/escalation, notify affected parties, append an audit event, and update the live dashboard.

Use short-lived batch/state-bound authorizations for human consumption, pickup, transit, and handover. Expiry or a safety event invalidates them.

### Recipient distance, holds, delays, and no-shows

Recipient availability is not enough; the route must remain feasible through the actual handover:

- Offer only if estimated travel time plus a policy-configured safety buffer fits inside the remaining authorized window. Otherwise skip that candidate and evaluate a nearer eligible recipient.
- Acceptance creates a short, policy-configured capacity hold, not a guarantee of collection or safe delivery. If pickup is not confirmed before the hold expires, release capacity, record the timeout, and re-offer to the next eligible recipient if time remains.
- Recompute ETA and the remaining window on relevant driver/location/status updates. If the safe cutoff is exceeded, revoke human-consumption and handover authorization, notify the driver and recipient not to collect/consume, and cancel the handover.
- Do not confirm handover at or after the configured cutoff. The receiving interface must show a blocking/expired status.
- If an authorized recipient finds the food unsafe at handover, reject it, prevent distribution, route to the configured fallback where physically feasible, and log an incident.
- Track recipient no-shows and declines. Apply configurable cooldown/throttling or temporary pause after repeated no-shows; do not silently deprioritize without an auditable reason.
- Any reroute to organic fallback after pickup must be operationally feasible; if no approved fallback can be reached safely, halt distribution and escalate to the responsible operator. Digital state must not claim physical delivery to a fallback that did not occur.

The initial hackathon B2C layer is future-only. If later piloted, limit it initially to packaged ambient items through licensed/authorized channels under the relevant jurisdiction pack; do not assume public B2C access for prepared/perishable banquet meals.

## Rescue ladder

| Tier | Generic destination | Dubai example | Requirements |
|---|---|---|---|
| 1 | Local charity/community fridge | Seeded charity/fridge | Policy-eligible food, sufficient window, capacity confirmed |
| 2 | Food bank/consolidation hub | UAE Food Bank adapter | Compatible food and feasible transport |
| 3 | Organic-waste fallback | Reloop-style adapter | Safety failure/expiry or no eligible recipient |
| 4 | Human manager | Venue manager | Technical, policy, or logistics exception |

Touched or unconfirmed food must not enter human-consumption tiers.

## Policy and integration interfaces

Use adapter contracts; do not make orchestration code call provider APIs directly.

```python
class FoodSafetyPolicy(Protocol):
    policy_id: str
    jurisdiction: str
    version: str
    def evaluate_intake(self, batch, evidence) -> SafetyDecision: ...
    def evaluate_transport(self, batch, route, evidence) -> SafetyDecision: ...
    def evaluate_handover(self, batch, evidence) -> SafetyDecision: ...

class WeatherProvider(Protocol):
    async def get_conditions(self, location, timestamp) -> WeatherConditions: ...

class RoutingProvider(Protocol):
    async def estimate_route(self, origin, destination, mode) -> RouteEstimate: ...

class RecipientNetworkAdapter(Protocol):
    async def search_recipients(self, criteria) -> list[RecipientCandidate]: ...
    async def create_offer(self, offer) -> OfferResponse: ...
    async def revoke_offer(self, offer_id, reason) -> OfferResponse: ...

class LogisticsProvider(Protocol):
    async def create_dispatch(self, request) -> DispatchResponse: ...
    async def update_dispatch(self, dispatch_id, update) -> DispatchResponse: ...
    async def revoke_dispatch(self, dispatch_id, reason) -> DispatchResponse: ...

class OrganicFallbackProvider(Protocol):
    async def create_fallback(self, batch, reason) -> FallbackResponse: ...
```

Initial Dubai adapters may include Open-Meteo, OSRM, Telegram, UAE Food Bank, Reloop, and Collecteroo-style logistics. ne’ma and Dubai Municipality should be shown as reporting/policy surfaces only unless an authorized live integration exists. Demo partner/government adapters must be explicitly labelled `SIMULATED`.

Every integration result must identify `LIVE`, `CACHED`, `SIMULATED`, `HUMAN_CONFIRMED`, or `POLICY_DERIVED` as appropriate. Never silently represent simulation as a partner or government action.

## Audit and domain data

Append an immutable event for intake, extraction, human confirmation, policy decisions, offers, declines, dispatches, revocation, pickup, temperature, handover, fallback, and closure.

Each event should include batch ID, type, timestamp, actor, reason, evidence snapshot, policy pack/version, previous event hash, and current event hash. A SHA-256 chain is tamper-evident, not proof of legal certification.

Audit PDF wording: **“Tamper-evident audit package for pilot and ESG workflow validation.”** Do not call it certified or an official government submission without an authorized process.

### Current local prototype

The FastAPI/SQLite prototype exposes one server-owned active demo job and three simulated portals. The UI sends idempotent commands; the API validates actor/state transitions, updates the persisted job snapshot, and appends hash-linked events to the existing per-batch SHA-256 event chain. `/api/jobs/{id}/stream` sends Server-Sent Events with sequence IDs and reconnect support; clients also poll as a fallback. The current implementation is designed for one local demo server/database, not concurrent multi-tenant production.

The command layer reuses the existing LangGraph deterministic safety gate/rescue routing, custody endpoints, simulated adapters, and audit/PDF generation. A missing untouched confirmation or insufficient safe window does not produce a human-consumption offer. Recipient decline updates the rung and opens the next offer; all declines or expiry route to the simulated compost fallback. Pickup and handover remain state-locked, and an expired in-transit authorization uses the existing revoke-to-fallback path. The demo handover PIN is fixed and intentionally non-secure. Never treat it as a production credential.

The audit endpoint/PDF currently calculates meal and CO2e values using labelled illustrative placeholder factors. Replace these with sourced, jurisdiction-appropriate factors before external reporting. The photo UI retains the image in the browser and records its filename only; no vision model is called. Hash chaining detects edits but SQLite is not immutable storage and the demo does not provide production-grade actor identity or legal evidence. The demo-clock speed and all portal actions are simulations.

## Recommended stack and structure

- Python 3.11+, FastAPI, Pydantic v2
- LangGraph for typed workflow orchestration, checkpointing, and human interrupts; deterministic safety/policy logic remains ordinary tested application code
- Provider-neutral LangChain model interface/adapters for Gemini, Anthropic Claude, and future providers
- SQLAlchemy/SQLModel; SQLite prototype behind a repository layer, PostgreSQL later
- Server-Sent Events with polling fallback for dashboard updates; database as operational source of truth, LangGraph checkpointer for resumable execution
- Multimodal model behind provider/model adapter; provider, model name, keys, cache configuration in server-side configuration, not domain code
- Google Gemini model catalog check recorded 2026-11-12: Gemini 3.8 Flash and Gemini 4 models were listed; Gemini 2.5 Flash reference is outdated. Recheck official documentation and account availability at deployment, then benchmark image support, extraction/schema accuracy, latency, cost, and quota.
- React or Vanilla JS, Leaflet/OpenStreetMap
- ReportLab or WeasyPrint; SHA-256 event chain

```text
app/
  api/ domain/ intake/ safety/ orchestration/
  integrations/{weather,routing,recipients,logistics,organic_fallback}/
  audit/ persistence/ realtime/
policy_packs/{base,uae_dubai,example_country_b}/
web/dashboard/
tests/{unit,integration,policy_packs,safety,state_machine,demo}/
```

## Reliability, security, and privacy requirements

- Keep secrets in environment/configuration, never source.
- Authenticate appropriate endpoints; protect webhooks.
- Validate AI/vendor payloads and restrict upload types/sizes.
- Use idempotency for actions; prevent duplicate dispatch.
- Use row locks or optimistic concurrency for transitions.
- Apply per-user and per-IP rate limits.
- Keep preset scenarios available during model/API limits.
- Cache only safe reusable outputs with versioned keys; never cross-user-cache private uploads.
- Keep LangGraph checkpointing, provider response caching, weather/routing TTL caches, and application state as distinct mechanisms.
- Never cache/replay safety authorization, recipient capacity, dispatch, revoke, or handover as current facts.
- Make AI provider/model selectable from a server-side allowlist; do not accept arbitrary client-supplied model IDs.
- Preserve state across refresh/network interruption.
- Make errors, timeouts, cached data, and simulation visible; no success-shaped fallback.
- Minimize personal data, define jurisdictional retention, and avoid exposing private recipient data.
- Verify current model availability/pricing/quota before deployment.

## Engineering non-negotiables

1. Safety dominates optimization; uncertainty is not permission.
2. Every decision is jurisdiction-aware and versioned.
3. Vendors are replaceable; Dubai vendors are not core dependencies.
4. LLMs cannot override deterministic policy.
5. Revocation and physical custody are domain-critical.
6. Handover is a final digital lock.
7. Simulations and estimates are labelled.
8. Important decisions are auditable.
9. Missing evidence is unsafe for human consumption.
10. Tests cover each safety policy and state transition.
