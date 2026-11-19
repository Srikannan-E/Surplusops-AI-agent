# SurplusOps simulation API

This is a local/demo backend. Partner portals and workflow actions are simulations; they do not call or represent integrations with UAE Food Bank, registered charities, Deliveroo/Collecteroo, Reloop, ne’ma, DET, or Dubai Municipality.

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `http://localhost:8000/api/health`  
API docs: `http://localhost:8000/docs`

For phones/laptops on the same Wi-Fi, start the frontend with `npm run dev` from `frontend/`, then visit `http://<MAC-LAN-IP>:5173`. The Vite script listens on all interfaces; the browser derives the API host from that address, while the API allows the local private IPv4 origin. Open-Meteo is queried live for weather context; a network failure is reported without substituting a made-up value. Weather does not alter deterministic safety policy. Image/menu AI requires a real `GEMINI_API_KEY`, configured only in the backend environment. Browser speech recognition requires HTTPS and a supported browser on mobile devices.

Partner portals open without static access codes. The backend generates per-job pickup and delivery codes after offer acceptance. The recipient screen shares them with the driver, and the backend verifies each code before changing custody state; five failed attempts lock that code. A compost fallback similarly creates a one-time collection code shown on the console and entered by the composter portal. These codes verify a simulated handover step only—they do not establish participant identity. Portal snapshots and audit events omit the codes; credential endpoints use `Cache-Control: no-store`.

Portal requests and simulation events are stored in `backend/data/surplusops.sqlite3`. LangGraph uses an in-memory checkpointer in this initial local version; do not use it as production persistence.

## Available simulated portals

- `reloop`: organic-waste collection request
- `collecteroo`: first-mile logistics dispatch request
- `uae-food-bank`: food donation intake/offer

The demo graph checks explicit safety inputs first. It offers eligible food to the simulated UAE Food Bank, then a registered charity on decline, then sends it through the simulated logistics adapter. If food is ineligible or all recipients decline, it creates a simulated Reloop fallback request.

Use synthetic data only. This backend is not food-safety advice or authorization to donate food.
