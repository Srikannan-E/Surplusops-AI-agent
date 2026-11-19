from __future__ import annotations

from typing import Any, Literal

from app.domain.storage import add_event, create_record

RECIPIENT_STATUSES = {
    "accept": "SIMULATED_ACCEPTED",
    "decline": "SIMULATED_DECLINED",
}
RECIPIENT_PAST_TENSE = {
    "accept": "accepted",
    "decline": "declined",
}


def create_portal_request(service: str, payload: dict[str, Any]) -> dict[str, Any]:
    record = create_record(service, payload)
    add_event(
        batch_id=str(payload.get("batch_id", record["id"])),
        event_type=f"{service.upper()}_REQUEST_CREATED",
        status="SIMULATED",
        summary=f"Request submitted to the {service} simulation portal.",
        metadata={"record_id": record["id"]},
    )
    return record


def offer_to_food_bank(
    batch_id: str,
    venue_name: str,
    event_name: str,
    food_summary: str,
    weight_kg: float,
    untouched_confirmed: bool,
    allergens_from_menu: list[str],
    halal_status: Literal["venue_declared", "verified_by_venue", "unknown"],
    response: Literal["accept", "decline"],
    decline_reason: str,
    ready_at: str,
    pickup_location: str,
) -> dict[str, Any]:
    payload = {
        "batch_id": batch_id,
        "donor_venue": venue_name,
        "event_name": event_name,
        "food_summary": food_summary,
        "estimated_weight_kg": weight_kg,
        "untouched_confirmed": untouched_confirmed,
        "allergens_from_menu": allergens_from_menu,
        "halal_status": halal_status,
        "ready_at": ready_at,
        "pickup_location": pickup_location,
        "simulated_response": response,
        "decline_reason": decline_reason if response == "decline" else "",
    }
    status = RECIPIENT_STATUSES[response]
    record = create_record("uae-food-bank", payload, status)
    add_event(
        batch_id,
        "UAE_FOOD_BANK_OFFER",
        status,
        (
            f"UAE Food Bank simulation {RECIPIENT_PAST_TENSE[response]} the offer."
            if not decline_reason or response == "accept"
            else f"UAE Food Bank simulation declined the offer: {decline_reason}"
        ),
        {"record_id": record["id"], "response": response, "reason": decline_reason},
    )
    return record


def offer_to_charity(
    batch_id: str,
    food_summary: str,
    weight_kg: float,
    response: Literal["accept", "decline"],
    decline_reason: str,
    location: str,
    required_until: str,
) -> dict[str, Any]:
    payload = {
        "batch_id": batch_id,
        "item_summary": food_summary,
        "estimated_weight_kg": weight_kg,
        "charity_name": "Registered charity (simulated)",
        "pickup_location": location,
        "required_until": required_until,
        "simulated_response": response,
        "decline_reason": decline_reason if response == "decline" else "",
    }
    status = RECIPIENT_STATUSES[response]
    record = create_record("registered-charity", payload, status)
    add_event(
        batch_id,
        "REGISTERED_CHARITY_OFFER",
        status,
        (
            f"Registered charity simulation {RECIPIENT_PAST_TENSE[response]} the offer."
            if not decline_reason or response == "accept"
            else f"Registered charity simulation declined the offer: {decline_reason}"
        ),
        {"record_id": record["id"], "response": response, "reason": decline_reason},
    )
    return record


def dispatch_collecteroo(
    batch_id: str,
    pickup_location: str,
    dropoff_location: str,
    weight_kg: float,
    deadline: str,
) -> dict[str, Any]:
    payload = {
        "batch_id": batch_id,
        "pickup_location": pickup_location,
        "dropoff_location": dropoff_location,
        "package_count": 1,
        "estimated_weight_kg": weight_kg,
        "transport_type": "chilled",
        "pickup_deadline": deadline,
        "notes": "Simulated first-mile food-logistics request.",
    }
    record = create_record("collecteroo", payload, "SIMULATED_DISPATCH_CREATED")
    add_event(
        batch_id,
        "COLLECTEROO_DISPATCH",
        "SIMULATED_DISPATCH_CREATED",
        "Collecteroo logistics simulation created a dispatch request.",
        {"record_id": record["id"], "dropoff": dropoff_location},
    )
    return record


def book_reloop_fallback(
    batch_id: str,
    venue_name: str,
    weight_kg: float,
    reason: str,
    pickup_location: str,
    deadline: str,
) -> dict[str, Any]:
    payload = {
        "batch_id": batch_id,
        "venue_name": venue_name,
        "waste_stream": "food_organics",
        "estimated_weight_kg": weight_kg,
        "collection_date": deadline,
        "collection_window": "Next available (simulated)",
        "collection_point": pickup_location,
        "notes": f"Safe-disposal fallback reason: {reason}",
    }
    record = create_record("reloop", payload, "SIMULATED_FALLBACK_REQUESTED")
    add_event(
        batch_id,
        "SAFE_DISPOSAL_FALLBACK",
        "SIMULATED_FALLBACK_REQUESTED",
        "Reloop organic-waste fallback was requested in simulation.",
        {"record_id": record["id"], "reason": reason},
    )
    return record
