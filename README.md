# SurplusOps AI

> Plan it, label it, track it, recover when the plan fails.

SurplusOps is a Dubai-first coordination demo for **event surplus food** (weddings, banquets, conferences, catered events) with a globally extensible core. An AI agent helps a venue tell a food-rescue partner what to expect, checks reality at the end of service, and recovers when the plan breaks. People make every food-safety decision.

**This repository is a local simulation.** The Food Bank, charity and compost portals and all adapter responses are mock data. Nothing calls a partner or government system. **Do not use it to arrange real food transfers.**

> **Doc status:** this README describes the **v2 target design** (planned heads-up, end-of-service confirmation, zero-surplus path, reconcile and recover). Section 12 lists what changes from the earlier implementation. Unverified process details are marked **assumed**; see section 8.

---

## 1. What it does: Plan, Reconcile, Recover

| Phase | When | What the agent does |
|---|---|---|
| **Plan** | Before the event (daytime) | Builds an event card from the uploaded menu, sends a non-binding **heads-up** ("we may have surplus") to the Food Bank (simulated), and prepares an event-day checklist and labels |
| **Reconcile** | End of service | Asks whether untouched food is left. If so, checks leftover photos against the event menu, asks a person to confirm, then updates the request to match reality |
| **Recover** | If the plan fails | Runs a safe-window countdown and a fallback ladder: Food Bank collection, registered charity, compost, then a person |

**Zero surplus is a normal, successful outcome.** The agent cancels the heads-up, releases the slot and seals a record.

## 2. Non-negotiable rules

1. Only **untouched, never-served, back-of-house** food may be donated. The chef or event manager confirms this. AI never certifies safety.
2. Guest returns, doubtful or partly-served batches, and food with **unknown temperature or handling history** never go to people. They go to compost or to a person.
3. The agent **requests and tracks**. It never assumes a vehicle, a slot or a recipient's capacity.
4. **Deterministic code** owns time, temperature and routing gates. LLM output is only a proposal and can never change a safety number.
5. Everything partner-facing is **simulated and badged**. Assumptions are flagged.
6. Photos show **food only**. Handlers are recorded by **role**, not by name.
7. Records are called **"Hotel record"**. Never "official", "certified" or "compliant". Say "designed to support" reporting.

## 3. Scope

| In scope | Out of scope (do not build) |
|---|---|
| Event surplus (weddings, banquets, conferences, catered events) | Everyday buffets without a single event menu (roadmap: saved dish library, standing schedules) |
| Hotel, venue and caterer as donor | **Community fridges**, any fridge map, fridge status or fridge sensor or cold-storage simulation |
| Food Bank as the main (simulated) receiver, registered charity as fallback | Consumer (B2C) flows, individuals receiving food |
| Compost as the last-resort path | Payments, WhatsApp or Telegram integrations (Telegram may stay optional) |
| Web judge console with simulated partner portals | Real partner, government or logistics integrations |

## 4. Lifecycle

**Happy path**

1. `EVENT_READY`: a manager has uploaded and confirmed the menu in **Dish library setup** (allergens and halal are *declared by the venue*, AI only drafts them).
2. `HEADS_UP_SENT`: non-binding standby request with an optional **size class** (none likely, small, medium, large). It is an estimate, never a promise.
3. `SLOT_ACKNOWLEDGED`: the simulated Food Bank accepts, accepts some dishes only, or proposes another slot.
4. `REMINDER_SENT`: the agent nudges the chef before the pickup window ("Any untouched food left?").
5. `END_OF_SERVICE_CONFIRMED` with one of three outcomes:
   - **Nothing left**: `HEADS_UP_CANCELLED`, slot released, record sealed (`AUDIT_SEALED`, outcome `no_surplus`).
   - **Some left**: one to three food-only photos, analysis against the event menu (ranges, not exact counts), the chef taps **Looks right**, then confirms **100% Unserved Back-of-House** (`SURPLUS_CONFIRMED`). **The countdown starts here, never earlier.**
   - **Not sure**: photo and review. If still unsure, nothing is donated.
