from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RecipientResponse = Literal["accept", "decline"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EventMenuItem(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(default="other", max_length=80)
    allergens: list[str] = Field(default_factory=list, max_length=40)
    halal: Literal["yes", "no", "unknown"] = "unknown"
    diet_tags: list[str] = Field(default_factory=list, max_length=40)
    planned_qty: dict[str, Any] = Field(default_factory=dict)
    holding: Literal["hot", "chilled", "ambient"] = "ambient"
    serving: Literal["buffet", "plated", "packaged"] = "buffet"
    source: Literal["ai", "user"] = "ai"
    confirmed: bool = False


class FoodEvent(StrictModel):
    id: str = Field(min_length=4, max_length=100)
    name: str = Field(min_length=2, max_length=160)
    type: str = Field(min_length=2, max_length=80)
    venue: str = Field(min_length=2, max_length=160)
    start: str = Field(min_length=8, max_length=40)
    end: str = Field(min_length=8, max_length=40)
    guest_count: int = Field(ge=1, le=100000)
    contact: str = Field(min_length=2, max_length=200)
    status: Literal["planned", "active", "completed"] = "planned"
    menu_items: list[EventMenuItem] = Field(default_factory=list, max_length=300)


class MenuExtractRequest(StrictModel):
    text: str = Field(default="", max_length=50000)
    filename: str = Field(default="pasted-menu.txt", max_length=200)
    content_type: str = Field(default="text/plain", max_length=120)
    file_base64: str = Field(default="", max_length=12000000)


class EventAnalyzeRequest(StrictModel):
    photo_name: str = Field(min_length=1, max_length=200)
    photo_base64: str = Field(default="", max_length=12000000)
    voice_note: str = Field(default="", max_length=500)
    served_status: Literal["untouched", "some_served", "unknown"] = "unknown"


class ReloopRequest(StrictModel):
    venue_name: str = Field(min_length=2, max_length=120)
    waste_stream: Literal["food_organics", "packaging", "mixed_organics"]
    estimated_weight_kg: float = Field(gt=0, le=5000)
    collection_date: str = Field(min_length=8, max_length=32)
    collection_window: str = Field(min_length=2, max_length=80)
    collection_point: str = Field(min_length=2, max_length=200)
    notes: str = Field(default="", max_length=500)


class CollecterooRequest(StrictModel):
    batch_id: str = Field(min_length=2, max_length=80)
    pickup_location: str = Field(min_length=2, max_length=200)
    dropoff_location: str = Field(min_length=2, max_length=200)
    package_count: int = Field(gt=0, le=1000)
    estimated_weight_kg: float = Field(gt=0, le=5000)
    transport_type: Literal["ambient", "chilled", "refrigerated"]
    pickup_deadline: str = Field(min_length=8, max_length=32)
    notes: str = Field(default="", max_length=500)


class FoodBankRequest(StrictModel):
    batch_id: str = Field(min_length=2, max_length=80)
    donor_venue: str = Field(min_length=2, max_length=120)
    event_name: str = Field(min_length=2, max_length=160)
    food_summary: str = Field(min_length=2, max_length=500)
    estimated_weight_kg: float = Field(gt=0, le=5000)
    untouched_confirmed: bool
    ready_at: str = Field(min_length=8, max_length=32)
    allergens_from_menu: list[str] = Field(default_factory=list, max_length=30)
    halal_status: Literal["venue_declared", "verified_by_venue", "unknown"] = "unknown"
    simulated_response: RecipientResponse = "accept"


class ColdStorageRequest(StrictModel):
    batch_id: str = Field(min_length=2, max_length=80)
    item_summary: str = Field(min_length=2, max_length=500)
    estimated_weight_kg: float = Field(gt=0, le=5000)
    storage_type: Literal["chilled", "frozen", "ambient"]
    facility_name: str = Field(min_length=2, max_length=120)
    facility_location: str = Field(min_length=2, max_length=200)
    required_until: str = Field(min_length=8, max_length=32)
    simulated_response: RecipientResponse = "accept"


class RescueRunRequest(StrictModel):
    batch_id: str = Field(min_length=2, max_length=80)
    venue_name: str = Field(min_length=2, max_length=120)
    event_name: str = Field(min_length=2, max_length=160)
    food_summary: str = Field(min_length=2, max_length=500)
    estimated_weight_kg: float = Field(gt=0, le=5000)
    untouched_confirmed: bool
    allergens_from_menu: list[str] = Field(default_factory=list, max_length=30)
    halal_status: Literal["venue_declared", "verified_by_venue", "unknown"] = "unknown"
    remaining_safe_minutes: int = Field(ge=0, le=1440)
    pickup_eta_minutes: int = Field(ge=0, le=1440)
    safety_buffer_minutes: int = Field(ge=0, le=240, default=20)
    food_bank_response: RecipientResponse = "decline"
    food_bank_decline_reason: str = Field(default="", max_length=300)
    cold_storage_response: RecipientResponse = "decline"
    cold_storage_decline_reason: str = Field(default="", max_length=300)
    pickup_location: str = Field(min_length=2, max_length=200)
    food_bank_location: str = Field(default="UAE Food Bank hub (simulated)", max_length=200)
    cold_storage_location: str = Field(default="Community Cold Store 01 (simulated)", max_length=200)
    collection_deadline: str = Field(min_length=8, max_length=32)


class IntakeConfirmation(StrictModel):
    photo_name: str = Field(min_length=1, max_length=200)
    selected_dishes: list[str] = Field(min_length=1, max_length=20)
    untouched_confirmed: bool
    estimated_weight_kg: float = Field(gt=0, le=5000)
    venue_name: str = Field(min_length=2, max_length=120)
    pickup_location: str = Field(min_length=2, max_length=200)


class CustodyAction(StrictModel):
    action: Literal["pickup", "handover"]
    temperature_c: float | None = Field(default=None, ge=-50, le=100)
    pickup_code: str = Field(default="", max_length=100)
    handover_pin: str = Field(default="", max_length=12)


class OrganiserTakeover(StrictModel):
    reason: str = Field(min_length=2, max_length=300)


class RescueRevokeRequest(StrictModel):
    reason: str = Field(min_length=2, max_length=300)


class NemaStyleRecord(StrictModel):
    batch_id: str = Field(min_length=2, max_length=80)
    estimated_weight_kg: float = Field(ge=0, le=5000)
    estimated_co2e_kg: float = Field(ge=0, le=50000)
    data_label: Literal["SIMULATED"] = "SIMULATED"


class JobCommand(StrictModel):
    type: Literal[
        "CHEF_CONFIRMED",
        "OFFER_ACCEPTED",
        "OFFER_DECLINED",
        "PICKUP_CONFIRMED",
        "DELIVERY_CONFIRMED",
        "COMPOST_CONFIRMED",
        "HUMAN_TAKEOVER",
        "DEMO_CLOCK_CHANGED",
        "SCENARIO_SELECTED",
        "JOB_RESET",
    ]
    actor: Literal["chef", "agent", "recipient", "driver", "composter", "organiser", "system"]
    payload: dict = Field(default_factory=dict)
    idempotency_key: str = Field(min_length=8, max_length=120)


class PortalRecord(StrictModel):
    id: str
    service: str
    status: str
    created_at: str
    payload: dict


class SimulationEvent(StrictModel):
    id: int
    batch_id: str
    event_type: str
    status: str
    summary: str
    created_at: str
    metadata: dict
