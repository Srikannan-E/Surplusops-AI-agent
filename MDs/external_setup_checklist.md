# SurplusOps AI — External Setup and Account Checklist

> Purpose: identify the external accounts, credentials, permissions, and service decisions needed before implementation. Split into local development/testing and hosted production-demo preparation. This is a setup checklist, not a request to paste secrets into chat or Markdown.

## Guiding decisions

- The primary judge experience is a single-page web app. A judge does not need Telegram, a second device, or accounts with UAE government/food-bank partners.
- Use local seeded data and simulated partner adapters for UAE Food Bank, ne’ma reporting, Dubai Municipality evidence mapping, Reloop, and Collecteroo unless an authorized live integration is formally available.
- Use LangGraph for workflow orchestration. Keep model access behind a provider-neutral interface so Gemini, Claude, and future providers can be configured without changing workflow/business logic.
- Keep LangGraph checkpointing separate from response/data caching. Local development and single-instance demo testing do not require a managed cache account.
- Get real credentials only for services used live in the demo. Avoid building dependencies on third-party accounts where browser APIs, open data, or deterministic fixtures suffice.
- Use separate development and demo/prod credentials. Never commit secrets, add them to evidence screenshots, or send them in chat.
- Exact model IDs, modalities, pricing, quotas, and provider limits change; verify them against current official docs and the selected account just before use.

## Division A — Development and testing

### A1. Accounts and services to prepare

| Priority | Account/service | Needed for | Account/credential? | Recommendation / notes |
|---|---|---|---|---|
| Required | Source control (GitHub or equivalent) | Code, issues, optional CI | Account; CI secrets only if CI calls external services | Private repo is fine. Never put `.env` or keys in commits. |
| Required for live AI tests | One selected provider: Google AI Studio / Gemini API, Vertex AI, or Anthropic API | Photo/menu extraction; optional audio | Provider credential/service identity | Start with one provider (Gemini candidate). Configure provider/model separately from credentials; keep a common extraction schema and deterministic fixture mode. Check image/audio support, structured output, quota, pricing, region/account availability, and model lifecycle. |
| Optional until provider switching is tested | Anthropic Console / Claude API | Validate Claude adapter and model portability | Anthropic API key | Not needed to start development. Add as a second live provider only after the common interface and provider contract tests exist. Confirm selected Claude model image/input and structured-output capabilities. |
| Required for the product | Local development environment | API server, UI, tests, SQLite | No external account | Python/Node tooling and a local `.env`; keep synthetic data only. |
| Required for browser feature testing | Modern browser with camera/mic/location permissions | Photo capture, optional voice capture, geolocation/map | No external account | `localhost` normally qualifies as a secure context. Test permission denied, unavailable hardware, and manual upload/location fallback. Camera and microphone permissions are per browser/device. |
| Required for live weather test, optional otherwise | Open-Meteo | Weather input | No key for typical public API use; review current terms/limits | Use cached fixture for deterministic unit tests. Do not use weather as the sole food-safety evidence. |
| Required for map UI, optional for routing | OpenStreetMap-compatible tile service | Map rendering | Usually no API key for public tiles; usage policy applies | Use only a compliant tile endpoint. Do not assume the public community tile servers are a free production CDN. |
| Optional for realistic route/ETA testing | OSRM public demo or a hosted routing provider | Route estimate and travel time | Public demo may not need a key; hosted/commercial services may require account/token | Public OSRM is not an SLA-backed production service. Keep a seeded route/ETA adapter. |
| Optional for voice feature | Gemini audio input or browser speech-recognition API | Voice note to text/structured data | Gemini uses its API credential; browser API has no app credential | Voice is optional for MVP. Browser speech support varies and may use a browser vendor's remote service; disclose this and provide typed/text fallback. Do not add a separate transcription vendor unless needed. |
| Optional | Telegram BotFather | Video/demo companion or later operations | Bot token | Not needed for Judge Test Mode. Create only if Telegram is actually implemented; use a separate dev bot. |
| Optional | Sentry or equivalent | Error diagnostics | Project DSN/account | Keep PII and images out of event payloads. Local structured logs are enough initially. |
| Optional | GitHub Actions or other CI | Automated tests/lint | Repo settings; secrets only for integration tests | Run safety/state tests without external keys. Use repository secrets for any isolated integration smoke tests. |

### A2. External credentials to request/create

- [ ] Create a development project and one development-only credential for the initially selected model provider.
- [ ] Choose the initial model provider; Gemini is the first candidate, not a hardcoded architectural dependency.
- [ ] Verify model IDs available to that project and record provider, model ID, check date, quota, pricing, input modalities, and rate limits in local setup notes.
- [ ] Create an Anthropic account/key only if a real Claude adapter test is scheduled; model switching can be architected before buying/testing a second provider.
- [ ] Set a small usage/billing budget or quota alert if the provider offers it.
- [ ] If testing hosted routes, create a routing-provider test account/token; otherwise start with seeded routes and a local/mock OSRM adapter.
- [ ] If testing Telegram, create a dev bot and store its token locally only.
- [ ] If using error tracking, create a development project and configure a DSN that excludes sensitive user content.
- [ ] Add only synthetic venue, menu, recipient, location, and event data to development fixtures.