6. `VARIANCE_CLASSIFIED` then `REQUEST_UPDATED`: the agent compares actual with the heads-up and updates the Food Bank request.
7. `COLLECTION_DISPATCHED` then `PICKUP_CONFIRMED` (one-time pickup code and recorded temperature) then `DELIVERY_CONFIRMED` (delivery PIN) then `AUDIT_SEALED`.

**Reconcile cases**

| Variance | Agent action |
|---|---|
| More surplus than the size class | Update the request and run `check_vehicle_fit` (capacity is an **unset** parameter). If it may not fit, request a larger or second pickup, or split part to a registered charity. |
| Some items touched or unsafe | Mark them compost-only, recompute quantity, update the request |
| Event ran late | `shift_pickup_window` and recompute the safe window. If it no longer fits, go to fallback. |
| Less surplus than the size class | Reduce the request or cancel and release the slot |
| **No heads-up was sent** (unscheduled surplus) | `request_adhoc_slot` (the Food Bank decides), then charity, compost, person |

**Recover cases**

| Failure | Action |
|---|---|
| Receiver declines or times out | Re-check the remaining safe window, offer the next ladder option. The earlier decline stays visible. |
| Vehicle late or no-show | Fallback to charity, or alert a person |
| A dish rejected at inspection or handover | That dish goes to compost, the rest continues |
| Delay would push arrival past expiry | Cancel, send **STOP: do not collect or consume**, redirect |
| Human-alert threshold reached | `ESCALATED`: banner and **Take over** button |
| Safe window expires | `WINDOW_EXPIRED` then `COMPOST_REQUESTED` then `COMPOST_CONFIRMED` |

**Fallback ladder (configurable order):** `food_bank_collection` then `registered_charity` then `compost_partner` then `human`. Optional rung `branch_dropoff` for small quantities (config flag; threshold unset, see section 8).

## 5. Screens and routes

| Route | Who | Real or simulated | Purpose |
|---|---|---|---|
| `/` | Chef, event manager, organiser | Real | **One console.** Dish library setup, Heads-up, End of service (three-way question), Working (countdown, journey line, "What the agent did"), Done. A Details drawer holds Timeline, Checks, Record and Tool trace. |
| `/portal/food-bank` | Food Bank staff and logistics partner | **Simulated** | Heads-up inbox, per-dish accept or decline with reasons, propose slot, dispatch logistics partner (labelled simulated), **Collection tab** (pickup code and temperature, delivery PIN, optional inspection result) |
| `/portal/charity` | Registered charity | **Simulated** | Fallback offer: accept or decline with reason chips |
| `/portal/compost` | Compost partner | **Simulated** | Compost request and confirmation with the per-booking collection code |

- The driver step is a tab inside the Food Bank portal. Keep `/portal/driver`, `/portal/recipient` and `/portal/composter` as **redirects** so existing links and QR codes keep working.
- All portals share the server-owned active job with the console over Server-Sent Events with polling fallback. Portal pages open without sign-in codes.
- One-time pickup and delivery codes, the compost collection code, and the **five-attempt lockout** stay as implemented.
- Demo controls hold the stories, real-time or 60x clock (with a visible **Sped up** tag on every screen), portal links with optional QR codes, and a confirmed reset menu.

## 6. Demo stories (3)

| Story | What it shows |
|---|---|
| **1. Bigger than expected** | Heads-up says *small*. At the end of service there is much more, some trays are unsafe, and the event ran 45 minutes late. The agent reconciles, updates the request, and the Food Bank collects. Include one decline then recover step. |
| **2. Nothing left** | One tap. The agent cancels the heads-up, releases the slot and seals a "no surplus" record. About 15 seconds. |
| **3. Nobody can take it** | Declines and timeouts, a person is alerted, the sped-up clock runs out, and the food goes to compost with the reason recorded. |

Old stories map as follows: *Happy path* becomes a short baseline step inside story 1; *Decline then recover* is folded into story 1; *Nobody accepts then compost* becomes story 3; *Nothing left* is new.

## 7. Agent tools

The agent proposes tool calls (function calling). A **deterministic policy gate** validates each call, the tool runs, and a tool-call event is logged with name, inputs, outputs, duration, simulated flag and rationale. If the LLM fails or is blocked, a deterministic default runs and `FALLBACK` or `POLICY_BLOCK` is logged. Keep existing tool names where they work. Add the missing ones.

