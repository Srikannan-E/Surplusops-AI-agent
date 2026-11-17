# SurplusOps AI — Hackathon and Demo Context

> Read this for the four-week build schedule, judge-console requirements, evidence deliverables, demo, and pitch timing. Technical architecture is in [technical_context.md](./technical_context.md); business and pitch framing is in [business_pitch_context.md](./business_pitch_context.md).

Use the [external setup checklist](./external_setup_checklist.md) to prepare development credentials, browser permissions, hosting, and demo-only accounts. It also records which services do not need credentials because they should be simulated.

## Hackathon objective

Build a reliable, interactive, judge-testable prototype of the Dubai-first/global-ready food-rescue agent. The **one-page Web Command Center with embedded Judge Test Mode is the primary demo**. A solo judge must not need Telegram, a second phone, a partner account, or an external vendor API.

Telegram is optional for a demo video or later operational pilot.

## Judge Test Mode requirements

From one browser page, a judge can:

1. Select a deterministic preset scenario or upload a photo.
2. Review/edit menu-matched AI extraction.
3. Confirm or reject the extraction and untouched status.
4. View safety decision, countdown, policy version, and recipient offer.
5. Act as recipient and accept/decline.
6. Trigger re-planning, unsafe fallback, and revocation.
7. See agent trace, custody state, route/map, adapter status, and audit PDF.

The interface must show `LIVE`, `CACHED`, `SIMULATED`, `AI-EXTRACTED`, `HUMAN-CONFIRMED`, or `POLICY-DERIVED` labels as applicable. Seeded scenario results are labelled simulated. Timers sped up for the demo must be labelled.

### Current browser-console implementation

The local prototype has exactly four frontend routes: `/` (agent console), `/portal/recipient`, `/portal/driver`, and `/portal/composter`. The console combines intake, the countdown and four-rung rescue ladder, live timeline, safeguards, escalation, demo controls, and the audit/impact drawer. The three simulated portals use the same server-owned active job; Server-Sent Events broadcast snapshots/events, with polling fallback and a reconnecting indicator. Reloading a route restores the job from SQLite.

Demo controls provide the happy path, decline-then-recover, and decline-twice-to-compost presets, 1x/x60 clock, reset, and portal links/QRs. Preset responses can be applied in the recipient portal. Each command has an idempotency key and is validated against server state. A missing untouched confirmation or failed safe-window check routes to compost; driver pickup and final PIN handover remain distinct recorded steps. The audit PDF includes the hash-chained event log and illustrative meal/CO2e estimates, clearly labelled as estimates.

Photo selection is local to the browser and only the filename is recorded; no image model runs. Menu dietary fields are venue-provided, not independently verified. Partner and government interactions remain simulations. SQLite hash chaining is tamper-evident, not immutable storage, and the app has no authentication or production-grade actor identity. The local app is not yet hosted at a public judge URL.

### Simulated UAE services

- **UAE Food Bank:** simulated recipient offer; judge can accept/decline.
- **Reloop/organic-waste provider:** simulated safe-disposal fallback.
- **ne’ma:** simulated impact/reporting export, not an official submission.
- **Dubai Municipality:** demo policy evaluation and evidence logging, not an API call, approval, or certification.
- **Collecteroo/logistics:** simulated dispatch unless a real authorized integration exists.
- **Weather/routing:** real or cached if configured; otherwise simulated and labelled.

Each adapter card should show service name, status, action/result, timestamp, and concise request/response summary. Do not use government logos or claim endorsement, partnership, approval, certification, or official submission without authorization.

### Hotel evidence value in the demo

The judge console should show the operational evidence SurplusOps is designed to help a hotel capture: event/batch record, food-waste quantity/status, donation partner log, recipient outcome, fallback reason, monthly summary export, and post-event report. Add a DET traceability panel that maps each output to the exact DET sustainability requirement/section only after verifying the identifier in the source PDF.

