from __future__ import annotations

import asyncio
import binascii
import json
import re
import textwrap
import threading
import uuid
import base64
import mimetypes
import secrets
import zipfile
from io import BytesIO
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.responses import Response, StreamingResponse
from app.domain.models import (
    ColdStorageRequest,
    CollecterooRequest,
    CustodyAction,
    FoodBankRequest,
    FoodEvent,
    EventAnalyzeRequest,
    MenuExtractRequest,
    IntakeConfirmation,
    JobCommand,
    NemaStyleRecord,
    OrganiserTakeover,
    RescueRevokeRequest,
    ReloopRequest,
    RescueRunRequest,
)
from app.domain.storage import (
    GENESIS_HASH,
    add_event,
    create_record,
    initialize_storage,
    list_all_records,
    get_active_job,
    get_food_event,
    get_command_result,
    get_job,
    list_events,
    list_food_events,
    list_records,
    save_command_result,
    save_job,
    save_food_event,
    utc_now,
    verify_event_chain,
)
from app.agent_tools import (
    PolicyBlocked,
    TOOL_REGISTRY,
    analyze_photo,
    execute_tool,
    parse_menu,
    policy_gate,
    propose_tool_call,
)
from app.graph.workflow import run_rescue, safety_gate
from app.integrations.simulated.adapters import book_reloop_fallback, create_portal_request

app = FastAPI(
    title="SurplusOps Simulation API",
    version="0.1.0",
    description="Local simulation only. No partner or government APIs are called.",
)
_job_command_lock = threading.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=(
        r"^http://(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*", "Authorization"],
)

SERVICE_MODELS = {
    "reloop": ReloopRequest,
    "collecteroo": CollecterooRequest,
    "uae-food-bank": FoodBankRequest,
    "public-cold-storage": ColdStorageRequest,
}

SERVICE_DETAILS = [
    {
        "id": "reloop",
        "name": "Reloop",
        "category": "Organic-waste fallback",
        "description": "Simulated organic-waste collection request. No booking reaches Reloop.",
        "mode": "SIMULATED",
    },
    {
        "id": "collecteroo",
        "name": "Deliveroo Collecteroo",
        "category": "First-mile logistics",
        "description": "Simulated logistics request. No rider or courier is dispatched.",
        "mode": "SIMULATED",
    },
    {
        "id": "uae-food-bank",
        "name": "UAE Food Bank",
        "category": "Donation intake",
        "description": "Simulated donation offer. No offer is sent to the UAE Food Bank.",
        "mode": "SIMULATED",
    },
    {
        "id": "public-cold-storage",
        "name": "Public Cold Storage",
        "category": "Community cold-storage capacity",
        "description": "Seeded public/community cold-storage facility simulation; not a live facility directory.",
        "mode": "SIMULATED",
    },
]


@app.on_event("startup")
def startup() -> None:
    initialize_storage()
    _seed_demo_event()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "SIMULATED"}