| Tool | Does | Real or simulated | Human gate |
|---|---|---|---|
| `parse_menu` / `build_event_card` | Reads PDF, DOCX, CSV or images into dishes, allergens and halal drafts | Real (Gemini optional) | Manager confirms |
| `send_heads_up` / `cancel_heads_up` | Sends or withdraws the standby request | Simulated partner | No |
| `send_reminder` | Nudges the chef before pickup | Real | No |
| `confirm_end_of_service` | Records nothing left, some left or not sure | Real | **Chef** |
| `analyze_leftover_photo` | Closed-set match to the event menu, tray ranges, flags unknown items | Real (Gemini) or labelled fallback | **Chef confirms** |
| `compare_to_plan` / `classify_variance` | Detects quantity up or down, unsafe items, delay, unscheduled | Real | No |
| `check_vehicle_fit` | Compares quantity to vehicle capacity (unset parameter) | Real | No |
| `update_request_quantity` / `shift_pickup_window` / `release_slot` | Updates the request, recomputes the safe window, frees the slot | Simulated partner | No |
| `request_adhoc_slot` | Urgent request when no heads-up exists (partner decides) | Simulated partner | No |
| `get_weather` | Open-Meteo reading. Context only, never changes the safe window | Real | No |
| `compute_safe_window` | Deterministic countdown | Real | No |
| `rank_recipients` / `send_offer` / `replan` | Ladder scoring, offers, re-planning | Real over seeded data | No |
| `record_handover` | Pickup code, temperature, release time, role | Real | Driver or partner step |
| `escalate_to_human` | Alerts the organiser | Real | **Person** |
| `request_compost_booking` | Booking payload | Simulated adapter | No |
| `generate_labels` / `assign_batch` | QR labels (dish, packed time, allergens, storage) and batch IDs | Real | No |
| `seal_audit_record` / `calculate_impact` | Hash-chained record, PDF, estimated impact | Real | No |

**LLM budget:** use the model only for menu or photo understanding, drafting messages and choosing between close options. Cap calls per job, cache demo scenarios, and log tokens per job. Deterministic checks stay authoritative. Without `GEMINI_API_KEY`, deterministic fallbacks run and are labelled.

## 8. Assumptions (configurable, flagged "assumed")

These come from public sources and design judgement. **No source verifies them as Food Bank rules.** Keep them in config, show "assumed" in the UI where relevant, and validate with the Food Bank or a mentor.

| Parameter | Default | Status |
|---|---|---|
| `final_update_reminder_minutes` | 60 before pickup | Assumed |
| `human_alert_minutes` | 30 remaining (earlier build used 15) | Design parameter |
| `heads_up_size_classes` | none_likely, small, medium, large | Placeholder labels, no real thresholds |
| `vehicle_capacity` | unset | Unknown. Never assume. |
| `cancellation_penalty` | unknown | Build no penalty logic |
| `branch_dropoff_enabled` / `small_quantity_threshold` | off / unset | Drop-off points exist on the official contact page. A size rule is unverified. |
| `meals_per_kg` | 0.4 | Derived from reported 2025 ne'ma figures. Label as estimate. |
| `co2e_kg_per_kg_surplus` | 2.5 (placeholder) | Illustrative only. Replace with a cited factor and show the source. |
| `donation_reserve_mode` | off | Optional experiment: designate reserve trays during service. May conflict with service needs. Test with a real kitchen. |
| Safe-window thresholds | placeholder | **Not** a validated local food-safety policy |

## 9. Policy gates (deterministic, authoritative)

- No dispatch before the chef's end-of-service confirmation and the **Unserved Back-of-House** confirmation.
- Items flagged `guest_return`, doubtful, partly served, or with unknown temperature history are **compost or human only**.
- No offer if estimated arrival plus a buffer exceeds the remaining safe window.
- A window shift is allowed only if the recomputed window still covers pickup.
- Human alert at the threshold. Compost on expiry.
- Photos must be food-only (reject or blur if people are detected). Store handlers by role.
- Capacity and acceptance are never assumed.
- An LLM output cannot override any gate.