### A3. Browser capabilities to test (no vendor account required)

- [ ] Camera: QR scan and photo capture, with upload-from-file fallback.
- [ ] Microphone: optional voice note; typed note must remain available.
- [ ] Location: browser location permission is optional. For the judge scenario use seeded venue/recipient coordinates so denied location does not break the demo.
- [ ] HTTPS: local `localhost` is suitable for development secure-context testing; any remote staging URL needs HTTPS for camera/mic/location access.
- [ ] Permission-denied and device-unavailable states show a clear explanation and alternative path.
- [ ] No continuous/background location tracking is needed for the hackathon. Simulate driver movement or use explicit demo controls.

### A4. Suggested local configuration names

Create `.env.example` with names and blank/safe placeholders only; keep real values in an ignored `.env`.

```dotenv
APP_ENV=development
APP_BASE_URL=http://localhost:8000
DATABASE_URL=sqlite:///./surplusops.db

AI_PROVIDER=gemini
AI_MODEL_NAME=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
AI_REQUEST_TIMEOUT_SECONDS=30
AI_MAX_RETRIES=1
AI_MAX_REQUESTS_PER_USER_PER_HOUR=20
AI_RESPONSE_CACHE_TTL_SECONDS=0

WEATHER_PROVIDER=open_meteo
WEATHER_API_KEY=
ROUTING_PROVIDER=seeded
ROUTING_API_KEY=
MAP_TILE_URL=

LANGGRAPH_CHECKPOINTER=sqlite
LANGGRAPH_CHECKPOINT_RETENTION_DAYS=7
CACHE_BACKEND=memory
REDIS_URL=

STORAGE_PROVIDER=local
UPLOAD_MAX_MB=10
UPLOAD_RETENTION_HOURS=24

TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=

SENTRY_DSN=
```

Only define and use variables needed by the selected implementation. Provider-specific keys are separate; load only the credential for the enabled provider, server-side. Open-Meteo commonly needs no key; leave `WEATHER_API_KEY` unset unless the chosen plan requires it. `LANGGRAPH_CHECKPOINTER=sqlite` and `CACHE_BACKEND=memory` are illustrative local defaults, not mandates for a specific package API. Do not commit populated `.env` files.

### A5. Testing setup that should not require external accounts

- Unit and policy tests: fake clock, seeded evidence, deterministic weather and routes.
- Agent/state-machine tests: mocked AI response and simulated recipient/driver adapters.
- Judge flow: preset photo + stored extraction fixture, then optional live-model mode.
- Government/vendor paths: simulated adapters with explicit labels; no partner credentials.
- PDF generation, SHA-256 chain, revoke, timeout, double-tap/idempotency tests: local only.

## Division B — Hosted production/demo

### B1. Required accounts/services for a shareable judge URL

| Priority | Account/service | Needed for | Provisioning notes |
|---|---|---|---|
| Required | Cloud application hosting | HTTPS web app/API/WebSockets | Choose one host that supports the app runtime, WebSockets, background tasks as needed, environment secrets, logs, and health checks. Create a separate demo environment. Confirm sleep/idle behavior and WebSocket limits. |
| Required for persistent hosted state | Managed database or durable volume | Batches, audit events, scenario state | PostgreSQL is preferred if multiple demo users share the service. SQLite is acceptable only if host disk persistence and single-instance constraints are confirmed. Apply migrations and reset/seed controls safely. |
| Required for live AI mode | Production/demo project or isolated credential for the enabled model provider | Live judge photo extraction | Use a separate key/project from development, least privilege where supported, quota/budget alerts, request limits, timeouts, and fixture fallback. Store only in host secrets. Do not provision multiple provider accounts unless they will be tested. |
| Required for camera/mic from judge devices | HTTPS origin | Browser camera, microphone, and geolocation APIs | Hosting-provided HTTPS is sufficient for a pilot; a custom domain is optional. Test browser permission flows on the actual demo URL. |
| Recommended | Object storage, only if uploaded media must persist | Temporary photos and generated artifacts | Use a private bucket, short retention/lifecycle deletion, restricted access, and signed URLs if needed. Avoid persistent photo storage unless there is a clear requirement; local ephemeral processing is simpler. |
| Recommended | Domain/DNS | Easy-to-share branded judge URL | Optional if hosting provides a stable URL. Configure TLS through the host; do not buy a domain until selected. |
| Optional | Hosted routing/map provider | More reliable live routes/tiles | Choose only if public OSM/OSRM use is insufficient. Create a restricted token with allowed origins and quotas. Keep route simulation fallback. |
| Optional | Managed cache/rate-limit store (for example Redis-compatible) | Multi-instance response cache or distributed rate limits | Not required for local development or a single-instance demo. It is not the LangGraph checkpointer; choose it only if deployment scale/architecture requires it. For a small demo, use a local bounded cache and database-backed rate limits. |
| Optional | Error monitoring | Production exceptions and uptime visibility | Configure DSN in host secrets; scrub prompts, images, names, phone numbers, coordinates, and tokens from captured events. |
| Optional | Telegram bot | Companion video/demo channel | Not required for judge access. Use a separate demo bot token; never expose it in browser code. |
| Not required for demo | UAE Food Bank, ne’ma, DET/Dubai Municipality, Reloop, Collecteroo accounts | None, unless written authorization and a documented API/onboarding path exist | Keep simulated. Do not request credentials or imply access/partnership without authorization. |

