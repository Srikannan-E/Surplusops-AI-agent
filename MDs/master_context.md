# SurplusOps AI — Master Context

> Portable entry point for coding agents, product assistants, and pitch collaborators. Read the focused guide relevant to your task; avoid loading every document unless needed.

## Project in brief

**SurplusOps AI** is a Dubai-first, globally extensible food-surplus rescue orchestration agent. It helps commercial kitchens turn eligible surplus into verified community distribution through AI-assisted intake, jurisdiction-specific deterministic safety rules, human confirmation, recipient matching, re-planning, custody tracking, revocation, and a tamper-evident audit package.

**Tagline:** The autonomous operational middleware turning midnight commercial surplus into verified community food before it spoils.

**Initial market:** Dubai, UAE  
**Long-term market:** Worldwide  
**Hackathon focus:** Dubai Chamber AI Agents Championship — societal impact / urban circular economy.

**Initial customer hypothesis:** Dubai hotels, particularly 4- and 5-star properties with banquet/event activity. The commercial value proposition is evidence-on-demand, faster midnight coordination, and risk visibility—not selling donations. The DET requirements are a potential documented driver; they do not prove product compliance or willingness to pay. Start with hotels; treat caterers and institutional funders as secondary hypotheses to validate.

## Read the right guide

| Need | Guide |
|---|---|
| Architecture, policy packs, safety, state machine, adapters, audit, engineering constraints | [technical_context.md](./technical_context.md) |
| Four-week execution, web Judge Test Mode, simulations, demo, testing and rehearsal | [hackathon_context.md](./hackathon_context.md) |
| Customers, market validation, business model, evidence, competition, pitch claims | [business_pitch_context.md](./business_pitch_context.md) |
| Accounts, API credentials, browser permissions, hosting, and setup split by development/testing vs hosted demo | [external_setup_checklist.md](./external_setup_checklist.md) |
| Original product plan | [surplusops.pdf](./surplusops.pdf) |

## Product and safety invariants

- Dubai is the first policy/vendor pack; the core must remain country- and vendor-neutral.
- Use LangGraph for typed orchestration/checkpointing, a provider-neutral model interface for Gemini/Claude switching, and distinct safe caches; see [technical_context.md](./technical_context.md).
- The one-page web Command Center with embedded Judge Test Mode is the primary judge experience. A solo judge must be able to test without Telegram, a second device, or live partner APIs.
- AI extracts and proposes; deterministic jurisdiction policy decides eligibility; authorized humans confirm required physical facts.
- Missing, ambiguous, expired, or failed safety evidence must block/revoke human-consumption authorization and route to an approved fallback or manager escalation. Never guess.
- Revocation is first-class; digital state must reflect physical custody. Handover is a final digital lock.
- Allergen and halal/dietary metadata must come from a venue-approved, traceable source; AI must not infer or verify these from images.
- Unit economics, hotel willingness to pay, time saved, disposal savings, and sales-cycle assumptions remain unproven until measured; do not claim profitability for one venue without venue-level evidence.
- Simulated services, estimates, targets, and measured results must be labelled honestly.
- Call the report a **tamper-evident audit package**, not certified or officially approved.

## Current execution order

1. Establish global domain/policy core and deterministic safety gates.
2. Build the solo-judge web vertical slice.
3. Demonstrate decline/re-plan, unsafe fallback, revocation, custody, and audit.
4. Produce the test, user-validation, time/cost, and business evidence packs.
5. Harden/deploy and rehearse the official two- and six-minute pitches.

## Guidance for future AI tools

- Read the focused guide before implementing or making claims.
- Preserve the global-core/local-pack and vendor-adapter separation.
- Do not move safety decisions into an LLM prompt or hardcode Dubai vendors into core orchestration.
- Do not invent test results, user research, sources, partner endorsements, market claims, or profitability.
- Verify legal, market, model, and competition details against current authoritative sources.
- Keep each guide focused; put research data and run results in `evidence/`, not in this overview.
