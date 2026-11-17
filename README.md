# SurplusOps AI

SurplusOps is a Dubai-first food-surplus coordination demo with a globally extensible core. This repository currently contains a local simulation: the service portals and adapter responses are mock data and do not call partner or government systems.

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

On this Mac, get its Wi-Fi address with `ipconfig getifaddr en0`. Open `http://<MAC-LAN-IP>:5173` on each phone or laptop connected to the same Wi-Fi; use Demo controls to open the recipient, driver and composter screens. No portal sign-in codes are required. The driver verifies one-time pickup and delivery codes from the recipient; the compost service verifies the one-time collection code shown on the console. The frontend connects to port 8000 on the same host, and the backend allows Vite requests from local IPv4 networks. If macOS Firewall prompts, allow the Python and Node processes. The API docs remain available at `http://<MAC-LAN-IP>:8000/docs`.

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
    pages/                  # one agent console and three simulated portals
evidence/                   # sourced research and project evidence
```

## Judge console routes

- `/` — fast chef intake from a preloaded hall/event menu, followed by a single rescue countdown/journey and completed outcome; timeline, checks, impact record, and agent tool trace are visible in the console/details. F&B managers open **Dish library setup** for daytime menu maintenance and hall QR links.
- `/portal/recipient` — simulated Food Bank/charity recipient offer and accept/decline with reasons
- `/portal/driver` — simulated QR/code pickup, recorded temperature, delivery PIN, and stop state
- `/portal/composter` — simulated Reloop-style compost request and confirmation

The three portals share the server-owned active job with the console using Server-Sent Events and polling fallback. Portal pages open without static access codes. After accepting an offer, per-job pickup and delivery codes are shown on the recipient screen; the driver enters these codes at custody transfer, which the backend verifies and locks after five failed attempts. Compost requests similarly require a per-booking collection code shown on the console and entered on the composter screen, also locked after five failed attempts. Demo controls contain the three stories, real-time/60x speed, portal links (with optional QR codes), and a confirmed reset menu. The backend persists the single active job and hash-chained events in SQLite; reloads restore the current job. Commands include idempotency keys. This is a local demo implementation, not authenticated multi-tenant infrastructure.

All third-party partner actions are clearly labelled simulations. Daytime setup is kept out of the chef's midnight path: managers upload a menu PDF, DOCX, CSV, or up to three menu images in **Dish library setup**, review the draft dishes and declared allergen/halal details, confirm them once, and get a hall-specific QR link. Scanning that link opens `/?hall=<event-id>` and binds the correct menu; without a QR, the single seeded event is selected automatically, with a manual picker only when needed. The chef adds one to three leftover photos and may enter or dictate a short description, taps **Looks right**, then confirms **100% Unserved Back-of-House**. A doubtful/served batch can only take the compost path. The countdown does not start until this confirmation. Photo analysis is closed-set to the selected menu; AI counts are proposals, not safety certification. With a real `GEMINI_API_KEY`, Gemini performs image/menu understanding and limited tool-call proposals; without it, deterministic fallback results are explicitly labelled. Model calls and token usage are tracked per rescue job. Deterministic policy checks remain authoritative.

The `get_weather` tool fetches current temperature, apparent temperature, humidity, precipitation, wind, and conditions from Open-Meteo. If that service is unavailable, the agent reports that no live reading was available rather than inventing a temperature. Weather is context only and does not change the deterministic safety window. PDF/DOCX text extraction runs locally in the backend; image-only menu extraction and leftover-photo recognition require the Gemini API key. Voice dictation uses the browser's real speech-recognition API, which requires a supported browser and a secure HTTPS origin on phones and other LAN devices; typed notes remain available without it.

To demonstrate the fail-safe case, choose **Some was served**; the server routes the batch directly to simulated compost because it only accepts a batch-wide untouched confirmation. Use the demo controls to choose one of the three stories, then complete the scenario from the portal pages. A recipient decline updates the console status and timeline and triggers the next safe route. The driver portal records pickup temperature and PIN-verified final handover.

The audit log is SHA-256 hash-chained and the audit PDF is generated locally. Meals and CO2e are explicitly labelled estimates using illustrative placeholder factors (0.4 kg per meal and 2.5 kg CO2e per kg surplus); they are not measured or sourced impact claims.

For model-assisted menu/photo proposals and function-call planning, uncomment `GEMINI_API_KEY` in `backend/.env` and set your Google AI Studio key; optionally set `SURPLUSOPS_GEMINI_MODEL` to select a compatible Gemini model. No key is required for deterministic fallback behavior. Never put provider credentials in frontend environment variables.

The current demo is not production-ready: OTPs verify a simulated handover step but do not authenticate a person's identity; there is no real partner/Telegram integration, live driver location or routing dispatch, production checkpointer, deployment hardening, public judge URL, or validated local food-safety policy. Portal actions remain simulated; do not use this demo to arrange real food transfers. Browser speech recognition is optional and depends on HTTPS and browser support. Running it locally supports devices on the same Wi-Fi; a hosted deployment is still required for judges to access it from elsewhere.