## 10. Copy and claims rules

- Use plain labels: Heads-up, End of service, Time left to place it safely, Checks, Record. Avoid jargon on the main screen.
- Say: "Hotel record", "designed to support reporting", "AI proposes, deterministic rules gate, licensed humans decide".
- Don't say: "official", "certified", "compliant", "partnered with", "zero human intervention", or anything implying the Food Bank requires these steps.
- Show badges: **SIMULATED PARTNER** on every portal and on timeline lines from them, **Sped up** when the demo clock is on, **Assumed** on unverified parameters, **Estimate** on meals and CO2e.

## 11. Evidence

Research, sources, dates and a claims map are in `evidence/` (`EVIDENCE.md`, `process-friction-log.md`). Several process details are unverified (see section 8). Keep this README and the UI consistent with that register, and do not state any assumed behaviour as fact.

---

## 12. What changes from the earlier implementation (refactor checklist)

Inspect the repo first. **Keep** everything that works: single-active-job persistence, hash-chained events and PDF, idempotency keys, SSE and polling fallback, one-time codes with lockout, Dish library setup and hall QR, closed-set photo analysis, Gemini fallbacks and token tracking, `get_weather`, 60x clock, reset menu.

| Area | Earlier | Target |
|---|---|---|
| Entry | Chef photo from a preloaded hall menu, then confirm | Event ready, **heads-up**, then end-of-service question (nothing left, some left, not sure) |
| Pre-event quantity | Implied | Only a size class estimate (`is_estimate: true`). The authoritative quantity comes after chef confirmation. |
| Zero surplus | Not handled | First-class success path: cancel, release slot, seal a record |
| Booking | None | Non-binding heads-up and **updatable request** with variance handling |
| Receiver | "Food Bank / charity recipient" | **Food Bank portal** (per-dish accept or decline) plus a separate **charity** fallback portal |
| Driver | Separate portal | Collection tab inside the Food Bank portal (redirect old route) |
| Compost | `/portal/composter` | `/portal/compost` (redirect old route) |
| Fridges | Any fridge references | **Remove** all fridge text, status, map and sensors |
| Stories | Happy path, Decline then recover, Nobody accepts | Bigger than expected, Nothing left, Nobody can take it |
| Records | May say "official" or "certified" | "Hotel record" only |
| Parameters | Hard-coded | Config with an **Assumed** badge |

**Tasks**

1. **Domain:** add `DonationIntent {status: standby|confirmed|cancelled_no_surplus, size_class, is_estimate}`, `Reconcile` fields (variance types), per-dish acceptance on the request, and batch and label records. Reuse existing menu and job models.
2. **Workflow:** add heads-up, reminder, end-of-service branching, reconcile and updatable request states. Reuse the existing ladder, replan, escalation and compost logic. Reorder the ladder through config.
3. **Tools:** add the missing tools in section 7 and log them as tool calls. Keep existing names where they already work.
4. **Policy:** implement the gates in section 9 with tests, including the unknown-temperature and guest-return blocks.
5. **UI:** simplify the console to Plan, Working and Done states, add the end-of-service three-way question, show the "What the agent did" list with a **Show tool calls** judge toggle, and add variance chips and a booked-versus-actual diff.
6. **Portals:** create the Food Bank and charity portals, rename compost, and add redirects. Keep the simulated badges.
7. **Demo controls:** replace the three stories and keep the clock, QR links and reset.
8. **Tests:** zero-surplus path, each reconcile case, no-heads-up path, per-dish acceptance, each policy block, LLM-failure fallback, two-client sync, idempotency, and the three stories end to end.
9. **Docs:** update `docs/events.md` (or create it) with the event schema and transitions below.