Label the panel **“Designed to support DET evidence workflows — not a compliance determination or official DET submission.”** Show an export as simulated unless a real authorized integration exists. The pitch must not say hotels buy donations; the commercial hypothesis is that hotels may pay for evidence on demand, faster late-night coordination, and risk visibility.

## Four-week execution plan

### Week 1 — Global core, safety, and demo foundation

**Build**

- Confirm the two-minute story, one target customer, and one primary rescue scenario.
- Implement global domain models, jurisdiction/policy-pack interface, vendor adapter contracts, event log, and state machine.
- Implement the workflow in LangGraph with typed state, explicit nodes/conditional edges, persistent checkpointing for human pauses, and idempotent side-effect nodes.
- Create UAE/Dubai demo policy plus a mock second-country pack.
- Implement deterministic eligibility, untouched-food gate, authorization expiry, revocation, and fallback.
- Add strict AI intake schemas, closed-menu matching, provider-neutral model interface, configurable Gemini-first provider/model, and deterministic preset-photo fixture.
- Define cache boundaries: LangGraph checkpoint store vs model/external-data/fixture caches; never cache current safety decisions or side effects.
- Create the one-page Command Center shell with Judge Test Mode and data-status indicators.
- Seed venue/menu/recipient/routes/scenarios and one-click reset.
- Start the test pack; define expected results before running.
- Verify the selected Gemini candidate in current official documentation; benchmark image support, extraction/schema accuracy, latency, cost, and rate limits.

**Milestone**

- Seeded rescue starts in the browser and shows state changes.
- Preset photo produces schema-validated output; fixtures are labelled.
- Known, unknown, touched, and missing-evidence cases produce distinct deterministic decisions.
- Dubai and mock-country packs run without vendor-specific branches in the orchestrator.
- No LLM output authorizes human consumption.
- Swap model provider through server-side configuration/provider adapter without changing LangGraph domain flow; initially only one live provider credential is required.
- Checkpoint/resume and application audit state are tested separately from response-cache hits.
- First 10 scenarios have expected outcomes and executable/documented steps.

### Week 2 — Solo-judge vertical slice

**Build**

- Complete photo/preset intake, extraction review/edit, confirmations, recipient accept/decline, re-planning, fallback, revoke, and audit PDF in the same console. The current prototype implements local photo selection/preview and manual menu tiles; model extraction and extraction review remain to be built.
- Show menu-backed allergens and halal/dietary metadata with provenance; unknown stays unknown. Image/model output cannot verify these.
- Add recipient decline/repeat declines, timeout, manager escalation, in-transit delay/revoke, and handover lock.
- Apply offer eligibility using ETA plus safety buffer; acceptance is a time-limited capacity hold, not a confirmed pickup.
- Exercise no-pickup timeout/re-offer, continuous ETA update, cutoff rejection, recipient unsafe-at-handover, and repeated recipient no-show throttling in tests or labelled simulation.
- Add countdown, authorization/custody status, trace, and hash verification. Do not build a live fridge map or B2C screen for this demo.
- Add action idempotency and initial rate limits/caching. Presets must work when model quota is exhausted; private uploads must never be cross-user cached.
- Add cache key versioning for provider/model, prompt, schema, menu context, and input; expose cache source/age. Do not cache offers, capacity, safety decisions, dispatch, revoke, or handover as live facts.
- Rehearse the full demo and log failures.

**Milestone**

- A solo judge completes rescue, decline/reroute, unsafe fallback, revoke, driver handover, organiser takeover, and audit-PDF flows in the console without Telegram or live partners.
- Main narrated path fits the two-minute storyboard; accelerated timers are disclosed.
- Double taps create no duplicate or contradictory states. Intake confirmation is idempotent and repeated rescue submission is rejected without creating a second dispatch.
- Untouched food not confirmed means no human-consumption route.
- Revoke invalidates authorization and creates an audit event.
- At least 20 scenarios executed with expected/actual results.

