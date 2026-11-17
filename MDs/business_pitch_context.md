# SurplusOps AI — Business and Pitch Context

> Read this for customer, market, validation, business model, competitive framing, and pitch claims. See [master_context.md](./master_context.md) for navigation, [technical_context.md](./technical_context.md) for architecture, and [hackathon_context.md](./hackathon_context.md) for demo and schedule.

## Positioning

**One-liner:** SurplusOps is the autonomous operational layer that turns commercial food surplus into verified community meals before the safe window expires.

**What it is:** An AI-assisted hotel operations and evidence layer that links commercial kitchens, eligible recipients, logistics, safe-disposal fallback, and audit records.

**What it is not:** A food-safety certifier, food bank, government service, or replacement for ne’ma/UAE Food Bank/Reloop/logistics providers.

### Judge trust message

> AI extracts and proposes. A configured jurisdiction policy evaluates eligibility. Authorized humans confirm required physical facts. If evidence is missing or a technical link fails, human-consumption authorization is revoked and the batch goes to an approved fallback or manager escalation.

## Initial customer and payer

- **Beachhead payer:** Dubai hotels, initially 4- and 5-star properties with banquet/event activity and sustainability-reporting needs.
- **Likely budget owners:** Hotel F&B, sustainability/ESG, operations, or general management; confirm through interviews.
- **Later/alternative payer hypotheses:** Event organizers needing green-event evidence; institutional funders such as UAE Food Bank, Dubai CDA, Emirates Red Crescent, or ne’ma supporting a digital coordination layer. These are hypotheses to test, not committed buyers or partners.
- **Primary user:** Chef/PIC submitting and confirming surplus.
- **Operational participants:** Recipient coordinator and driver.
- **Beneficiaries:** Community-fridge users, charities, and other eligible recipients.

Hotels are the initial focus because the cited DET sustainability requirements apply to hotel operations. Caterers may still be users or channel partners, but an equivalent regulatory driver for caterers has not been established in the current evidence. Validate personas, buyer, budget, pain, and adoption requirements through interviews. Names used in pitch personas are fictional unless explicitly based on a consenting participant.

## Why a hotel might pay

Hotels do not need to be paid to donate food. The commercial case is an operational and evidence workflow that supports existing hotel responsibilities:

1. **Evidence on demand:** per-donation records, monthly food-waste summaries, partner logs, post-event reports, and documentation of community-support impact.
2. **Midnight speed:** reduce staff coordination steps and help avoid missed rescue opportunities during time-sensitive events.
3. **Risk visibility:** record who confirmed what, when, under which policy version, and what happened when a recipient or driver failed.

### DET evidence driver

The supplied Dubai Department of Economy and Tourism (DET) 2025 Hotel Classification System sustainability requirements documentation describes hotel expectations concerning a food-waste management plan and reduction targets, measurement, donation partnerships, monthly records, community-support partnership evidence, post-CSR reporting, and event waste diversion planning/reporting for 4- and 5-star hotels.

