from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    side_effects: bool
    simulated: bool
    requires_human: bool
    rationale: str


def _object_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


_string = {"type": "string"}
_number = {"type": "number"}
_bool = {"type": "boolean"}
_array = {"type": "array", "items": _string}

TOOL_REGISTRY: dict[str, ToolDefinition] = {
    definition.name: definition
    for definition in [
        ToolDefinition("parse_menu", _object_schema({"text": _string}), _object_schema({"items": {"type": "array", "items": _object_schema({"name": _string, "category": _string, "allergens": _array, "halal": _string})}}), False, False, False, "Extract menu drafts; a person must confirm dietary declarations."),
        ToolDefinition("build_event_card", _object_schema({"event_id": _string}), _object_schema({"event_id": _string, "menu_count": {"type": "integer"}}), False, False, False, "Attach confirmed event context to the rescue job."),
        ToolDefinition("analyze_leftover_photo", _object_schema({"menu_names": _array, "photo_name": _string}), _object_schema({"observations": {"type": "array"}, "unmatched": _array}), False, False, False, "Match photo observations against only this event's menu."),
        ToolDefinition("compare_to_menu", _object_schema({"menu_names": _array, "detected_names": _array}), _object_schema({"matched": _array, "unmatched": _array, "not_seen": _array}), False, False, False, "Apply closed-set menu matching."),
        ToolDefinition("get_weather", _object_schema({"latitude": _number, "longitude": _number}), _object_schema({
            "available": _bool,
            "temperature_c": _number,
            "apparent_temperature_c": _number,
            "relative_humidity_percent": {"type": "integer"},
            "precipitation_mm": _number,
            "wind_speed_kmh": _number,
            "conditions": _string,
            "checked_at": _string,
            "source": _string,
            "message": _string,
        }), False, False, False, "Fetch live ambient conditions; never changes the policy window."),
        ToolDefinition("compute_safe_window", _object_schema({"minutes": _number, "policy": _string}), _object_schema({"remaining_minutes": _number, "source": _string}), False, False, False, "Compute time using deterministic policy constants."),
        ToolDefinition("rank_recipients", _object_schema({"recipient_names": _array}), _object_schema({"ranked": _array}), False, True, False, "Rank eligible simulated destinations."),
        ToolDefinition("estimate_eta", _object_schema({"origin": _array, "destination": _array}), _object_schema({"minutes": _number, "method": _string}), False, False, False, "Estimate route time with a straight-line fallback."),
        ToolDefinition("send_offer", _object_schema({"recipient": _string, "untouched_confirmed": _bool, "confirmed_items": _array, "remaining_minutes": _number}), _object_schema({"status": _string}), True, True, True, "Send a simulated offer; recipient decision is a human portal action."),
        ToolDefinition("replan", _object_schema({"reason": _string, "remaining_minutes": _number}), _object_schema({"next_action": _string}), False, True, False, "Choose the next safe ladder destination deterministically."),
        ToolDefinition("generate_handover_codes", _object_schema({"batch_id": _string}), _object_schema({"codes_generated": _bool}), True, True, True, "Create demo-only custody codes."),
        ToolDefinition("record_handover", _object_schema({"stage": _string, "temperature_c": _number}), _object_schema({"recorded": _bool}), True, True, True, "Record an explicitly entered custody measurement."),
        ToolDefinition("escalate_to_human", _object_schema({"reason": _string}), _object_schema({"notified": _bool}), True, True, True, "Notify a human when policy requires intervention."),
        ToolDefinition("request_compost_booking", _object_schema({"reason": _string, "weight_kg": _number}), _object_schema({"request_id": _string}), True, True, False, "Create a simulated compost request."),
        ToolDefinition("submit_food_bank_request", _object_schema({"items": _array, "untouched_confirmed": _bool}), _object_schema({"request_id": _string}), True, True, True, "Create a simulated Food Bank request."),
        ToolDefinition("seal_audit_record", _object_schema({"batch_id": _string}), _object_schema({"sealed": _bool}), True, True, False, "Seal the append-only audit outcome."),
        ToolDefinition("calculate_impact", _object_schema({"weight_kg": _number, "co2e_factor": _number}), _object_schema({"meals_estimate": _number, "co2e_estimate": _number}), False, False, False, "Calculate labelled estimates using stated factors."),
    ]
}


class PolicyBlocked(ValueError):
    pass