**Event types (map to existing names, do not rename working ones needlessly):** `EVENT_READY`, `HEADS_UP_SENT`, `HEADS_UP_CANCELLED`, `SLOT_ACKNOWLEDGED`, `REMINDER_SENT`, `END_OF_SERVICE_CONFIRMED`, `LEFTOVERS_ANALYZED`, `SURPLUS_CONFIRMED`, `VARIANCE_CLASSIFIED`, `REQUEST_UPDATED`, `WINDOW_SHIFTED`, `ADHOC_REQUESTED`, `OFFER_SENT`, `OFFER_ACCEPTED`, `OFFER_DECLINED`, `REPLAN`, `COLLECTION_DISPATCHED`, `PICKUP_CONFIRMED`, `INSPECTION_RESULT`, `DELIVERY_CONFIRMED`, `ESCALATED`, `HUMAN_TAKEOVER`, `WINDOW_EXPIRED`, `COMPOST_REQUESTED`, `COMPOST_CONFIRMED`, `AUDIT_SEALED`, `DEMO_CLOCK_CHANGED`, `JOB_RESET`.

**Acceptance**

- [ ] All three stories run end to end with no console errors.
- [ ] Zero surplus closes cleanly, releases the slot and seals a record.
- [ ] The countdown never starts before the chef's confirmation.
- [ ] Each policy gate blocks its unsafe case and logs `POLICY_BLOCK`.
- [ ] A portal action updates the console in under 1 second and vice versa. Reload keeps state.
- [ ] No fridge text remains in the UI, API or tests.
- [ ] Every simulated element and every assumed parameter is badged.
- [ ] The hash chain verifies and the audit PDF downloads.
- [ ] Existing tests pass, plus the new ones.

---

## Run locally

Start the backend in one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the web app in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

On this Mac, get its Wi-Fi address with `ipconfig getifaddr en0`. Open `http://<MAC-LAN-IP>:5173` on each phone or laptop connected to the same Wi-Fi, and use Demo controls to open the portal screens. No portal sign-in codes are required. The frontend connects to port 8000 on the same host, and the backend allows Vite requests from local IPv4 networks. If macOS Firewall prompts, allow the Python and Node processes. API docs are at `http://<MAC-LAN-IP>:8000/docs`.

If frontend and backend are hosted at different addresses, set `VITE_API_BASE_URL` to the backend URL when building the frontend.

Run the backend workflow tests:

```bash
cd backend
python3 -m unittest discover -s tests
```

## Project structure

```text
backend/
  app/
    domain/                 # request models and SQLite persistence
    graph/                  # LangGraph rescue workflow
    integrations/
      simulated/            # separate mock partner/service adapters
  tests/                    # deterministic workflow safety and routing tests
frontend/
  src/
    lib/                    # typed API client and server-synced job context
    pages/                  # one agent console and the simulated portals
evidence/                   # sourced research, claims map and process-friction log
docs/                       # event schema and transitions (add)
```

## Configuration notes

- **Gemini:** set `GEMINI_API_KEY` in `backend/.env` (never in frontend variables). Optionally set `SURPLUSOPS_GEMINI_MODEL`. Without a key, labelled deterministic fallbacks run. Image-only menu extraction and leftover-photo recognition need the key. PDF and DOCX text extraction runs locally.
- **Voice dictation** uses the browser's speech-recognition API, which needs a supported browser and HTTPS on phones and other LAN devices. Typed notes always work.
- **Weather:** if Open-Meteo is unavailable the agent reports that no live reading was available. It never invents a temperature.
- **Audit:** SHA-256 hash-chained log and a locally generated PDF. Meals and CO2e are labelled estimates using placeholder factors.

## Known limitations

- Not production-ready: one-time codes verify a simulated handover step and do not authenticate a person. There is no real partner integration, live driver location, routing dispatch, production checkpointer, deployment hardening or public judge URL.
- Food Bank process details (heads-up, cancellation, update deadlines, size thresholds, records) are **assumed** and unverified.
- Safe-window rules are placeholders, not a validated local food-safety policy.
- Local use covers devices on the same Wi-Fi. A hosted deployment is required for judges elsewhere and must stay up through the Championship.

## Notes for AI coding assistants

1. **Inspect the repository first.** Output a short plan that maps the current code to section 12 before editing.
2. **Do not remove working features**, and do not rename existing events or tools unless necessary.
3. Never let an LLM output change a safety number or bypass a gate.
4. Ask at most three clarifying questions, and only if blocked. Otherwise state assumptions and continue.
5. Don't add heavy dependencies. Don't add any fridge, B2C or real-integration feature.