Source: [DET Hotel Classification System — Sustainability Requirements Documentation 2025](https://www.dubaidet.gov.ae/en/about-det/initiatives/-/media/files/dubai-sustainable-tourism/det-hotel-classification-system-sustainability-requirements-documentation-2025.pdf)

**Source status (2026-11-14):** The DET PDF URL returned HTTP 403 to the web fetch in this editing session. The requirement summary above is based on the user-provided description of that document; page-level wording and exact requirement identifiers still need direct local/document verification before publication.

Pitch and product rules:

- Say SurplusOps is **designed to support evidence capture and reporting against relevant DET requirements**; never say the product makes a hotel “DET compliant,” guarantees a stamp, or is DET-approved.
- Build a requirement-to-evidence traceability table. Before citing requirement numbers, verify the exact section/requirement identifier in the PDF and store page/section and access date in `evidence/sources.md`; do not invent requirement IDs.
- The document reportedly does not prescribe a single food-waste reporting template. Verify the exact text before claiming a template gap; position SurplusOps as a configurable evidence workflow, not an official form.
- The user-provided claim that 237 hotels received the Dubai Sustainable Tourism Stamp in July 2026 is a sourced ecosystem signal, not proof of SurplusOps demand. Verify the award date and count against [WAM's report](https://www.wam.ae/en/article/c1grpsx-dubai-awards-record-237-hotels-with-dubai) and record its access date.
- The user-provided source says stamp assessments involve independent third-party assessors; verify the exact process in the report or DET material before describing it. The stamp and its assessment process may support the importance of documentation, but do not prove that hotels will buy this product.
- Do not use prior “certified ne’ma/Dubai Municipality ESG metrics,” “30 admin hours saved,” or “AED 1,800 hauling savings” claims without direct evidence. Treat possible time/cost savings as hypotheses and measure them.

Map actual SurplusOps outputs to verified DET clauses in a slide/table:

| DET evidence area (paraphrased; verify exact clause) | SurplusOps evidence output | Claim boundary |
|---|---|---|
| Food-waste plan / reduction targets | Configurable venue goals and diversion records | Supports documentation; does not set or certify the hotel plan |
| Food-waste measurement and monthly records | Timestamped batch/event records and monthly export | Report totals only from recorded data; label estimates |
| Donation partnerships / community-support records | Partner directory, offer/accept/decline and handover log | Does not create or certify a partnership |
| Post-CSR impact reporting | Tamper-evident audit package and export | Not an official submission or certification |
| 4-/5-star event diversion planning and post-event performance | Event-level plan, diversion outcome, exceptions and report | Verify scope and exact clause before claiming DET mapping |

### Supporting evidence, not proof of willingness to pay

- The user-provided WAM report says 237 hotels received Dubai’s Sustainable Tourism Stamp in July 2026. Verify against the source before presentation.
- Winnow's subscription model and published cases at Dubai properties such as Grosvenor House and Hilton Dubai Jumeirah show that hospitality properties may buy food-waste tools. This is a **category precedent**, not evidence that they will buy SurplusOps. Verify Winnow pricing/model and specific case details from primary sources before using them.
- Product-specific willingness to pay, time saved, and compliance value remain **unproven** until buyer interviews, pilots, and pricing tests.

## Single-venue Day-1 utility

The product is designed to provide standalone B2B utility to one hotel without first requiring a neighborhood-scale consumer marketplace. A single venue may use intake, internal decision tracking, recipient coordination, fallback records, and audit-pack preparation in a pilot.

The first-venue value proposition is evidence capture, operational tracking, and donation coordination—not consumer-network liquidity. This is a **utility hypothesis**, not proof of profitability. Validate:

- Venue willingness to pay and budget owner
- Rescue volume and staff time per job
- Documented disposal/hauling savings
- Subscription revenue
- Model, hosting, messaging, vendor, onboarding, support, and sales costs
- Partner availability, retention, and implementation burden

Suggested pitch wording:

> “Hotels already have food-waste and community-support evidence responsibilities. SurplusOps is designed to make that evidence easier to capture while coordinating time-sensitive surplus; the pilot tests whether that standalone workflow is worth paying for.”

Do not claim “profitable on Day 1” without venue-level unit economics.

## Business model hypotheses

### B2B SaaS

Core value proposition: food-waste evidence capture, donation/partner records, monthly reporting support, post-event reporting support, midnight coordination speed, and risk visibility. Disposal-cost reduction and overproduction insights are secondary hypotheses, not established savings.

The recommended pricing shape is a **per-property monthly subscription tiered by banquet/event activity**, because it gives hotels a predictable budget and is consistent with the category precedent of site-based hospitality software. Product-specific willingness to pay remains untested.

Indicative price hypotheses from the original concept—not validated:

- Boutique/standalone: AED 800/month
- Standard venue pitch anchor: AED 1,200/month
- Large resort/convention center: AED 2,200/month

Validate price and package boundaries with buyers. A post-event report add-on may be tested. Avoid fee-per-donation (which can reward waste volume), share-of-disposal-savings pricing (savings are unproven), resale commissions, and pay-to-rank recipients.

Potential additional payers—event organizers for green-event reporting and institutional funders for a community digital layer—are hypotheses to test through mentor introductions and discovery conversations.

### B2C/community layer

A free public community-distribution map or channel may be supported by B2B revenue later. It is not required for initial single-venue value; defer broad B2C marketplace features until the rescue workflow and partner operations are validated.

## Evidence and business case

Maintain a separate `evidence/` folder:

1. **Test pack:** 30+ scenarios; expected/actual; sample size; model/policy version; pass rate with numerator and denominator; one real failure and fix.
2. **Time and cost:** manual-versus-agent study with 5–10 volunteers; task definitions, method, median/range, errors, limitations; per-task token/model, hosting, messaging, and vendor costs.
3. **Validation:** 8–10 conversations with kitchen staff, banquet managers, sustainability roles, or comparable operators anywhere in the world. Record role, location, count, date, method, consent, findings, and limitations.
4. **Business case:** sourced Dubai SAM, margin at 10/30/100 jobs per month, pricing assumptions, and named go-to-market channels.
5. **Sources:** primary-source URL/title/date/access date and the precise claim supported.

Use Championship mentors for introductions. Contact UAE Food Bank and ne’ma for a short call; a response is a bonus. Outreach is not a partnership or endorsement.

### Market sizing and hotel beachhead

```text
SAM = count of in-scope Dubai venues × validated or explicitly estimated annual price
```

The [Gulf News report](https://gulfnews.com/business/tourism/dubai-tourist-arrivals-hit-record-157-million-as-hotel-revenues-surge-1.500358328) says that by the end of October 2025 Dubai had 820 accommodation establishments, including 172 five-star and 193 four-star hotels (365 combined). The article was accessible during this update (2026-11-14). Treat the count as dated and source-specific; verify its definitions and current official counts before using it as a present-day SAM denominator.

At an illustrative AED 1,500/month and 365 properties, the ceiling check is:

```text
365 × AED 1,500 × 12 = AED 6,570,000 annual revenue at 100% adoption
```

This is a theoretical revenue ceiling, not a SAM forecast or obtainable market. One hundred properties would equal about 27% of the 365-property denominator, an ambitious share for a new vendor. A first-year target of 5–15 paying venues is a more cautious **target**, not a forecast; validate through sales pipeline and conversion data.

Document venue-count source, inclusion criteria, price source, currency, and assumptions. Do not repeat other TAM/SAM/SOM, venue counts, waste-cost figures, savings, or ARR from older draft material until re-sourced and recalculated.

### Illustrative unit economics (placeholder assumptions only)

The following user-provided illustration uses placeholder inputs and must not be presented as measured economics. Its assumptions are approximately AED 2 variable cost per rescue, AED 200–300 monthly hosting/support allocation, AED 10,000 monthly fixed company cost, and AED 8,000 acquisition cost per hotel. Recalculate with measured cost per job and actual CAC before pitching.

| Scenario | Subscription/month | Jobs/month | Assumed venue contribution/month | Contribution margin | Approx. break-even venues at AED 10,000 fixed cost | CAC payback at AED 8,000 |
|---|---:|---:|---:|---:|---:|---:|
| Boutique | AED 800 | 20 | AED 560 | 70% | 18 | 14.3 months |
| Mid-tier | AED 1,500 | 30 | AED 1,240 | 82.7% | 9* | 6.5 months |
| Large | AED 2,200 | 60 | AED 1,780 | 80.9% | 6 | 4.5 months |

Formula used for illustration:

```text
Contribution = subscription - (jobs × AED 2 variable cost) - monthly venue hosting/support
Contribution margin = contribution / subscription
Break-even venues = ceiling(monthly fixed company cost / contribution per venue)
CAC payback months = CAC / contribution per venue
```

For the mid-tier example, the formula gives 8.1 venues, rounded up to 9. These figures exclude or simplify sales overhead, onboarding labor, taxes, implementation, support variability, churn, payment fees, and other costs. They are not a validated forecast.

Build separate 10/30/100 jobs-per-month scenarios with actual cost components: model/token, hosting allocation, messaging, APIs, onboarding/support, and operational/sales costs. Mark each input `MEASURED`, `ESTIMATE`, or `TARGET`.

```text
Cost per task =
  model/token cost
  + hosting allocation
  + messaging cost
  + relevant third-party API cost
```

Record measurement period, model, token counts, currency, formulas, and assumptions. Do not repeat old estimates such as `$0.003 per rescue`, `>98% gross margin`, “AED 1,800 saved,” or “30 hours saved” without reproducing them from current measured costs and a valid study.

## Sales cycle and procurement hypothesis

No verified Dubai hotel sales-cycle dataset is available in this context. A 2–4 month single-hotel cycle is an **inference** based on reported committee cadence—potentially one to three approval cycles; groups may take longer. Verify the actual budget owner, procurement steps, security review, pilot approval, and decision calendar in interviews. The Sustainable Tourism Stamp runs annually according to the supplied information; check the next application window rather than assuming old dates recur.

Potential channel strategy: group-level hotel deals, hospitality technology partners, food-bank/ne’ma introductions, and a bundled evidence/reporting module may reduce acquisition pressure. These are hypotheses, not established distribution agreements.

### Go-to-market channels to test

- Direct outreach to hotel F&B, banquet, and sustainability leaders
- Dubai hospitality and hotel-sector associations/events
- Dubai Chamber and Championship mentor introductions
- UAE Food Bank and ne’ma outreach/referrals
- Hospitality technology/food-waste vendors
- LinkedIn account-based outreach to named roles
- Catering and convention-center pilot introductions

These are proposed channels, not established partnerships. Track outreach → response → meeting → pilot → conversion.

## UAE marketplace insight: draft, evidence needed

The pitch may compare SurplusOps with **B2C discount surplus marketplaces** neutrally. A Reddit discussion was proposed as qualitative input, but its URL and source details are not present in the project context. Therefore, the following are hypotheses, not established UAE-wide market facts:

- Some premium hotels may avoid retail discounting for brand-positioning reasons.
- Consumers may prefer clear ingredient/allergen/dietary information to unknown boxes.
- Discount platforms may face strong delivery-price competition.
- A listing does not guarantee that all surplus will be claimed.
- Consumer marketplace adoption may depend on local buyer/seller density.

Before using any as a pitch claim:

- Add Reddit post/comment URLs, dates, access date, and known sample/roles to `evidence/sources.md`.
- Label Reddit material anecdotal and non-representative.
- Validate hotel concerns in operator interviews and consumer concerns with appropriate participants.
- Do not claim that mystery boxes inherently violate halal rules or constitute Gharar without qualified, authoritative evidence.
- Source/date claims about Noon, Keeta, Talabat, delivery prices, margins, or disposal outcomes.
- Say “designed not to rely on retail discounting,” not “solves all barriers.”
- Make fallback claims conditional on an available, approved provider.

Suggested slide language:

> “Qualitative market signal (Reddit; anecdotal, [n] comments, accessed [date]): [attributed insight]. Validation status: [interview count or pending].”

### Competitive framing

Compare operating models, not unsupported “critical limitations”:

| Model | Primary role | Neutral comparison |
|---|---|---|
| Food banks/charities | Redistribution and beneficiary services | SurplusOps aims to coordinate operational intake and routing; it does not replace their authority or services |
| Waste analytics (e.g., Winnow) | Measure and reduce kitchen waste | Different point in workflow; verify product capabilities before making comparative claims |
| Compost/organic-waste providers (e.g., Reloop) | Organic waste processing | Potential fallback partner, not an adversary |
| B2C discount marketplaces | Consumer-facing discounted surplus | Different buyer and transaction model; compare only with sourced, current evidence |

Do not disparage named businesses. Distinguish product fact, hypothesis, and third-party evidence.

## Pitch discipline

Every number must be tagged:

- **MEASURED:** method, sample size, and time period documented.
- **ESTIMATE:** assumptions and formula shown.
- **TARGET:** future goal/projection, not achieved.

Source problem statistics and give access date. Do not present an estimate as measured or a target as achieved. Do not claim partner endorsement, official government integration, certification, or regulatory approval without explicit evidence/authorization.

## Six-minute pitch outline

| Time | Segment |
|---|---|
| 0:00–0:45 | Problem and customer; one sourced statistic |
| 0:45–1:15 | Solution, global core/Dubai pack, safety boundary |
| 1:15–3:15 | Embedded two-minute web demo |
| 3:15–4:00 | Evidence: test pack, task-time study, interviews, cost |
| 4:00–4:45 | Business: sourced SAM, unit economics, price hypothesis, channels |
| 4:45–5:30 | Roadmap, team, limits |
| 5:30–6:00 | Close and judge QR |

Use [hackathon_context.md](./hackathon_context.md) for the exact two-minute storyboard and demo acceptance criteria.

## Older submission drafts and unverified claims

The prior master file contained a draft “official business canvas,” “agent card,” market-size figures, partner and regulatory statements, cost-per-task and gross-margin claims, competitor assertions, and purported Championship dates/rubric. Several used unresolved `[cite: n]` placeholders or could not be verified from the document itself. They are **not approved for reuse**.

Before any portal submission or pitch:

- Verify current competition dates, rubric, and submission prompts against the official Championship guide.
- Replace citation placeholders with accessible primary sources.
- Verify UAE regulatory/legal assertions with official sources and qualified local experts.
- Recalculate market size, costs, and margins from current inputs.
- Remove claims not substantiated or label them as assumptions/hypotheses.