def policy_gate(
    name: str,
    inputs: dict[str, Any],
    *,
    untouched_confirmed: bool,
    confirmed_items: list[str],
    remaining_minutes: float,
) -> None:
    if name in {"send_offer", "submit_food_bank_request"}:
        proposed_items = inputs.get("confirmed_items", inputs.get("items", []))
        if not untouched_confirmed:
            raise PolicyBlocked("Untouched status was not confirmed.")
        if not proposed_items or any(item not in confirmed_items for item in proposed_items):
            raise PolicyBlocked("Offer includes an item that is not confirmed on this event menu.")
        pickup_eta = float(inputs.get("pickup_eta_minutes", 20))
        safety_buffer = float(inputs.get("safety_buffer_minutes", 15))
        if remaining_minutes <= 0 or inputs.get("remaining_minutes", remaining_minutes) <= 0:
            raise PolicyBlocked("The safe window has expired.")
        if pickup_eta + safety_buffer > remaining_minutes:
            raise PolicyBlocked("The safe window cannot cover pickup ETA and safety buffer.")
    if name == "request_compost_booking" and remaining_minutes > 0 and not inputs.get("forced", False):
        raise PolicyBlocked("Compost is only selected after a deterministic fallback condition.")
    if name == "compute_safe_window" and "minutes" in inputs:
        if inputs["minutes"] < 0:
            raise PolicyBlocked("Safety window cannot be negative.")
    if name == "submit_food_bank_request" and inputs.get("channel") == "b2c":
        raise PolicyBlocked("Cooked surplus cannot be routed to a B2C channel.")


def _fallback_menu(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in text.splitlines():
        name = re.sub(r"^[\s\d.*\-•]+", "", line).strip()
        name = re.sub(r"\s+(?:[-–—]\s*)?(?:contains|allergens?:|halal:).*$", "", name, flags=re.IGNORECASE).strip()
        if len(name) < 3 or len(name) > 160 or name.lower() in {"menu", "ingredients"}:
            continue
        if not re.search(r"[A-Za-z]", name):
            continue
        lower = line.lower()
        allergens = [allergen for allergen in ("dairy", "milk", "nuts", "peanuts", "gluten", "wheat", "soy", "egg", "sesame", "shellfish") if allergen in lower]
        halal = "yes" if "halal" in lower and re.search(r"halal\s*[:=]\s*(?:yes|verified)", lower) else "unknown"
        items.append({"name": name, "category": "other", "allergens": allergens, "halal": halal})
    return items[:300]


_MODEL = os.getenv("SURPLUSOPS_GEMINI_MODEL", "gemini-2.5-flash")
_API_KEY = os.getenv("GEMINI_API_KEY", "")
_llm_cache: dict[str, dict[str, Any]] = {}
_tool_proposal_cache: dict[str, dict[str, Any]] = {}


def _gemini_json(prompt: str, inline_data: dict[str, str] | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    if not _API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    key_material = json.dumps({"model": _MODEL, "prompt": prompt, "inline_data": inline_data}, sort_keys=True)
    cache_key = hashlib.sha256(key_material.encode()).hexdigest()
    if cache_key in _llm_cache:
        return _llm_cache[cache_key], {"prompt_tokens": 0, "output_tokens": 0, "cache_hit": 1}
    parts: list[dict[str, Any]] = [{"text": prompt}]
    if inline_data:
        parts.append({"inlineData": {"mimeType": inline_data["mime_type"], "data": inline_data["data"]}})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(_MODEL)}:generateContent?key={urllib.parse.quote(_API_KEY)}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        result = json.loads(response.read())
    response_text = "".join(
        part.get("text", "")
        for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    )
    parsed = json.loads(response_text)
    usage = result.get("usageMetadata", {})
    token_usage = {
        "prompt_tokens": int(usage.get("promptTokenCount", 0)),
        "output_tokens": int(usage.get("candidatesTokenCount", 0)),
        "cache_hit": 0,
    }
    _llm_cache[cache_key] = parsed
    return parsed, token_usage


def propose_tool_call(
    goal: str,
    expected_tool: str,
    inputs: dict[str, Any],
    job: dict[str, Any],
    max_calls: int = 3,
) -> tuple[dict[str, Any] | None, dict[str, int], str | None]:
    used = int(job.get("agent_llm_calls", 0))
    if used >= max_calls:
        return None, {"prompt_tokens": 0, "output_tokens": 0}, "Per-job tool-planning LLM budget reached."
    cache_key = hashlib.sha256(json.dumps({
        "model": _MODEL,
        "goal": goal,
        "tool": expected_tool,
        "inputs": inputs,
    }, sort_keys=True).encode()).hexdigest()
    cached = _tool_proposal_cache.get(cache_key)
    if cached is not None:
        return {"name": expected_tool, "args": dict(cached["args"])}, {
            "prompt_tokens": 0,
            "output_tokens": 0,
        }, None
    try:
        if not _API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        definition = TOOL_REGISTRY[expected_tool]
        body = {
            "contents": [{
                "role": "user",
                "parts": [{"text": (
                    f"Goal: {goal}. Propose the next tool call, using only the listed tool. "
                    f"Use the provided context and do not invent safety thresholds. Tool inputs: {json.dumps(inputs)}"
                )}],
            }],
            "tools": [{"functionDeclarations": [{
                "name": definition.name,
                "description": definition.rationale,
                "parameters": definition.input_schema,
            }]}],
            "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
        }
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(_MODEL)}:generateContent?key={urllib.parse.quote(_API_KEY)}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=6) as response:
            result = json.loads(response.read())
        parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        call = next((part["functionCall"] for part in parts if "functionCall" in part), None)
        if not call or call.get("name") != expected_tool:
            raise ValueError("The model did not return the expected registered tool call.")
        usage = result.get("usageMetadata", {})
        _tool_proposal_cache[cache_key] = call
        return call, {
            "prompt_tokens": int(usage.get("promptTokenCount", 0)),
            "output_tokens": int(usage.get("candidatesTokenCount", 0)),
        }, None
    except Exception as exc:
        return None, {"prompt_tokens": 0, "output_tokens": 0}, str(exc)