@app.get("/api/jobs/{batch_id}/handover-credentials")
def get_recipient_handover_details(batch_id: str, response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    job = get_job(batch_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Demo job not found.")
    if job.get("status") not in {"ACCEPTED", "PICKED_UP"} or not job.get("delivery_pin") or not job.get("pickup_code"):
        raise HTTPException(status_code=409, detail="Recipient handover details are not available yet.")
    return {"pickup_code": job["pickup_code"], "delivery_pin": job["delivery_pin"]}


@app.get("/api/jobs/{batch_id}/compost-credentials")
def get_compost_verification_code(batch_id: str, response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    with _job_command_lock:
        job = get_job(batch_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Demo job not found.")
        if job.get("status") != "COMPOST_REQUESTED":
            raise HTTPException(status_code=409, detail="There is no active compost collection to verify.")
        _ensure_compost_otp(job)
        save_job(batch_id, job)
        return {"verification_code": job["compost_otp"]}


@app.get("/api/events")
def get_events_catalog() -> list[dict[str, Any]]:
    return list_food_events()


@app.post("/api/events/extract")
def extract_event_menu(request: MenuExtractRequest) -> dict[str, Any]:
    text = request.text
    content_type = request.content_type or mimetypes.guess_type(request.filename)[0] or "text/plain"
    if request.file_base64:
        if content_type == "application/pdf":
            from io import BytesIO
            from pypdf import PdfReader
            from pypdf.errors import PdfReadError

            try:
                pdf_bytes = base64.b64decode(request.file_base64, validate=True)
                reader = PdfReader(BytesIO(pdf_bytes))
                extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)
                text = "\n".join(part for part in (extracted_text, text) if part.strip())
            except (binascii.Error, PdfReadError, ValueError, OSError) as exc:
                raise HTTPException(status_code=422, detail=f"Could not read the uploaded menu PDF: {exc}") from exc
        elif content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            try:
                with zipfile.ZipFile(BytesIO(base64.b64decode(request.file_base64, validate=True))) as document:
                    xml = ElementTree.fromstring(document.read("word/document.xml"))
                    extracted_text = " ".join(
                        node.text or ""
                        for node in xml.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
                    )
                text = "\n".join(part for part in (extracted_text, text) if part.strip())
            except (binascii.Error, KeyError, ValueError, OSError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
                raise HTTPException(status_code=422, detail=f"Could not read the uploaded Word document: {exc}") from exc
    started = datetime.now(timezone.utc)
    items, model_info = parse_menu(
        text,
        request.filename,
        content_type,
        request.file_base64 if content_type != "text/plain" else "",
    )
    menu_items = [
        {
            "id": f"menu-{uuid.uuid4().hex[:12]}",
            "name": item["name"],
            "category": item.get("category", "other"),
            "allergens": item.get("allergens", []),
            "halal": item.get("halal", "unknown"),
            "diet_tags": item.get("diet_tags", []),
            "planned_qty": item.get("planned_qty", {}),
            "holding": item.get("holding", "ambient"),
            "serving": item.get("serving", "buffet"),
            "source": "ai" if not model_info["fallback"] else "user",
            "confirmed": False,
        }
        for item in items
        if isinstance(item, dict) and isinstance(item.get("name"), str) and item["name"].strip()
    ]
    job = get_active_job()
    if job is None or job.get("status") == "DRAFT":
        job = _ensure_active_job()
        usage = model_info.get("token_usage", {})
        job_usage = job.setdefault("token_usage", {"prompt_tokens": 0, "output_tokens": 0, "calls": 0})
        job_usage["prompt_tokens"] += int(usage.get("prompt_tokens", 0))
        job_usage["output_tokens"] += int(usage.get("output_tokens", 0))
        if not model_info.get("fallback"):
            job_usage["calls"] += 1
        _append_job_event(job, "TOOL_CALL", "agent", False, {
            "name": "parse_menu",
            "inputs": {"filename": request.filename, "content_type": content_type},
            "outputs": {"item_names": [item["name"] for item in menu_items]},
            "duration_ms": max(0, int((datetime.now(timezone.utc) - started).total_seconds() * 1000)),
            "simulated": False,
            "rationale": "Extract draft menu items; dietary declarations still require venue confirmation.",
            "fallback": model_info.get("fallback", False),
        })
        save_job(job["batch_id"], job)
    return {"items": menu_items, "model": model_info}


@app.post("/api/events", status_code=201)
def create_food_event(event: FoodEvent) -> dict[str, Any]:
    if not event.menu_items:
        raise HTTPException(status_code=422, detail="Add at least one menu item to the event.")
    if any(not item.confirmed for item in event.menu_items):
        raise HTTPException(status_code=422, detail="Confirm every menu item and its venue-declared dietary details.")
    if get_food_event(event.id) is not None:
        raise HTTPException(status_code=409, detail="An event with this id already exists.")
    result = event.model_dump()
    save_food_event(event.id, result)
    return result


@app.post("/api/events/{event_id}/select")
def select_food_event(event_id: str) -> dict[str, Any]:
    event = get_food_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    with _job_command_lock:
        job = _ensure_active_job()
        if job["status"] != "DRAFT":
            raise HTTPException(status_code=409, detail="Start a new rescue before selecting another event.")
        job.update({
            "event_id": event_id,
            "event_name": event["name"],
            "venue_name": event["venue"],
            "pickup_location": event["venue"],
            "dishes": [item["name"] for item in event["menu_items"]],
            "allergens": sorted({allergen for item in event["menu_items"] for allergen in item["allergens"]}),
            "halal_status": "declared by venue; unverified",
        })
        _append_job_event(job, "EVENT_SELECTED", "chef", False, {"event_id": event_id, "name": event["name"]})
        save_job(job["batch_id"], job)
        return _job_view(job)


@app.post("/api/events/{event_id}/analyze")
def analyze_event_leftovers(event_id: str, request: EventAnalyzeRequest) -> dict[str, Any]:
    event = get_food_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    if not event["menu_items"]:
        raise HTTPException(status_code=409, detail="This event has no saved menu to match against.")
    active_job = get_active_job()
    if active_job is None or active_job["status"] != "DRAFT" or active_job.get("event_id") != event_id:
        raise HTTPException(status_code=409, detail="Select this event before analyzing leftover photos.")
    content_type = mimetypes.guess_type(request.photo_name)[0] or "image/jpeg"
    started = datetime.now(timezone.utc)
    analysis, model_info = analyze_photo(
        event["menu_items"],
        request.photo_name,
        request.photo_base64,
        content_type,
        request.voice_note,
    )
    menu_names = [item["name"] for item in event["menu_items"]]
    allowed_names = set(menu_names)
    new_observations = [
        {**item, "menu_item": item.get("menu_item", "")}
        for item in analysis.get("observations", [])
        if item.get("menu_item") in allowed_names
    ]
    observations_by_name = {
        item["menu_item"]: item
        for item in active_job.get("observations", [])
        if item.get("menu_item") in allowed_names
    }
    for item in new_observations:
        previous = observations_by_name.get(item["menu_item"])
        if previous is None:
            observations_by_name[item["menu_item"]] = item
        else:
            observations_by_name[item["menu_item"]] = {
                **previous,
                "detected": previous.get("detected") is True or item.get("detected") is True,
                "tray_count_min": max(previous.get("tray_count_min", 0), item.get("tray_count_min", 0)),
                "tray_count_max": max(previous.get("tray_count_max", 0), item.get("tray_count_max", 0)),
                "confidence": max(previous.get("confidence", 0), item.get("confidence", 0)),
                "notes": "; ".join(dict.fromkeys(filter(None, [previous.get("notes", ""), item.get("notes", "")]))),
            }
    observations = list(observations_by_name.values())
    matched = {item["menu_item"] for item in observations if item.get("detected") is True}
    unmatched = list(dict.fromkeys(
        list(active_job.get("unmatched", []))
        + [str(name) for name in analysis.get("unmatched", []) if name not in allowed_names]
    ))
    not_seen = list(dict.fromkeys(
        [name for name in menu_names if name not in matched]
        + [str(name) for name in analysis.get("menu_items_not_seen", []) if name in allowed_names]
    ))
    detected_names = list(matched)
    safely_approved = detected_names if request.served_status == "untouched" else []
    compost_only = [] if request.served_status == "untouched" else menu_names
    existing_photos = active_job.get("photos", [])
    if not any(item.get("name") == request.photo_name for item in existing_photos):
        existing_photos = [*existing_photos, {"name": request.photo_name, "content_type": content_type}]
    active_job.update({
        "photos": existing_photos,
        "observations": observations,
        "unmatched": unmatched,
        "approved_items": safely_approved,
        "compost_only": compost_only,
        "analysis_model": model_info,
    })
    usage = model_info.get("token_usage", {})
    job_usage = active_job.setdefault("token_usage", {"prompt_tokens": 0, "output_tokens": 0, "calls": 0})
    job_usage["prompt_tokens"] += int(usage.get("prompt_tokens", 0))
    job_usage["output_tokens"] += int(usage.get("output_tokens", 0))
    if not model_info.get("fallback"):
        job_usage["calls"] += 1
    _append_job_event(active_job, "TOOL_CALL", "agent", False, {
        "name": "analyze_leftover_photo",
        "inputs": {
            "event_id": event_id,
            "photo_name": request.photo_name,
            "menu_names": menu_names,
            "voice_note": request.voice_note,
        },
        "outputs": {
            "observations": observations,
            "unmatched": unmatched,
            "menu_items_not_seen": not_seen,
        },
        "duration_ms": max(0, int((datetime.now(timezone.utc) - started).total_seconds() * 1000)),
        "simulated": False,
        "rationale": "Compare the photo against only the selected event menu; results are proposals.",
    })
    _append_job_event(active_job, "PHOTO_ANALYZED", "agent", False, {
        "event_id": event_id,
        "photo_name": request.photo_name,
        "voice_note": request.voice_note,
        "observations": observations,
        "unmatched": unmatched,
        "menu_items_not_seen": not_seen,
        "served_status": request.served_status,
        "approved_items": safely_approved,
        "compost_only": compost_only,
        "fallback": model_info["fallback"],
    })
    if model_info.get("fallback"):
        _append_job_event(active_job, "FALLBACK", "agent", False, {
            "name": "analyze_leftover_photo",
            "reason": model_info.get("reason", "Photo analysis used its deterministic fallback."),
            "rationale": "The deterministic, closed-set fallback was used; human confirmation remains required.",
        })
    save_job(active_job["batch_id"], active_job)
    return {
        "observations": observations,
        "unmatched": unmatched,
        "menu_items_not_seen": not_seen,
        "approved_items": safely_approved,
        "compost_only": compost_only,
        "model": model_info,
    }


def _new_job_snapshot() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    batch_id = f"DEMO-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    return {
        "batch_id": batch_id,
        "event_id": "",
        "photos": [],
        "observations": [],
        "unmatched": [],
        "approved_items": [],
        "compost_only": [],
        "token_usage": {"prompt_tokens": 0, "output_tokens": 0, "calls": 0},
        "status": "DRAFT",
        "venue_name": "Demo Hotel Dubai",
        "event_name": "Evening banquet service",
        "dishes": ["Vegetable biryani", "Grilled chicken"],
        "food_summary": "Vegetable biryani and grilled chicken portions",
        "photo_name": "",
        "estimated_weight_kg": 24.0,
        "untouched_confirmed": False,
        "allergens": ["Dairy", "Nuts"],
        "halal_status": "verified by venue",
        "pickup_location": "Demo Hotel Dubai, Business Bay",
        "remaining_safe_seconds": 3600,
        "clock_speed": 1,
        "clock_anchor": now.isoformat(),
        "current_tier": 0,
        "rungs": {
            "1": {"label": "People first", "state": "idle", "attempts": []},
            "2": {"label": "Longer-life channel", "state": "idle", "attempts": []},
            "3": {"label": "Composting", "state": "idle", "attempts": []},
            "4": {"label": "Human", "state": "idle", "attempts": []},
        },
        "scenario": "happy_path",
        "food_bank_response": "accept",
        "food_bank_decline_reason": "",
        "longer_life_response": "accept",
        "longer_life_decline_reason": "",
        "selected_recipient": "",
        "pickup_temperature_c": None,
        "cancelled": False,
        "human_takeover": False,
    }


def _normalize_job(job: dict[str, Any]) -> dict[str, Any]:
    job.setdefault("event_id", "")
    job.setdefault("photos", [])
    job.setdefault("observations", [])
    job.setdefault("unmatched", [])
    job.setdefault("approved_items", [])
    job.setdefault("compost_only", [])
    job.setdefault("token_usage", {"prompt_tokens": 0, "output_tokens": 0, "calls": 0})
    job.setdefault("agent_llm_calls", 0)
    return job


def _seed_demo_event() -> None:
    if list_food_events():
        return
    event = FoodEvent(
        id="event-demo-banquet",
        name="Evening banquet service",
        type="Banquet",
        venue="Demo Hotel Dubai",
        start="2026-11-16T18:00:00+04:00",
        end="2026-11-16T22:00:00+04:00",
        guest_count=120,
        contact="Demo kitchen · demo@example.test",
        status="planned",
        menu_items=[
            {
                "id": "menu-veg-biryani",
                "name": "Vegetable biryani",
                "category": "Main course",
                "allergens": ["Dairy"],
                "halal": "unknown",
                "diet_tags": ["Vegetarian"],
                "planned_qty": {"value": 4, "unit": "trays"},
                "holding": "hot",
                "serving": "buffet",
                "source": "user",
                "confirmed": True,
            },
            {
                "id": "menu-grilled-chicken",
                "name": "Grilled chicken",
                "category": "Main course",
                "allergens": [],
                "halal": "unknown",
                "diet_tags": [],
                "planned_qty": {"value": 3, "unit": "trays"},
                "holding": "hot",
                "serving": "buffet",
                "source": "user",
                "confirmed": True,
            },
            {
                "id": "menu-seasonal-salad",
                "name": "Seasonal salad",
                "category": "Side",
                "allergens": ["Nuts"],
                "halal": "unknown",
                "diet_tags": ["Vegan"],
                "planned_qty": {"value": 2, "unit": "trays"},
                "holding": "chilled",
                "serving": "buffet",
                "source": "user",
                "confirmed": True,
            },
        ],
    )
    save_food_event(event.id, event.model_dump())


def _ensure_active_job() -> dict[str, Any]:
    job = get_active_job()
    if job is not None:
        return _normalize_job(job)
    job = _new_job_snapshot()
    save_job(job["batch_id"], job)
    _append_job_event(job, "JOB_CREATED", "system", False, {"status": "DRAFT"})
    return job


def _append_job_event(
    job: dict[str, Any],
    event_type: str,
    actor: str,
    simulated: bool,
    payload: dict[str, Any],
) -> dict[str, Any]:
    event = add_event(
        job["batch_id"],
        event_type,
        event_type,
        _event_summary(event_type, payload),
        {"actor": actor, "simulated": simulated, "payload": payload},
    )
    return _event_envelope(event, len(list_events(job["batch_id"])))


def _event_summary(event_type: str, payload: dict[str, Any]) -> str:
    summaries = {
        "JOB_CREATED": "A new demo rescue job was created.",
        "ITEMS_PROPOSED": "The intake photo and menu items were proposed for review.",
        "CHEF_CONFIRMED": "The chef confirmed the intake details and untouched status.",
        "WINDOW_COMPUTED": "The safe-window countdown and escalation point were set.",
        "OFFER_SENT": f"An offer was sent to {payload.get('recipient', 'the next recipient')}.",
        "OFFER_DECLINED": f"The offer was declined: {payload.get('reason', 'no reason provided')}.",
        "OFFER_ACCEPTED": f"The offer was accepted by {payload.get('recipient', 'the recipient')}.",
        "REPLAN": f"The rescue plan moved to {payload.get('recipient', 'the next rung')}.",
        "PICKUP_CONFIRMED": "Driver pickup and the handover temperature were recorded.",
        "DELIVERY_CONFIRMED": "The delivery PIN was verified and handover was recorded.",
        "ESCALATED": "The human-escalation threshold was reached.",
        "HUMAN_TAKEOVER": "An organiser took over the rescue.",
        "WINDOW_EXPIRED": "The safe window expired; human-consumption routing stopped.",
        "COMPOST_REQUESTED": "A simulated compost booking was requested.",
        "COMPOST_CONFIRMED": "The simulated compost booking was confirmed.",
        "AUDIT_SEALED": "The audit event chain was sealed for this outcome.",
        "DEMO_CLOCK_CHANGED": f"Demo clock changed to x{payload.get('speed', 1)}.",
        "JOB_RESET": "The previous demo job was reset.",
    }
    if event_type == "TOOL_CALL":
        return f"Agent used {payload.get('name', 'a tool')}. {payload.get('rationale', '')}".strip()
    if event_type == "POLICY_BLOCK":
        return f"Policy blocked {payload.get('name', 'a proposed action')}: {payload.get('reason', 'safety check failed')}"
    if event_type == "FALLBACK":
        return f"Agent fallback: {payload.get('reason', 'deterministic action used')}"
    if event_type == "PHOTO_ANALYZED":
        return "Leftover photo analyzed against the selected event menu."
    return summaries.get(event_type, event_type.replace("_", " ").capitalize())


def _event_envelope(event: dict[str, Any], seq: int) -> dict[str, Any]:
    metadata = event["metadata"]
    simulated = metadata.get(
        "simulated",
        event["status"].startswith("SIMULATED") or event["event_type"] in {
            "FOOD_BANK_OFFER_SENT",
            "COLD_STORAGE_OFFER_SENT",
            "COMPOST_FALLBACK_BOOKED",
        },
    )
    return {
        "id": event["id"],
        "seq": seq,
        "ts": event["created_at"],
        "actor": metadata.get("actor", "agent"),
        "simulated": simulated,
        "type": event["event_type"],
        "payload": metadata.get("payload", metadata),
        "prev_hash": event["previous_hash"],
        "hash": event["event_hash"],
        "summary": event["summary"],
    }


def _remaining_seconds(job: dict[str, Any]) -> int:
    if job["status"] == "DRAFT":
        return int(job["remaining_safe_seconds"])
    anchor = datetime.fromisoformat(job["clock_anchor"])
    elapsed = (datetime.now(timezone.utc) - anchor).total_seconds()
    return max(0, int(job["remaining_safe_seconds"] - elapsed * job["clock_speed"]))


def _verify_compost_otp(job: dict[str, Any], submitted_code: str) -> bool:
    attempts = int(job.get("compost_otp_attempts", 0))
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Compost collection verification is locked after five failed attempts.")
    expected_code = str(job.get("compost_otp", ""))
    if expected_code and secrets.compare_digest(submitted_code, expected_code):
        return True

    job["compost_otp_attempts"] = attempts + 1
    save_job(job["batch_id"], job)
    add_event(
        job["batch_id"],
        "COMPOST_CODE_REJECTED",
        "REJECTED",
        "An incorrect compost collection code was entered; access is monitored and rate-limited.",
        {"attempt": attempts + 1},
    )
    if attempts + 1 >= 5:
        raise HTTPException(status_code=429, detail="Compost collection verification is locked after five failed attempts.")
    return False


def _ensure_compost_otp(job: dict[str, Any]) -> None:
    if not job.get("compost_otp"):
        job["compost_otp"] = f"{secrets.randbelow(1_000_000):06d}"
        job["compost_otp_attempts"] = 0


def _record_tool_call(
    job: dict[str, Any],
    name: str,
    inputs: dict[str, Any],
    rationale: str,
    *,
    force_compost: bool = False,
) -> dict[str, Any] | None:
    definition = TOOL_REGISTRY[name]
    context = {
        "event": get_food_event(job.get("event_id", "")) or {},
        "analysis": {"observations": job.get("observations", []), "unmatched": job.get("unmatched", [])},
    }
    remaining_minutes = _remaining_seconds(job) / 60
    try:
        policy_gate(
            name,
            {**inputs, **({"forced": True} if force_compost else {})},
            untouched_confirmed=job.get("untouched_confirmed") is True,
            confirmed_items=job.get("approved_items", []),
            remaining_minutes=remaining_minutes,
        )
    except PolicyBlocked as exc:
        _append_job_event(job, "POLICY_BLOCK", "agent", False, {
            "name": name,
            "inputs": inputs,
            "reason": str(exc),
            "rationale": "Deterministic safety policy denied this action.",
        })
        return None

    started = datetime.now(timezone.utc)
    try:
        output = execute_tool(name, inputs, context)
        duration_ms = max(0, int((datetime.now(timezone.utc) - started).total_seconds() * 1000))
        _append_job_event(job, "TOOL_CALL", "agent", definition.simulated, {
            "name": name,
            "inputs": inputs,
            "outputs": output,
            "duration_ms": duration_ms,
            "simulated": definition.simulated,
            "rationale": rationale,
        })
        return output
    except Exception as exc:
        _append_job_event(job, "FALLBACK", "agent", False, {
            "name": name,
            "reason": str(exc),
            "rationale": "The registered tool failed; deterministic plan remains authoritative.",
        })
        return None


def _run_intake_tool_loop(job: dict[str, Any], event: dict[str, Any]) -> None:
    menu_names = [item["name"] for item in event.get("menu_items", [])]
    detected_names = list(job.get("approved_items", []))
    plan: list[tuple[str, dict[str, Any], str]] = [
        ("build_event_card", {"event_id": event["id"]}, "Load the selected event and its saved menu."),
        ("analyze_leftover_photo", {"menu_names": menu_names, "photo_name": (job.get("photos") or [{}])[-1].get("name", "")}, "Use the photo analysis constrained to this event menu."),
        ("compare_to_menu", {"menu_names": menu_names, "detected_names": detected_names}, "Reject detections outside the closed-set event menu."),
        ("get_weather", {"latitude": 25.2048, "longitude": 55.2708}, "Fetch ambient context; it cannot change the safety window."),
        ("compute_safe_window", {"minutes": 60, "policy": "demo-policy-v1"}, "Use fixed policy inputs for the countdown."),
        ("rank_recipients", {"recipient_names": ["Kitchens and charities", "Food Bank", "Compost"]}, "Rank allowed destinations for the current event."),
        ("estimate_eta", {"origin": [55.2708, 25.2048], "destination": [55.31, 25.22]}, "Estimate the route with straight-line fallback."),
    ]
    goal = "Place only confirmed untouched surplus safely before the deterministic safe window closes."
    for index, (name, inputs, rationale) in enumerate(plan):
        if index < 3:
            proposal, usage, failure = propose_tool_call(goal, name, inputs, job)
            job["agent_llm_calls"] = int(job.get("agent_llm_calls", 0)) + 1
            job["token_usage"]["calls"] += 1
            job["token_usage"]["prompt_tokens"] += usage["prompt_tokens"]
            job["token_usage"]["output_tokens"] += usage["output_tokens"]
            if failure:
                _append_job_event(job, "FALLBACK", "agent", False, {
                    "name": name,
                    "reason": failure,
                    "rationale": "LLM unavailable; executing the deterministic next step.",
                })
            elif proposal:
                proposed_inputs = proposal.get("args")
                if proposed_inputs == inputs:
                    inputs = proposed_inputs
                else:
                    _append_job_event(job, "POLICY_BLOCK", "agent", False, {
                        "name": name,
                        "inputs": proposed_inputs if isinstance(proposed_inputs, dict) else {},
                        "reason": "The proposed arguments changed deterministic event or photo context.",
                        "rationale": "Only validated event data and closed-set observations may be passed to tools.",
                    })
        _record_tool_call(job, name, inputs, rationale)

    offer_inputs = {
        "recipient": "Food Bank",
        "untouched_confirmed": job.get("untouched_confirmed") is True,
        "confirmed_items": detected_names,
        "remaining_minutes": _remaining_seconds(job) // 60,
    }
    _record_tool_call(job, "send_offer", offer_inputs, "Send an offer only after policy-approved intake.")


def _run_existing_rescue(
    job: dict[str, Any],
    food_bank_response: str,
    longer_life_response: str,
    remaining_safe_minutes: int | None = None,
) -> dict[str, Any]:
    request = RescueRunRequest(
        batch_id=job["batch_id"],
        venue_name=job["venue_name"],
        event_name=job["event_name"],
        food_summary=job["food_summary"],
        estimated_weight_kg=job["estimated_weight_kg"],
        untouched_confirmed=job["untouched_confirmed"],
        allergens_from_menu=job["allergens"],
        halal_status="verified_by_venue",
        remaining_safe_minutes=(
            max(0, _remaining_seconds(job) // 60)
            if remaining_safe_minutes is None
            else remaining_safe_minutes
        ),
        pickup_eta_minutes=20,
        safety_buffer_minutes=15,
        food_bank_response=food_bank_response,
        food_bank_decline_reason=job["food_bank_decline_reason"],
        cold_storage_response=longer_life_response,
        cold_storage_decline_reason=job["longer_life_decline_reason"],
        pickup_location=job["pickup_location"],
        food_bank_location="Simulated community partner",
        cold_storage_location="Simulated longer-life partner",
        collection_deadline=datetime.now(timezone.utc).isoformat(),
    )
    return run_rescue(request)


def _job_view(job: dict[str, Any]) -> dict[str, Any]:
    job = _normalize_job(job)
    if job.get("status") == "COMPOST_REQUESTED" and not job.get("compost_otp"):
        _ensure_compost_otp(job)
        save_job(job["batch_id"], job)
    remaining = _remaining_seconds(job)
    events = list_events(job["batch_id"])
    if remaining <= 900 and job["status"] in {"CONFIRMED", "OFFERING", "ACCEPTED", "PICKED_UP"} and not any(
        event["event_type"] == "ESCALATED" for event in events
    ):
        _record_tool_call(
            job,
            "escalate_to_human",
            {"reason": "The deterministic human-alert threshold was reached."},
            "The safety policy requires human oversight at the alert threshold.",
        )
        _append_job_event(job, "ESCALATED", "system", False, {"remaining_seconds": remaining})
        events = list_events(job["batch_id"])
    if remaining == 0 and job["status"] in {"OFFERING", "ACCEPTED", "PICKED_UP"} and not job["cancelled"]:
        job["cancelled"] = True
        _append_job_event(job, "WINDOW_EXPIRED", "system", False, {})
        if job["status"] in {"ACCEPTED", "PICKED_UP"}:
            revoke_demo_rescue(
                job["batch_id"],
                RescueRevokeRequest(reason="Safe window expired before recipient handover."),
            )
        else:
            _run_existing_rescue(job, "decline", "decline", remaining_safe_minutes=0)
        job["status"] = "COMPOST_REQUESTED"
        _ensure_compost_otp(job)
        job["current_tier"] = 3
        job["rungs"]["3"]["state"] = "active"
        job["rungs"]["1"]["state"] = "failed"
        job["rungs"]["2"]["state"] = "failed"
        job["clock_anchor"] = datetime.now(timezone.utc).isoformat()
        job["remaining_safe_seconds"] = 0
        _append_job_event(job, "COMPOST_REQUESTED", "agent", True, {"reason": "safe window expired"})
        _record_tool_call(
            job,
            "request_compost_booking",
            {"reason": "safe window expired", "weight_kg": job["estimated_weight_kg"]},
            "The safe window expired; request simulated composting.",
            force_compost=True,
        )
        save_job(job["batch_id"], job)
        events = list_events(job["batch_id"])
    event_envelopes = [_event_envelope(event, index + 1) for index, event in enumerate(events)]
    result = {
        **{
            key: value
            for key, value in job.items()
            if key not in {"delivery_pin", "pickup_code", "compost_otp"}
        },
        "remaining_safe_seconds": remaining,
        "events": event_envelopes,
        "audit": _audit_summary(job["batch_id"]),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
    return result


@app.get("/api/jobs/active")
def get_active_demo_job() -> dict[str, Any]:
    with _job_command_lock:
        return _job_view(_ensure_active_job())


@app.get("/api/jobs/{batch_id}")
def get_demo_job(batch_id: str) -> dict[str, Any]:
    with _job_command_lock:
        job = get_job(batch_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Demo job not found.")
        job = _normalize_job(job)
        return _job_view(job)


def _validate_job_actor(command: JobCommand) -> None:
    expected = {
        "JOB_RESET": "organiser",
        "CHEF_CONFIRMED": "chef",
        "OFFER_ACCEPTED": "recipient",
        "OFFER_DECLINED": "recipient",
        "PICKUP_CONFIRMED": "driver",
        "DELIVERY_CONFIRMED": "driver",
        "COMPOST_CONFIRMED": "composter",
        "HUMAN_TAKEOVER": "organiser",
        "DEMO_CLOCK_CHANGED": "organiser",
        "SCENARIO_SELECTED": "organiser",
    }
    if command.type in expected and command.actor != expected[command.type]:
        raise HTTPException(status_code=403, detail="This actor cannot submit that job command.")


@app.post("/api/jobs/{batch_id}/commands")
def post_job_command(batch_id: str, command: JobCommand) -> dict[str, Any]:
    with _job_command_lock:
        previous = get_command_result(command.idempotency_key)
        if previous is not None:
            if previous.get("batch_id") != batch_id:
                raise HTTPException(status_code=409, detail="Idempotency key was already used for another job.")
            response = previous["response"]
            current_job = get_job(response.get("batch_id", batch_id))
            return _job_view(current_job) if current_job is not None else response
        job = get_job(batch_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Demo job not found.")
        if command.type == "JOB_RESET":
            _append_job_event(job, "JOB_RESET", command.actor, False, {})
            job = _new_job_snapshot()
            save_job(job["batch_id"], job)
            _append_job_event(job, "JOB_CREATED", "system", False, {"status": "DRAFT"})
            result = _job_view(job)
            save_command_result(command.idempotency_key, batch_id, result)
            return result

        _validate_job_actor(command)
        payload = command.payload
        event_type = command.type
        if event_type == "SCENARIO_SELECTED":
            if job["status"] != "DRAFT":
                raise HTTPException(status_code=409, detail="Choose a scenario before confirming intake.")
            scenario = payload.get("scenario")
            plans = {
                "happy_path": ("accept", "accept"),
                "decline_then_recover": ("decline", "accept"),
                "nobody_accepts": ("decline", "decline"),
            }
            if scenario not in plans:
                raise HTTPException(status_code=422, detail="Unknown demo scenario.")
            job["scenario"] = scenario
            job["food_bank_response"], job["longer_life_response"] = plans[scenario]
            _append_job_event(job, event_type, command.actor, False, payload)
        elif event_type == "DEMO_CLOCK_CHANGED":
            speed = payload.get("speed")
            if speed not in {1, 60}:
                raise HTTPException(status_code=422, detail="Demo clock speed must be 1x or x60.")
            job["remaining_safe_seconds"] = _remaining_seconds(job)
            job["clock_speed"] = speed
            job["clock_anchor"] = datetime.now(timezone.utc).isoformat()
            _append_job_event(job, event_type, command.actor, False, {"speed": speed})
        elif event_type == "CHEF_CONFIRMED":
            if job["status"] != "DRAFT":
                raise HTTPException(status_code=409, detail="This job intake is already confirmed.")
            dishes = payload.get("dishes")
            if not isinstance(dishes, list) or not dishes or not all(isinstance(item, str) for item in dishes):
                raise HTTPException(status_code=422, detail="Select at least one menu item.")
            if job.get("event_id"):
                event = get_food_event(job["event_id"])
                if event is None:
                    raise HTTPException(status_code=409, detail="The selected event no longer exists.")
                menu_names = {item["name"] for item in event["menu_items"] if item.get("confirmed") is True}
                if not set(dishes).issubset(menu_names):
                    raise HTTPException(status_code=422, detail="Only confirmed items from the selected event menu can be included.")
                if not job.get("observations"):
                    raise HTTPException(status_code=409, detail="Analyze at least one leftover photo before confirming the rescue.")
                detected_items = {
                    item["menu_item"]
                    for item in job.get("observations", [])
                    if item.get("detected") is True
                }
                if not set(dishes).issubset(detected_items):
                    raise HTTPException(status_code=422, detail="A dish must be detected in the leftover photo before it can be included.")
                job.update({
                    "event_name": event["name"],
                    "venue_name": event["venue"],
                    "pickup_location": event["venue"],
                    "allergens": sorted({
                        allergen
                        for item in event["menu_items"]
                        if item["name"] in dishes
                        for allergen in item["allergens"]
                    }),
                    "halal_status": "declared by venue; unverified",
                })
            untouched = payload.get("untouched_confirmed") is True
            if job.get("event_id") and job.get("compost_only"):
                untouched = False
            if job.get("event_id"):
                job["approved_items"] = list(dishes) if untouched else []
            job["untouched_confirmed"] = untouched
            job["remaining_safe_seconds"] = 3600
            job["clock_anchor"] = datetime.now(timezone.utc).isoformat()
            confirmation = IntakeConfirmation(
                photo_name=payload.get("photo_name") or "demo-photo",
                selected_dishes=dishes,
                untouched_confirmed=untouched,
                estimated_weight_kg=float(payload.get("estimated_weight_kg", job["estimated_weight_kg"])),
                venue_name=job["venue_name"],
                pickup_location=job["pickup_location"],
            )
            confirm_demo_intake(batch_id, confirmation)
            job.update(
                {
                    "dishes": dishes,
                    "food_summary": ", ".join(dishes),
                    "photo_name": confirmation.photo_name,
                    "estimated_weight_kg": confirmation.estimated_weight_kg,
                    "untouched_confirmed": untouched,
                    "status": "CONFIRMED",
                }
            )
            _append_job_event(job, "ITEMS_PROPOSED", "agent", False, {"dishes": dishes})
            _append_job_event(job, event_type, command.actor, False, {"untouched_confirmed": untouched})
            _append_job_event(job, "WINDOW_COMPUTED", "agent", False, {"remaining_seconds": _remaining_seconds(job)})
            if job.get("event_id"):
                event = get_food_event(job["event_id"])
                if event is None:
                    raise HTTPException(status_code=409, detail="The selected event no longer exists.")
                _run_intake_tool_loop(job, event)
            policy = safety_gate(
                {
                    "batch_id": batch_id,
                    "untouched_confirmed": untouched and (
                        bool(job.get("approved_items")) if job.get("event_id") else True
                    ),
                    "remaining_safe_minutes": max(0, _remaining_seconds(job) // 60),
                    "pickup_eta_minutes": 20,
                    "safety_buffer_minutes": 15,
                }
            )
            if policy["safety_eligible"]:
                job["status"] = "OFFERING"
                job["current_tier"] = 1
                job["rungs"]["1"]["state"] = "offered"
                _append_job_event(job, "OFFER_SENT", "agent", True, {"recipient": "Food Bank / charity"})
            else:
                reason = policy["safety_reason"]
                for tier in ("1", "2"):
                    job["rungs"][tier]["state"] = "failed"
                    job["rungs"][tier]["attempts"].append(
                        {"recipient": "Human-consumption route", "state": "blocked", "reason": reason}
                    )
                _run_existing_rescue(job, "decline", "decline")
                job["status"] = "COMPOST_REQUESTED"
                _ensure_compost_otp(job)
                job["cancelled"] = True
                job["current_tier"] = 3
                job["rungs"]["3"]["state"] = "active"
                _record_tool_call(
                    job,
                    "request_compost_booking",
                    {"reason": reason, "weight_kg": job["estimated_weight_kg"]},
                    "Human-consumption routing was blocked by deterministic safety policy.",
                    force_compost=True,
                )
                _append_job_event(job, "COMPOST_REQUESTED", "agent", True, {"reason": "untouched status not confirmed"})
        elif event_type in {"OFFER_ACCEPTED", "OFFER_DECLINED"}:
            if job["status"] != "OFFERING" or job["current_tier"] not in {1, 2}:
                raise HTTPException(status_code=409, detail="No recipient offer is currently awaiting a response.")
            tier = str(job["current_tier"])
            recipient = "Food Bank / charity" if tier == "1" else "Longer-life partner"
            rung = job["rungs"][tier]
            if event_type == "OFFER_DECLINED":
                reason = str(payload.get("reason", "")).strip()
                if not reason:
                    raise HTTPException(status_code=422, detail="Choose a decline reason.")
                _record_tool_call(
                    job,
                    "replan",
                    {"reason": reason, "remaining_minutes": max(0, _remaining_seconds(job) // 60)},
                    "Re-evaluate the rescue ladder after the recipient declined.",
                )
                rung["state"] = "declined"
                rung["attempts"].append({"recipient": recipient, "state": "declined", "reason": reason})
                if tier == "1":
                    job["food_bank_decline_reason"] = reason
                    job["current_tier"] = 2
                    job["rungs"]["2"]["state"] = "offered"
                    _append_job_event(job, event_type, command.actor, True, {"recipient": recipient, "reason": reason})
                    _append_job_event(job, "REPLAN", "agent", False, {"recipient": "Longer-life partner"})
                    _record_tool_call(
                        job,
                        "send_offer",
                        {
                            "recipient": "Longer-life partner",
                            "untouched_confirmed": job.get("untouched_confirmed") is True,
                            "confirmed_items": job.get("approved_items", job.get("dishes", [])),
                            "remaining_minutes": max(0, _remaining_seconds(job) // 60),
                        },
                        "Send the next eligible simulated offer after replanning.",
                    )
                    _append_job_event(job, "OFFER_SENT", "agent", True, {"recipient": "Longer-life partner"})
                else:
                    job["longer_life_decline_reason"] = reason
                    _append_job_event(job, event_type, command.actor, True, {"recipient": recipient, "reason": reason})
                    _run_existing_rescue(job, "decline", "decline")
                    job["rungs"]["3"]["state"] = "active"
                    job["rungs"]["1"]["state"] = "declined"
                    job["current_tier"] = 3
                    job["status"] = "COMPOST_REQUESTED"
                    _ensure_compost_otp(job)
                    job["cancelled"] = True
                    _append_job_event(job, "REPLAN", "agent", False, {"recipient": "Composting"})
                    _record_tool_call(
                        job,
                        "request_compost_booking",
                        {"reason": "all recipients declined", "weight_kg": job["estimated_weight_kg"]},
                        "No eligible recipient accepted; request simulated composting.",
                        force_compost=True,
                    )
                    _append_job_event(job, "COMPOST_REQUESTED", "agent", True, {"reason": "all recipients declined"})
            else:
                if _remaining_seconds(job) // 60 < 35:
                    _run_existing_rescue(
                        job,
                        "decline",
                        "decline",
                        remaining_safe_minutes=max(0, _remaining_seconds(job) // 60),
                    )
                    rung["state"] = "failed"
                    job["rungs"]["3"]["state"] = "active"
                    job["current_tier"] = 3
                    job["status"] = "COMPOST_REQUESTED"
                    _ensure_compost_otp(job)
                    job["cancelled"] = True
                    _append_job_event(
                        job,
                        "REPLAN",
                        "agent",
                        False,
                        {"reason": "safe window no longer covers pickup ETA and buffer"},
                    )
                    _append_job_event(
                        job,
                        "COMPOST_REQUESTED",
                        "agent",
                        True,
                        {"reason": "safe window no longer covers pickup ETA and buffer"},
                    )
                    _record_tool_call(
                        job,
                        "request_compost_booking",
                        {"reason": "safe window no longer covers pickup ETA and buffer", "weight_kg": job["estimated_weight_kg"]},
                        "The safe window can no longer cover pickup and the safety buffer.",
                        force_compost=True,
                    )
                    result = None
                else:
                    result = None
                if tier == "1":
                    if result is None and job["status"] == "OFFERING":
                        job["food_bank_response"] = "accept"
                        result = _run_existing_rescue(job, "accept", "accept")
                else:
                    if result is None and job["status"] == "OFFERING":
                        job["longer_life_response"] = "accept"
                        result = _run_existing_rescue(job, "decline", "accept")
                if job["status"] == "OFFERING" and result is not None:
                    rung["state"] = "accepted"
                    rung["attempts"].append({"recipient": recipient, "state": "accepted"})
                    job["selected_recipient"] = result["selected_recipient"]
                    job["status"] = "ACCEPTED"
                    job["pickup_code"] = f"{secrets.randbelow(100_000_000):08d}"
                    job["delivery_pin"] = f"{secrets.randbelow(1_000_000):06d}"
                    job["pickup_code_attempts"] = 0
                    job["delivery_pin_attempts"] = 0
                    _record_tool_call(
                        job,
                        "generate_handover_codes",
                        {"batch_id": batch_id},
                        "Generate demo pickup and delivery credentials after recipient acceptance.",
                    )
                    _append_job_event(job, event_type, command.actor, True, {"recipient": recipient})
        elif event_type == "PICKUP_CONFIRMED":
            if job["status"] != "ACCEPTED":
                raise HTTPException(status_code=409, detail="A recipient must accept before pickup.")
            temperature = payload.get("temperature_c")
            if not isinstance(temperature, (int, float)):
                raise HTTPException(status_code=422, detail="Enter the recorded handover temperature.")
            _record_custody_action(batch_id, CustodyAction(
                action="pickup",
                temperature_c=float(temperature),
                pickup_code=str(payload.get("pickup_code", "")),
            ))
            _record_tool_call(
                job,
                "record_handover",
                {"stage": "pickup", "temperature_c": float(temperature)},
                "Record the driver's manually entered pickup temperature.",
            )
            job["pickup_temperature_c"] = float(temperature)
            job["status"] = "PICKED_UP"
            _append_job_event(job, event_type, command.actor, False, {"temperature_c": float(temperature)})
        elif event_type == "DELIVERY_CONFIRMED":
            if job["status"] != "PICKED_UP":
                raise HTTPException(status_code=409, detail="Record pickup before delivery.")
            _record_custody_action(
                batch_id,
                CustodyAction(action="handover", handover_pin=str(payload.get("pin", ""))),
            )
            _record_tool_call(
                job,
                "record_handover",
                {"stage": "delivery", "temperature_c": float(job.get("pickup_temperature_c") or 0)},
                "Record the final PIN-verified delivery handover.",
            )
            job["status"] = "SEALED"
            if job["current_tier"] in {1, 2}:
                job["rungs"][str(job["current_tier"])]["state"] = "done"
            job["current_tier"] = 0
            _append_job_event(job, event_type, command.actor, False, {})
            _record_tool_call(job, "seal_audit_record", {"batch_id": batch_id}, "Seal the completed rescue event chain.")
            _record_tool_call(
                job,
                "calculate_impact",
                {"weight_kg": job["estimated_weight_kg"], "co2e_factor": 1.6},
                "Calculate labelled meal and CO2e estimates for the audit record.",
            )
            _append_job_event(job, "AUDIT_SEALED", "system", False, {"hash_chain_verified": True})
        elif event_type == "COMPOST_CONFIRMED":
            if job["status"] != "COMPOST_REQUESTED":
                raise HTTPException(status_code=409, detail="There is no compost request to confirm.")
            if not _verify_compost_otp(job, str(payload.get("verification_code", ""))):
                raise HTTPException(status_code=422, detail="The compost collection code did not match.")
            job["status"] = "SEALED"
            job["rungs"]["3"]["state"] = "done"
            job["current_tier"] = 0
            _append_job_event(job, event_type, command.actor, True, {"verification_code_verified": True})
            _record_tool_call(job, "seal_audit_record", {"batch_id": batch_id}, "Seal the compost outcome in the audit record.")
            _record_tool_call(
                job,
                "calculate_impact",
                {"weight_kg": job["estimated_weight_kg"], "co2e_factor": 1.6},
                "Calculate labelled impact estimates for the compost outcome.",
            )
            _append_job_event(job, "AUDIT_SEALED", "system", False, {"hash_chain_verified": True})
        elif event_type == "HUMAN_TAKEOVER":
            if job["status"] in {"SEALED", "COMPOST_REQUESTED"}:
                raise HTTPException(status_code=409, detail="This job is already complete or in fallback.")
            if not any(event["event_type"] == "ESCALATED" for event in list_events(batch_id)):
                raise HTTPException(status_code=409, detail="Human takeover is available after escalation.")
            job["human_takeover"] = True
            job["cancelled"] = True
            job["status"] = "HUMAN_TAKEOVER"
            job["current_tier"] = 4
            job["rungs"]["4"]["state"] = "active"
            record_organiser_takeover(
                batch_id,
                OrganiserTakeover(reason=str(payload.get("reason", "Organiser takeover"))),
            )
            _append_job_event(job, event_type, command.actor, False, {"reason": payload.get("reason", "Organiser takeover")})
        else:
            raise HTTPException(status_code=422, detail="Unsupported job command.")

        save_job(batch_id, job)
        result = _job_view(job)
        save_command_result(command.idempotency_key, batch_id, result)
        return result


@app.get("/api/jobs/{batch_id}/stream")
async def stream_demo_job(batch_id: str, request: Request) -> StreamingResponse:
    if get_job(batch_id) is None:
        raise HTTPException(status_code=404, detail="Demo job not found.")

    async def events():
        try:
            last_event_id = int(request.headers.get("last-event-id", "0") or 0)
        except ValueError:
            last_event_id = 0
        with _job_command_lock:
            current_job = get_job(batch_id)
            active_job = get_active_job()
            if active_job is not None and active_job["batch_id"] != batch_id:
                snapshot = _job_view(active_job)
            else:
                snapshot = None
        if snapshot is not None:
            yield f"id: {last_event_id}\ndata: {json.dumps({'snapshot': snapshot})}\n\n"
            return
        with _job_command_lock:
            initial = _job_view(current_job or {})
        initial_events = initial.get("events", [])
        if last_event_id:
            pending = [event for event in initial_events if event["seq"] > last_event_id]
        else:
            pending = []
        if pending:
            for event in pending:
                data = {"snapshot": initial, "event": event}
                yield f"id: {event['seq']}\ndata: {json.dumps(data)}\n\n"
                last_event_id = event["seq"]
        else:
            last_event_id = initial_events[-1]["seq"] if initial_events else 0
            yield f"id: {last_event_id}\ndata: {json.dumps({'snapshot': initial})}\n\n"
        while not await request.is_disconnected():
            await asyncio.sleep(0.35)
            with _job_command_lock:
                current_job = get_job(batch_id)
                active_job = get_active_job()
                if current_job is None:
                    break
                if active_job is not None and active_job["batch_id"] != batch_id:
                    snapshot = _job_view(active_job)
                    new_active = True
                else:
                    snapshot = _job_view(current_job)
                    new_active = False
            if new_active:
                yield f"id: {last_event_id}\ndata: {json.dumps({'snapshot': snapshot})}\n\n"
                break
            new_events = [event for event in snapshot["events"] if event["seq"] > last_event_id]
            for event in new_events:
                data = {"snapshot": snapshot, "event": event}
                yield f"id: {event['seq']}\ndata: {json.dumps(data)}\n\n"
                last_event_id = event["seq"]

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/services")
def get_services() -> list[dict[str, str]]:
    return SERVICE_DETAILS


@app.get("/api/services/{service_id}/requests")
def get_service_requests(service_id: str) -> list[dict[str, Any]]:
    if service_id not in SERVICE_MODELS:
        raise HTTPException(status_code=404, detail="Unknown simulated service.")
    return list_records(service_id)


@app.post("/api/services/{service_id}/requests", status_code=201)
def post_service_request(service_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    model = SERVICE_MODELS.get(service_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Unknown simulated service.")
    try:
        validated = model.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    return create_portal_request(service_id, validated.model_dump())


@app.post("/api/demo/rescue")
def post_demo_rescue(request: RescueRunRequest) -> dict[str, Any]:
    existing_events = list_events(request.batch_id)
    if any(
        event["event_type"] in {
            "RESCUE_PLAN_COMPLETE",
            "SAFE_DISPOSAL_FALLBACK",
            "RESCUE_REVOKED",
            "HANDOVER_CONFIRMED",
        }
        for event in existing_events
    ):
        raise HTTPException(status_code=409, detail="A rescue outcome is already recorded for this batch.")
    return run_rescue(request)


def _ensure_not_handed_over(batch_id: str) -> list[dict[str, Any]]:
    events = list_events(batch_id)
    if any(event["event_type"] == "HANDOVER_CONFIRMED" for event in events):
        raise HTTPException(status_code=409, detail="Handover is final; this batch is locked.")
    return events


@app.post("/api/demo/intake/{batch_id}")
def confirm_demo_intake(batch_id: str, request: IntakeConfirmation) -> dict[str, Any]:
    events = _ensure_not_handed_over(batch_id)
    existing_intake = next(
        (event for event in events if event["event_type"] == "CHEF_INTAKE_CONFIRMED"),
        None,
    )
    expected_metadata = {
        "photo_name": request.photo_name,
        "selected_dishes": request.selected_dishes,
        "untouched_confirmed": request.untouched_confirmed,
        "estimated_weight_kg": request.estimated_weight_kg,
        "venue_name": request.venue_name,
        "pickup_location": request.pickup_location,
        "venue_name": request.venue_name,
        "pickup_location": request.pickup_location,
    }
    if existing_intake:
        if existing_intake["metadata"] == expected_metadata:
            return existing_intake
        raise HTTPException(
            status_code=409,
            detail="This batch already has a different intake confirmation. Start a new batch.",
        )
    return add_event(
        batch_id,
        "CHEF_INTAKE_CONFIRMED",
        "HUMAN_CONFIRMED" if request.untouched_confirmed else "HUMAN_REJECTED",
        (
            "Chef confirmed the photo, menu selection, and unserved status."
            if request.untouched_confirmed
            else "Chef completed intake but did not confirm unserved status."
        ),
        {
            **expected_metadata,
        },
    )


def _record_custody_action(batch_id: str, request: CustodyAction) -> dict[str, Any]:
    events = _ensure_not_handed_over(batch_id)
    if request.action == "pickup":
        if any(event["event_type"] == "RESCUE_REVOKED" for event in events):
            raise HTTPException(status_code=409, detail="This rescue was revoked; driver pickup is blocked.")
        if not any(event["event_type"] == "RESCUE_PLAN_COMPLETE" for event in events):
            raise HTTPException(status_code=409, detail="A simulated dispatch must exist before pickup.")
        if any(event["event_type"] == "DRIVER_PICKUP_CONFIRMED" for event in events):
            raise HTTPException(status_code=409, detail="Pickup has already been recorded.")
        if request.temperature_c is None:
            raise HTTPException(status_code=422, detail="Enter the measured handover temperature.")
        job = get_job(batch_id)
        if job is None or not job.get("pickup_code"):
            raise HTTPException(status_code=409, detail="A recipient pickup code has not been generated.")
        attempts = int(job.get("pickup_code_attempts", 0))
        if attempts >= 5:
            raise HTTPException(status_code=429, detail="Pickup code entry is locked after five failed attempts.")
        if not secrets.compare_digest(request.pickup_code, str(job["pickup_code"])):
            job["pickup_code_attempts"] = attempts + 1
            save_job(batch_id, job)
            add_event(
                batch_id,
                "PICKUP_CODE_REJECTED",
                "REJECTED",
                "An incorrect pickup code was entered; access is monitored and rate-limited.",
                {"attempt": attempts + 1},
            )
            if attempts + 1 >= 5:
                raise HTTPException(status_code=429, detail="Pickup code entry is locked after five failed attempts.")
            raise HTTPException(status_code=422, detail="The recipient pickup code did not match.")
        return add_event(
            batch_id,
            "DRIVER_PICKUP_CONFIRMED",
            "HUMAN_RECORDED",
            "Driver simulated QR pickup and recorded the handover temperature.",
            {"temperature_c": request.temperature_c, "unit": "C"},
        )

    if not any(event["event_type"] == "DRIVER_PICKUP_CONFIRMED" for event in events):
        raise HTTPException(status_code=409, detail="Record pickup before recipient handover.")
    if any(event["event_type"] == "RESCUE_REVOKED" for event in events):
        raise HTTPException(status_code=409, detail="This rescue was revoked; recipient handover is blocked.")
    job = get_job(batch_id)
    if job is None or not job.get("delivery_pin"):
        raise HTTPException(status_code=409, detail="A recipient handover PIN has not been generated.")
    attempts = int(job.get("delivery_pin_attempts", 0))
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="PIN entry is locked after five failed attempts.")
    if not secrets.compare_digest(request.handover_pin, str(job["delivery_pin"])):
        job["delivery_pin_attempts"] = attempts + 1
        save_job(batch_id, job)
        add_event(
            batch_id,
            "DELIVERY_PIN_REJECTED",
            "REJECTED",
            "An incorrect delivery PIN was entered; access is monitored and rate-limited.",
            {"attempt": attempts + 1},
        )
        if attempts + 1 >= 5:
            raise HTTPException(status_code=429, detail="PIN entry is locked after five failed attempts.")
        raise HTTPException(status_code=422, detail="The simulated recipient PIN did not match.")
    return add_event(
        batch_id,
        "HANDOVER_CONFIRMED",
        "FINAL_LOCK",
        "Recipient PIN confirmed; simulated physical handover is final.",
        {"pin_verified": True},
    )


@app.post("/api/demo/custody/{batch_id}")
def record_custody_action(batch_id: str, request: CustodyAction) -> dict[str, Any]:
    return _record_custody_action(batch_id, request)


@app.post("/api/demo/revoke/{batch_id}")
def revoke_demo_rescue(batch_id: str, request: RescueRevokeRequest) -> dict[str, Any]:
    events = _ensure_not_handed_over(batch_id)
    if any(
        event["event_type"] in {"RESCUE_REVOKED", "SAFE_DISPOSAL_FALLBACK"}
        for event in events
    ):
        raise HTTPException(status_code=409, detail="This batch is already routed to fallback.")
    if not any(event["event_type"] == "CHEF_INTAKE_CONFIRMED" for event in events):
        raise HTTPException(status_code=409, detail="Confirm chef intake before revoking a rescue.")
    intake = next(
        event for event in events if event["event_type"] == "CHEF_INTAKE_CONFIRMED"
    )
    metadata = intake["metadata"]
    revoke_event = add_event(
        batch_id,
        "RESCUE_REVOKED",
        "HUMAN_REVOKED",
        "Human operator revoked the rescue authorization before final handover.",
        {"reason": request.reason},
    )
    record = book_reloop_fallback(
        batch_id=batch_id,
        venue_name=metadata["venue_name"],
        weight_kg=float(metadata["estimated_weight_kg"]),
        reason=request.reason,
        pickup_location=metadata["pickup_location"],
        deadline=utc_now(),
    )
    return {
        "batch_id": batch_id,
        "outcome": "safe-disposal-fallback",
        "selected_recipient": "reloop",
        "safety_eligible": False,
        "safety_reason": f"Rescue revoked by a human: {request.reason}",
        "record_id": record["id"],
        "mode": "SIMULATED",
        "revoke_event_id": revoke_event["id"],
    }


@app.post("/api/demo/organiser/{batch_id}/takeover")
def record_organiser_takeover(batch_id: str, request: OrganiserTakeover) -> dict[str, Any]:
    _ensure_not_handed_over(batch_id)
    return add_event(
        batch_id,
        "ORGANISER_TAKEOVER",
        "HUMAN_TAKEOVER",
        "Hotel organiser took over the rescue plan.",
        {"reason": request.reason},
    )


def _audit_summary(batch_id: str) -> dict[str, Any]:
    events = list_events(batch_id)
    verified = verify_event_chain(events)

    matching_records = [
        record
        for record in list_all_records()
        if record["payload"].get("batch_id") == batch_id
    ]
    intake = next(
        (event for event in events if event["event_type"] == "CHEF_INTAKE_CONFIRMED"),
        None,
    )
    weight_kg = next(
        (
            float(record["payload"]["estimated_weight_kg"])
            for record in matching_records
            if record["payload"].get("estimated_weight_kg") is not None
        ),
        float(intake["metadata"]["estimated_weight_kg"]) if intake else 0.0,
    )
    return {
        "batch_id": batch_id,
        "mode": "SIMULATED",
        "events": events,
        "records": matching_records,
        "total_weight_kg": round(weight_kg, 2),
        "estimated_meals": round(weight_kg / 0.4, 1),
        "meal_estimate_assumption_kg": 0.4,
        "estimated_co2e_kg": round(weight_kg * 2.5, 2),
        "co2e_estimate_factor_kg_per_kg": 2.5,
        "estimate_notice": "Illustrative demo estimates only; factors are placeholders, not measured or sourced.",
        "intake": intake["metadata"] if intake else {},
        "hash_chain_verified": verified,
        "head_hash": events[-1]["event_hash"] if events else GENESIS_HASH,
    }


@app.get("/api/demo/audit/{batch_id}")
def get_demo_audit(batch_id: str) -> dict[str, Any]:
    return _audit_summary(batch_id)


def _pdf_escape(value: str) -> str:
    safe = value.encode("latin-1", errors="replace").decode("latin-1")
    return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _make_audit_pdf(summary: dict[str, Any]) -> bytes:
    lines = [
        "SurplusOps - Tamper-evident audit package",
        f"Batch: {summary['batch_id']} | Mode: SIMULATED",
        f"Food rescued: {summary['total_weight_kg']} kg (recorded estimate)",
        f"Meals: {summary['estimated_meals']} (estimate; 0.4 kg per meal assumption)",
        f"CO2e: {summary['estimated_co2e_kg']} kg (estimate; 2.5 kg/kg placeholder factor)",
        f"Hash chain verified: {summary['hash_chain_verified']}",
        f"Head hash: {summary['head_hash']}",
        "Estimates are illustrative placeholders, not measured or sourced results.",
        "No partner or government service was contacted.",
        "",
        "EVENT LOG",
    ]
    for event in summary["events"]:
        lines.append(
            f"{event['created_at']} | {event['event_type']} | {event['status']}"
        )
        lines.append(f"  {event['summary']}")
        lines.append(f"  sha256: {event['event_hash']}")
    wrapped_lines = [
        part
        for line in lines
        for part in (textwrap.wrap(line, width=100) or [""])
    ]
    page_lines = [
        wrapped_lines[index:index + 38]
        for index in range(0, len(wrapped_lines), 38)
    ] or [[]]
    font_id = 3 + len(page_lines) * 2
    page_ids = [3 + index * 2 for index in range(len(page_lines))]
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_lines)} >>".encode(),
    ]
    for index, lines_on_page in enumerate(page_lines):
        page_id = page_ids[index]
        content_id = page_id + 1
        commands = ["BT /F1 10 Tf 48 744 Td"]
        for line_index, line in enumerate(lines_on_page):
            if line_index:
                commands.append("0 -18 Td")
            commands.append(f"({_pdf_escape(line)}) Tj")
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1", errors="replace")
        objects.extend([
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode(),
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        ])
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    return bytes(pdf)


@app.get("/api/demo/audit/{batch_id}/pdf")
def get_demo_audit_pdf(batch_id: str) -> Response:
    pdf_bytes = _make_audit_pdf(_audit_summary(batch_id))
    safe_batch_id = re.sub(r"[^A-Za-z0-9_-]", "_", batch_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audit-{safe_batch_id}.pdf"'},
    )


@app.get("/api/demo/requests")
def get_demo_requests() -> list[dict[str, Any]]:
    return list_all_records()


@app.post("/api/demo/requests/ne-ma-style", status_code=201)
def post_nema_style_record(request: NemaStyleRecord) -> dict[str, Any]:
    payload = request.model_dump()
    record = create_record("ne-ma-style-report", payload, "SIMULATED_REPORT_RECORDED")
    add_event(
        request.batch_id,
        "NEMA_STYLE_REPORT_RECORDED",
        "SIMULATED_REPORT_RECORDED",
        "A ne’ma-style sustainability data record was added to the local demo log; it was not submitted externally.",
        {"record_id": record["id"], "organization": "ne’ma-style simulation"},
    )
    return record


@app.get("/api/demo/events/{batch_id}")
def get_demo_events(batch_id: str) -> list[dict[str, Any]]:
    return list_events(batch_id)