### Week 3 — Evidence, user validation, business case, and global proof

**Build/validate**

- Execute 30+ test scenarios, including blurry/unknown/touched food, three declines, too-far recipient, accepted-but-no-pickup timeout, driver delay past cutoff, arrival-at-expiry rejection, recipient unsafe-at-handover, repeated no-shows, API timeout, double tap, policy mismatch, and handover lock.
- Report pass/fail numerator, denominator, test-pack version, date, model and policy version.
- Record one real failure, fix, and regression test; if none observed, say so and keep testing.
- Conduct manual-versus-agent task study with 5–10 volunteers; record method, times, errors, median/range, and limitations.
- Calculate cost per task from tokens, hosting, messaging, and relevant API costs; distinguish measured/estimated items.
- Conduct 8–10 discovery conversations; document count, role, location, date, method, consent, and notes.
- Ask Championship mentors for introductions; contact UAE Food Bank/ne’ma without implying partnership or endorsement.
- Prioritize hotel buyers for the first validation interviews because the supplied DET evidence driver is hotel-focused; treat caterers as users/channel partners until an equivalent driver is verified.
- Test whether hotels value per-donation records, monthly food-waste summaries, donation-partner logs, post-event reports, reduced coordination time, and risk visibility; do not assume willingness to pay.
- Ask for budget owner, procurement steps, approval cadence, pilot requirements, and timing for the next Sustainable Tourism Stamp cycle.
- Add a requirement-to-evidence traceability table using exact DET clauses/IDs, with source page/section and access date. Do not invent requirement numbers.
- Recalculate unit economics using the chosen model, measured token/messaging/API costs, hosting/support, onboarding, and observed job volume. Mark the user-provided AED 2/job and venue-cost examples as placeholders until measured.
- Add provider contract tests for the active model adapter and a mocked alternate-provider adapter; confirm changing provider does not change policy outcomes or graph transitions.
- Test event-organizer and institutional-funder payer hypotheses through mentorship introductions; do not present them as committed payers.
- Prepare sourced Dubai SAM, margin table for 10/30/100 monthly jobs, pricing hypothesis, and named-channel go-to-market plan.
- Demonstrate a mock second-country policy/adapter swap.
- Add evidence-status labels across demo and pitch.

**Milestone**

- Evidence pack is current and uses actual sample sizes.
- Every number is labelled `MEASURED`, `ESTIMATE`, or `TARGET` with source/formula.
- Interview and study counts are actual; pending work is identified.
- SAM and margin assumptions are sourced/documented.
- The hotel-only beachhead and product-specific willingness to pay are separated from regulatory evidence and category precedent.
- The supplied 365 four-/five-star hotel count is labelled by source/date and verified before it is used as a current SAM denominator.
- The single-hotel utility claim is not presented as profitability unless measured venue-level economics support it.
- Country swap changes configuration, not the core workflow.

### Week 4 — Judge hardening and rehearsal

**Build**

- Deploy web console with HTTPS, suitable authentication, upload limits, per-user/per-IP rate limits, health checks, and explicit error handling.
- Validate configured model name and verify official availability, image support, pricing, and quota.
- Harden caching/fallback; presets remain functional during API/model limits; prevent private-upload leakage.
- Verify separate LangGraph checkpointer configuration and cache backend behavior; do not make a managed Redis/cache account a prerequisite unless the chosen deployment needs it.
- Verify state persistence after refresh/network interruption and clear retry/rate-limit messages.
- Add demo reset and visible simulation status.
- Prepare offline screen recording only as a backup; retain interactive Judge Test Mode as primary.
- Keep Telegram optional.
- Source-check the problem statistic and label price as estimate until validated.
- Replace generic “donation matching” language with hotel evidence-on-demand, midnight coordination speed, and risk visibility; say “designed to support,” not “compliant.”
- Show a DET evidence map with verified source identifiers and a clear no-certification/no-official-submission disclaimer.
- Remove unsupported AED 1,800 disposal savings and 30-hours-saved claims; use only measured study results or clearly labelled hypotheses.
- Present any unit-economics table as assumptions, using measured per-job costs where available; explain acquisition cost and sales-cycle uncertainty.
- Use a 5–15 venue first-year goal only as a labelled target; do not present 100 venues or full-market adoption as a near-term forecast.
- Rehearse the official two-minute demo and six-minute pitch.