def parse_menu(text: str, filename: str = "pasted-menu.txt", content_type: str = "text/plain", file_base64: str = "") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    prompt = (
        "Extract menu dishes as JSON {items:[{name,category,allergens,halal}]} only. "
        "Allergens and halal are venue-declared draft data, never verified. Use halal unknown unless stated. "
        f"Filename: {filename}. Menu text:\n{text}"
    )
    try:
        inline = {"mime_type": content_type, "data": file_base64} if file_base64 and content_type in {"application/pdf", "image/png", "image/jpeg", "image/webp"} else None
        extracted, usage = _gemini_json(prompt, inline)
        items = extracted.get("items", [])
        if not isinstance(items, list):
            raise ValueError("The model returned an invalid menu structure.")
        return items[:300], {"provider": _MODEL, "fallback": False, "token_usage": usage}
    except Exception as exc:
        if text.strip():
            return _fallback_menu(text), {"provider": "deterministic-fallback", "fallback": True, "reason": str(exc), "token_usage": {"prompt_tokens": 0, "output_tokens": 0, "cache_hit": 0}}
        return [], {"provider": "deterministic-fallback", "fallback": True, "reason": "Add pasted menu text when model extraction is unavailable.", "token_usage": {"prompt_tokens": 0, "output_tokens": 0, "cache_hit": 0}}


def analyze_photo(
    menu_items: list[dict[str, Any]],
    photo_name: str,
    photo_base64: str = "",
    content_type: str = "image/jpeg",
    voice_note: str = "",
) -> tuple[dict[str, Any], dict[str, Any]]:
    names = [str(item.get("name", "")) for item in menu_items]
    prompt = (
        "Analyze leftover food in this photo against ONLY the supplied menu. Never invent dishes outside the menu. "
        "Return JSON {observations:[{menu_item,detected,tray_count_min,tray_count_max,confidence,notes}],unmatched:[],menu_items_not_seen:[]}. "
        "Counts are visual estimates, not safety decisions. A voice note is optional context, not proof of identity or safety. "
        f"Voice note: {voice_note[:500]}. Menu: " + json.dumps(names)
    )
    try:
        result, usage = _gemini_json(prompt, {"mime_type": content_type, "data": photo_base64} if photo_base64 else None)
        return result, {"provider": _MODEL, "fallback": False, "token_usage": usage}
    except Exception as exc:
        observations = [
            {
                "menu_item": name,
                "detected": True,
                "tray_count_min": 1,
                "tray_count_max": 1,
                "confidence": 0.35,
                "notes": f"Demo proposal from {photo_name}; kitchen confirmation required.",
            }
            for name in names[:2]
        ]
        return {
            "observations": observations,
            "unmatched": [],
            "menu_items_not_seen": names[2:],
        }, {
            "provider": "deterministic-fallback",
            "fallback": True,
            "reason": str(exc),
            "token_usage": {"prompt_tokens": 0, "output_tokens": 0, "cache_hit": 0},
        }


