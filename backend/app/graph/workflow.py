from __future__ import annotations

from typing import Literal, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.domain.models import RescueRunRequest
from app.domain.storage import add_event
from app.integrations.simulated.adapters import (
    book_reloop_fallback,
    dispatch_collecteroo,
    offer_to_cold_storage,
    offer_to_food_bank,
)


class RescueState(TypedDict, total=False):
    batch_id: str
    venue_name: str
    event_name: str
    food_summary: str
    estimated_weight_kg: float
    untouched_confirmed: bool
    allergens_from_menu: list[str]
    halal_status: str
    remaining_safe_minutes: int
    pickup_eta_minutes: int
    safety_buffer_minutes: int
    food_bank_response: str
    food_bank_decline_reason: str
    cold_storage_response: str
    cold_storage_decline_reason: str
    pickup_location: str
    food_bank_location: str
    cold_storage_location: str
    collection_deadline: str
    safety_eligible: bool
    safety_reason: str
    selected_recipient: str
    outcome: str
    final_record_id: str


def safety_gate(state: RescueState) -> RescueState:
    batch_id = state["batch_id"]
    enough_time = (
        state["pickup_eta_minutes"] + state["safety_buffer_minutes"]
        <= state["remaining_safe_minutes"]
    )
    eligible = state["untouched_confirmed"] and enough_time
    if not state["untouched_confirmed"]:
        reason = "Untouched/unserved status was not confirmed."
    elif not enough_time:
        reason = "Estimated pickup ETA plus safety buffer exceeds remaining window."
    else:
        reason = "Required demo confirmations and transport margin are present."
    add_event(
        batch_id,
        "DETERMINISTIC_SAFETY_GATE",
        "POLICY_DERIVED_ELIGIBLE" if eligible else "POLICY_DERIVED_BLOCKED",
        reason,
        {
            "untouched_confirmed": state["untouched_confirmed"],
            "remaining_safe_minutes": state["remaining_safe_minutes"],
            "pickup_eta_minutes": state["pickup_eta_minutes"],
            "safety_buffer_minutes": state["safety_buffer_minutes"],
            "policy": "demo-policy-v1",
        },
    )
    return {
        "safety_eligible": eligible,
        "safety_reason": reason,
    }


def route_after_safety(state: RescueState) -> Literal["food_bank", "fallback"]:
    return "food_bank" if state["safety_eligible"] else "fallback"


def offer_food_bank(state: RescueState) -> RescueState:
    record = offer_to_food_bank(
        batch_id=state["batch_id"],
        venue_name=state["venue_name"],
        event_name=state["event_name"],
        food_summary=state["food_summary"],
        weight_kg=state["estimated_weight_kg"],
        untouched_confirmed=state["untouched_confirmed"],
        allergens_from_menu=state["allergens_from_menu"],
        halal_status=state["halal_status"],
        response=state["food_bank_response"],
        decline_reason=state["food_bank_decline_reason"],
        ready_at=state["collection_deadline"],
        pickup_location=state["pickup_location"],
    )
    return {
        "selected_recipient": "uae-food-bank",
        "outcome": f"food-bank-{state['food_bank_response']}",
        "final_record_id": record["id"],
    }


def route_after_food_bank(state: RescueState) -> Literal["dispatch", "cold_storage"]:
    return "dispatch" if state["food_bank_response"] == "accept" else "cold_storage"


def offer_cold_storage(state: RescueState) -> RescueState:
    record = offer_to_cold_storage(
        batch_id=state["batch_id"],
        food_summary=state["food_summary"],
        weight_kg=state["estimated_weight_kg"],
        response=state["cold_storage_response"],
        decline_reason=state["cold_storage_decline_reason"],
        location=state["cold_storage_location"],
        required_until=state["collection_deadline"],
    )
    return {
        "selected_recipient": "public-cold-storage",
        "outcome": f"cold-storage-{state['cold_storage_response']}",
        "final_record_id": record["id"],
    }


def route_after_cold_storage(state: RescueState) -> Literal["dispatch", "fallback"]:
    return "dispatch" if state["cold_storage_response"] == "accept" else "fallback"


def create_dispatch(state: RescueState) -> RescueState:
    if state["selected_recipient"] == "uae-food-bank":
        dropoff = state["food_bank_location"]
    else:
        dropoff = state["cold_storage_location"]
    record = dispatch_collecteroo(
        batch_id=state["batch_id"],
        pickup_location=state["pickup_location"],
        dropoff_location=dropoff,
        weight_kg=state["estimated_weight_kg"],
        deadline=state["collection_deadline"],
    )
    add_event(
        state["batch_id"],
        "RESCUE_PLAN_COMPLETE",
        "SIMULATED_DISPATCHED",
        f"Eligible batch routed to {state['selected_recipient']} through simulated logistics.",
        {"dispatch_id": record["id"], "recipient": state["selected_recipient"]},
    )
    return {"outcome": "dispatched", "final_record_id": record["id"]}


def fallback(state: RescueState) -> RescueState:
    fallback_reason = state.get("safety_reason", "All eligible recipients declined.")
    if state.get("safety_eligible") and state.get("food_bank_response") == "decline":
        fallback_reason = state.get("cold_storage_decline_reason") or "All eligible recipients declined."
    record = book_reloop_fallback(
        batch_id=state["batch_id"],
        venue_name=state["venue_name"],
        weight_kg=state["estimated_weight_kg"],
        reason=fallback_reason,
        pickup_location=state["pickup_location"],
        deadline=state["collection_deadline"],
    )
    return {
        "selected_recipient": "reloop",
        "outcome": "safe-disposal-fallback",
        "final_record_id": record["id"],
    }


def build_graph():
    graph = StateGraph(RescueState)
    graph.add_node("safety_gate", safety_gate)
    graph.add_node("offer_food_bank", offer_food_bank)
    graph.add_node("offer_cold_storage", offer_cold_storage)
    graph.add_node("dispatch", create_dispatch)
    graph.add_node("fallback", fallback)

    graph.add_edge(START, "safety_gate")
    graph.add_conditional_edges(
        "safety_gate",
        route_after_safety,
        {"food_bank": "offer_food_bank", "fallback": "fallback"},
    )
    graph.add_conditional_edges(
        "offer_food_bank",
        route_after_food_bank,
        {"dispatch": "dispatch", "cold_storage": "offer_cold_storage"},
    )
    graph.add_conditional_edges(
        "offer_cold_storage",
        route_after_cold_storage,
        {"dispatch": "dispatch", "fallback": "fallback"},
    )
    graph.add_edge("dispatch", END)
    graph.add_edge("fallback", END)
    return graph.compile(checkpointer=MemorySaver())


rescue_graph = build_graph()


def run_rescue(request: RescueRunRequest) -> dict:
    state: RescueState = request.model_dump()
    result = rescue_graph.invoke(
        state,
        config={"configurable": {"thread_id": request.batch_id}},
    )
    return {
        "batch_id": result["batch_id"],
        "outcome": result["outcome"],
        "selected_recipient": result["selected_recipient"],
        "safety_eligible": result["safety_eligible"],
        "safety_reason": result["safety_reason"],
        "record_id": result["final_record_id"],
        "mode": "SIMULATED",
    }