**Milestone**

- Ten consecutive judge-console runs succeed, including at least three declines, three fallback cases, and repeated revoke/idempotency checks.
- Judge reaches audit PDF without setup help or second device.
- API/model limits do not block preset scenarios.
- No duplicate dispatch or lost state; errors are visible.
- Evidence and business calculations are documented honestly.
- All sped-up timers are labelled; no unsupported safety, partner, certification, or impact claim remains.

## Demo golden path

```text
Preset/upload photo → AI/menu extraction → human confirms
→ untouched status confirmed → deterministic safety decision
→ recipient offer → judge declines → next eligible tier
→ optional revoke/fallback test → accept/reset successful path
→ pickup/temperature/handover simulation → audit PDF
```

Also show one case the system refuses: untouched status is not confirmed, so human-consumption distribution is blocked and configured fallback/escalation is used.

## Official two-minute storyboard

| Time | Demo beat |
|---|---|
| 0:00–0:22 | Chef, customer, and one sourced problem number labelled correctly |
| 0:22–0:46 | QR/context, photo, two confirmations, countdown, recipient offer |
| 0:46–1:16 | AI proposes, policy decides, human confirms; recipient declines and agent reroutes; show untouched-not-confirmed fallback |
| 1:16–1:40 | One genuine test failure and fix, revoke in ~10 seconds, test result with sample size, cost per task |
| 1:40–1:52 | Today versus agent; price labelled estimate until validated |
| 1:52–2:00 | Built/next, one limitation, judge QR/link |

Do not invent a failure or fix. Use an actual observed and verified issue or say none has yet been confirmed.

## Official six-minute pitch structure

| Time | Segment |
|---|---|
| 0:00–0:45 | Problem and customer |
| 0:45–1:15 | Solution, global core, Dubai-first policy/vendor pack, safety boundary |
| 1:15–3:15 | Embedded two-minute demo |
| 3:15–4:00 | Evidence: tests, task time, interviews, cost |
| 4:00–4:45 | Business: sourced SAM, unit economics, pricing hypothesis, channels |
| 4:45–5:30 | Roadmap, team, limitations |
| 5:30–6:00 | Close and judge QR |

## Evidence deliverables

Keep detailed evidence in a separate `evidence/` folder; do not bloat these context guides.

- `test-pack.md`: 30+ scenarios with expected vs actual, status, sample size, date, model/policy version; one real failure and fix.
- `time-and-cost-study.md`: 5–10 volunteer manual-vs-agent task study; method, individual data as consent permits, median/range, limitations, cost components.
- `validation-interviews.md`: 8–10 conversations with role/location/count/date/method/consent and anonymized findings.
- `business-case.md`: sourced SAM, margin table at 10/30/100 jobs/month, pricing assumptions, named channels.
- `sources.md`: source URL/title/date/access date and exactly which pitch claim it supports.

No evidence can be fabricated. Any not-yet-run work stays marked pending.

## Data/claim labels and acceptance checklist

- `MEASURED`: observed with method/sample/time period.
- `ESTIMATE`: derived with assumptions/formula.
- `TARGET`: desired future result.
- Every success rate has numerator/denominator and sample size.
- Source market statistics; do not reuse old figures without checking primary sources.
- Clearly distinguish real, cached, simulated, AI-extracted, human-confirmed, and policy-derived data.
- Do not describe the audit PDF as certified; call it a **tamper-evident audit package**.
- Do not claim government approval, official submission, partner integration, or endorsement for simulations.