def _request_json(url: str, timeout: float = 1.5) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "SurplusOpsDemo/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def _weather_condition(code: int) -> str:
    if code == 0:
        return "Clear"
    if code in {1, 2, 3}:
        return {1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast"}[code]
    if code in {45, 48}:
        return "Fog"
    if 51 <= code <= 57:
        return "Drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "Rain"
    if 71 <= code <= 77 or code in {85, 86}:
        return "Snow"
    if code in {95, 96, 99}:
        return "Thunderstorm"
    return "Conditions unavailable"


def execute_tool(name: str, inputs: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    if name not in TOOL_REGISTRY:
        raise ValueError(f"Unknown tool: {name}")
    event = context.get("event", {})
    menu_items = event.get("menu_items", [])
    if name == "parse_menu":
        items, model_info = parse_menu(str(inputs.get("text", "")))
        return {"items": items, "model": model_info}
    if name == "build_event_card":
        return {"event_id": event.get("id", ""), "menu_count": len(menu_items)}
    if name == "analyze_leftover_photo":
        return context.get("analysis", {"observations": [], "unmatched": []})
    if name == "compare_to_menu":
        menu_names = inputs.get("menu_names", [])
        detected = inputs.get("detected_names", [])
        return {"matched": [name for name in detected if name in menu_names], "unmatched": [name for name in detected if name not in menu_names], "not_seen": [name for name in menu_names if name not in detected]}
    if name == "get_weather":
        lat, lon = inputs.get("latitude", 25.2048), inputs.get("longitude", 55.2708)
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
            "precipitation,weather_code,wind_speed_10m&timezone=auto"
        )
        try:
            current = _request_json(url, timeout=5.0)["current"]
            return {
                "available": True,
                "temperature_c": current["temperature_2m"],
                "apparent_temperature_c": current["apparent_temperature"],
                "relative_humidity_percent": current["relative_humidity_2m"],
                "precipitation_mm": current["precipitation"],
                "wind_speed_kmh": current["wind_speed_10m"],
                "conditions": _weather_condition(int(current["weather_code"])),
                "checked_at": current["time"],
                "source": "Open-Meteo live conditions",
                "message": "Weather is context only; deterministic food-safety rules set the safe window.",
            }
        except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
            return {
                "available": False,
                "source": "Open-Meteo",
                "message": "Live weather could not be reached. No weather value was assumed; deterministic safety rules remain in force.",
            }
    if name == "compute_safe_window":
        return {"remaining_minutes": max(0, float(inputs.get("minutes", 60))), "source": "deterministic policy"}
    if name == "rank_recipients":
        return {"ranked": inputs.get("recipient_names", ["Kitchens and charities", "Food Bank", "Compost"])}
    if name == "estimate_eta":
        origin = inputs.get("origin", [55.2708, 25.2048])
        destination = inputs.get("destination", [55.31, 25.22])
        try:
            route = _request_json(f"https://router.project-osrm.org/route/v1/driving/{origin[0]},{origin[1]};{destination[0]},{destination[1]}?overview=false")
            return {"minutes": route["routes"][0]["duration"] / 60, "method": "OSRM"}
        except (OSError, KeyError, IndexError, ValueError, urllib.error.URLError):
            return {"minutes": 20, "method": "straight-line estimate fallback"}
    if name == "send_offer":
        return {"status": "OFFERING", "recipient": inputs.get("recipient", "Food Bank"), "simulated": True}
    if name == "replan":
        return {"next_action": "request_compost_booking" if float(inputs.get("remaining_minutes", 1)) <= 0 else "offer_next_eligible_recipient"}
    if name == "generate_handover_codes":
        return {"codes_generated": True}
    if name == "record_handover":
        return {"recorded": True, "stage": inputs.get("stage", "")}
    if name == "escalate_to_human":
        return {"notified": True, "reason": inputs.get("reason", "")}
    if name in {"request_compost_booking", "submit_food_bank_request"}:
        return {"request_id": f"SIM-{hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()[:10]}"}
    if name == "seal_audit_record":
        return {"sealed": True, "batch_id": inputs.get("batch_id", "")}
    if name == "calculate_impact":
        weight = float(inputs.get("weight_kg", 0))
        return {"meals_estimate": round(weight / 0.4), "co2e_estimate": round(weight * float(inputs.get("co2e_factor", 2.5)), 2)}
    raise ValueError(f"No implementation registered for tool: {name}")