### B2. Production/demo credentials and operational controls

- [ ] Create separate demo/prod credential/project for the enabled AI provider; set quota/budget alerts and per-user/IP limits.
- [ ] Pin `AI_MODEL_NAME` in deployment configuration after current model/account verification. Do not hardcode it in source.
- [ ] Create hosting account/project and store secrets in its secret manager/environment settings.
- [ ] Select durable DB and backup/reset approach. Protect audit history; demo reset must not delete user data outside the seeded demo tenant.
- [ ] Decide whether uploaded images are processed transiently or stored. If stored, configure private object storage, retention/deletion policy, access control, and consent notice.
- [ ] If a custom domain is needed, obtain DNS access and configure HTTPS; otherwise use host URL.
- [ ] If using a live map/routing token, restrict allowed origins, scopes, quotas, and billing alerts.
- [ ] Configure rate limits, file-size limits, timeouts, health endpoint, logs, and error alerts.
- [ ] Create a production-like seeded scenario. Never use real donor/recipient personal data in judge fixtures.
- [ ] Publish a simple privacy notice describing image/audio processing, retention, simulated integrations, and how to contact the demo owner.
- [ ] Verify deployment can serve browser APIs over HTTPS, support WebSockets, and remain awake during the judging window.
- [ ] Test live AI failure, rate-limit response, network loss, DB restart, and fallback-to-preset behavior before sharing the URL.

### B3. Demo integration status

Recommended statuses:

```text
LIVE       External service was actually called successfully
CACHED     Previously fetched result reused; show its timestamp/age
SIMULATED  Deterministic local adapter or fixture used
HUMAN-CONFIRMED  A person explicitly supplied/confirmed evidence
POLICY-DERIVED   Decision computed from a named, versioned policy pack
```

For the hackathon demo, plan these as simulated unless authorized access exists:

- UAE Food Bank recipient offers
- ne’ma reporting/export
- DET/Dubai Municipality policy or reporting surfaces
- Reloop fallback booking
- Collecteroo/driver dispatch
- Recipient capacity and driver GPS

The judge console must not present a simulated request as a real government submission, partner API call, endorsement, acceptance, or dispatch.

## Accounts and secrets not to collect

- Do not ask the user to paste API keys, bot tokens, passwords, cloud credentials, or personal account data into this Markdown file or chat.
- Do not request real recipient/driver phone numbers for the hackathon demo.
- Do not create live government/charity accounts merely to make a demo look integrated.
- Do not enable billing until the specific provider/service is selected and its expected usage is understood.

## Go/no-go checklist before build

- [ ] Decide whether the first version uses the selected provider in live mode plus deterministic preset fallback; Gemini is the initial candidate, Claude is an optional additional provider.
- [ ] Decide hosting only when local architecture and runtime are known.
- [ ] Use local seeded database first; choose hosted persistent storage before multi-judge sharing.
- [ ] Use seeded coordinates and map controls before purchasing a mapping plan.
- [ ] Keep voice capture optional and use browser permission/fallback tests before adding a voice vendor.
- [ ] Confirm every service in the app has a selected mode: live, cached, or simulated.
- [ ] Ensure core tests pass without any API secrets set.
- [ ] Store actual credentials in local ignored environment files or deployment secret manager only.

## Official setup references

Check current terms, quotas, model names, and policies when provisioning:

- [Google AI Studio / Gemini API documentation](https://ai.google.dev/gemini-api/docs)
- [Google Gemini model catalog](https://ai.google.dev/gemini-api/docs/models)
- [Open-Meteo API documentation](https://open-meteo.com/en/docs)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OSRM API documentation](https://project-osrm.org/docs/v5.24.0/api/)
- [MDN: getUserMedia camera/microphone permissions](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Telegram Bot API](https://core.telegram.org/bots/api)

This list is provider guidance, not a recommendation to adopt every service. Select the smallest set that supports the actual demo.
