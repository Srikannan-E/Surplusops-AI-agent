import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.domain import storage
from app.domain.models import RescueRunRequest
from app.agent_tools import PolicyBlocked, execute_tool, policy_gate
from app.graph.workflow import run_rescue
from app.main import _seed_demo_event, app
from fastapi.testclient import TestClient


class RescueWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        storage.DB_PATH = Path(cls.temp_dir.name) / "test.sqlite3"
        storage.initialize_storage()

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        with storage._connect() as connection:
            connection.execute("DELETE FROM portal_records")
            connection.execute("DELETE FROM simulation_events")
            connection.execute("DELETE FROM demo_jobs")
            connection.execute("DELETE FROM demo_commands")
        self.client = TestClient(app)
    def job_command(self, batch_id, key, command_type, actor, payload=None):
        command_payload = dict(payload or {})
        if command_type == "PICKUP_CONFIRMED":
            details = self.client.get(
                f"/api/jobs/{batch_id}/handover-credentials",
            )
            if details.status_code == 200:
                command_payload["pickup_code"] = details.json()["pickup_code"]
        if command_type == "DELIVERY_CONFIRMED":
            details = self.client.get(f"/api/jobs/{batch_id}/handover-credentials")
            if details.status_code == 200:
                command_payload["pin"] = details.json()["delivery_pin"]
        if command_type == "COMPOST_CONFIRMED":
            details = self.client.get(f"/api/jobs/{batch_id}/compost-credentials")
            if details.status_code == 200:
                command_payload["verification_code"] = details.json()["verification_code"]
        return self.client.post(
            f"/api/jobs/{batch_id}/commands",
            json={
                "type": command_type,
                "actor": actor,
                "payload": command_payload,
                "idempotency_key": key,
            },
        )

    def make_request(self, **overrides):
        values = {
            "batch_id": "TEST-BATCH-001",
            "venue_name": "Test Hotel",
            "event_name": "Test banquet",
            "food_summary": "Sealed vegetable biryani trays",
            "estimated_weight_kg": 20,
            "untouched_confirmed": True,
            "allergens_from_menu": ["Dairy"],
            "halal_status": "verified_by_venue",
            "remaining_safe_minutes": 120,
            "pickup_eta_minutes": 25,
            "safety_buffer_minutes": 20,
            "food_bank_response": "accept",
            "cold_storage_response": "accept",
            "pickup_location": "Test Hotel loading bay",
            "food_bank_location": "Food bank hub (simulated)",
            "cold_storage_location": "Cold store (simulated)",
            "collection_deadline": "2026-06-11T00:30",
        }
        values.update(overrides)
        return RescueRunRequest.model_validate(values)

    def test_fixed_portal_login_codes_are_removed(self):
        response = self.client.post(
            "/api/auth/portal",
            json={"role": "driver", "access_code": "any-code"},
        )
        self.assertEqual(response.status_code, 404)
        job = self.client.get("/api/jobs/active").json()
        invalid_state = self.client.post(
            f"/api/jobs/{job['batch_id']}/commands",
            json={
                "type": "OFFER_ACCEPTED",
                "actor": "recipient",
                "payload": {},
                "idempotency_key": "unauthorized-recipient-action",
            },
        )
        self.assertEqual(invalid_state.status_code, 409)

        pin_response = self.client.get(
            f"/api/jobs/{job['batch_id']}/handover-credentials",
        )
        self.assertEqual(pin_response.status_code, 409)

    def test_compost_collection_requires_the_per_booking_one_time_code(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        compost = self.job_command(
            batch_id,
            "compost-only-intake",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Vegetable biryani"],
                "photo_name": "banquet.png",
                "untouched_confirmed": False,
                "estimated_weight_kg": 10,
            },
        )
        self.assertEqual(compost.json()["status"], "COMPOST_REQUESTED")
        self.assertNotIn("compost_otp", compost.json())
        credentials = self.client.get(f"/api/jobs/{batch_id}/compost-credentials")
        self.assertEqual(credentials.status_code, 200)
        code = credentials.json()["verification_code"]
        self.assertEqual(len(code), 6)

        rejected = self.client.post(
            f"/api/jobs/{batch_id}/commands",
            json={
                "type": "COMPOST_CONFIRMED",
                "actor": "composter",
                "payload": {"verification_code": "000000" if code != "000000" else "000001"},
                "idempotency_key": "compost-wrong-code",
            },
        )
        self.assertEqual(rejected.status_code, 422)
        still_requested = self.client.get(f"/api/jobs/{batch_id}").json()
        self.assertEqual(still_requested["status"], "COMPOST_REQUESTED")

        confirmed = self.job_command(
            batch_id,
            "compost-right-code",
            "COMPOST_CONFIRMED",
            "composter",
            {"verification_code": code},
        )
        self.assertEqual(confirmed.json()["status"], "SEALED")
        self.assertTrue(any(event["type"] == "COMPOST_CONFIRMED" for event in confirmed.json()["events"]))

    def test_food_bank_acceptance_dispatches_and_preserves_menu_metadata(self):
        result = run_rescue(self.make_request())

        self.assertEqual(result["outcome"], "dispatched")
        self.assertEqual(result["selected_recipient"], "uae-food-bank")
        food_bank_record = storage.list_records("uae-food-bank")[0]
        self.assertEqual(food_bank_record["status"], "SIMULATED_ACCEPTED")
        self.assertEqual(food_bank_record["payload"]["allergens_from_menu"], ["Dairy"])
        self.assertEqual(food_bank_record["payload"]["halal_status"], "verified_by_venue")

    def test_declined_food_bank_routes_to_cold_storage(self):
        result = run_rescue(self.make_request(
            batch_id="TEST-BATCH-002",
            food_bank_response="decline",
        ))

        self.assertEqual(result["outcome"], "dispatched")
        self.assertEqual(result["selected_recipient"], "public-cold-storage")
        self.assertEqual(storage.list_records("uae-food-bank")[0]["status"], "SIMULATED_DECLINED")
        self.assertEqual(storage.list_records("public-cold-storage")[0]["status"], "SIMULATED_ACCEPTED")

    def test_all_recipient_declines_use_reloop_fallback(self):
        result = run_rescue(self.make_request(
            batch_id="TEST-BATCH-003",
            food_bank_response="decline",
            cold_storage_response="decline",
        ))

        self.assertEqual(result["outcome"], "safe-disposal-fallback")
        self.assertEqual(result["selected_recipient"], "reloop")
        self.assertEqual(storage.list_records("reloop")[0]["status"], "SIMULATED_FALLBACK_REQUESTED")

    def test_missing_untouched_confirmation_blocks_rescue(self):
        result = run_rescue(self.make_request(
            batch_id="TEST-BATCH-004",
            untouched_confirmed=False,
        ))

        self.assertFalse(result["safety_eligible"])
        self.assertEqual(result["selected_recipient"], "reloop")
        self.assertEqual(storage.list_records("uae-food-bank"), [])
        self.assertEqual(storage.list_records("reloop")[0]["status"], "SIMULATED_FALLBACK_REQUESTED")

    def test_insufficient_time_blocks_rescue(self):
        result = run_rescue(self.make_request(
            batch_id="TEST-BATCH-005",
            remaining_safe_minutes=40,
            pickup_eta_minutes=25,
            safety_buffer_minutes=20,
        ))

        self.assertFalse(result["safety_eligible"])
        self.assertEqual(result["selected_recipient"], "reloop")
        self.assertEqual(storage.list_records("uae-food-bank"), [])

    def test_event_catalog_photo_analysis_and_agent_tool_trace(self):
        _seed_demo_event()
        events = self.client.get("/api/events")
        self.assertEqual(events.status_code, 200)
        event = next(item for item in events.json() if item["id"] == "event-demo-banquet")

        selected = self.client.post(f"/api/events/{event['id']}/select")
        self.assertEqual(selected.status_code, 200)
        analysis = self.client.post(
            f"/api/events/{event['id']}/analyze",
            json={
                "photo_name": "leftovers.jpg",
                "photo_base64": "",
                "voice_note": "Three full biryani trays",
                "served_status": "untouched",
            },
        )
        self.assertEqual(analysis.status_code, 200)
        self.assertTrue(analysis.json()["approved_items"])
        analysis_event = next(
            event for event in storage.list_events(storage.get_active_job()["batch_id"])
            if event["event_type"] == "TOOL_CALL"
            and event["metadata"].get("payload", {}).get("name") == "analyze_leftover_photo"
        )
        self.assertEqual(analysis_event["metadata"]["payload"]["inputs"]["voice_note"], "Three full biryani trays")

        batch_id = selected.json()["batch_id"]
        with patch("app.main.execute_tool", return_value={"ok": True}):
            confirmed = self.job_command(
                batch_id,
                "event-intake-confirm",
                "CHEF_CONFIRMED",
                "chef",
                {
                    "dishes": [analysis.json()["approved_items"][0]],
                    "photo_name": "leftovers.jpg",
                    "untouched_confirmed": True,
                    "estimated_weight_kg": 12,
                },
            )
        self.assertEqual(confirmed.status_code, 200)
        job = confirmed.json()
        self.assertEqual(job["status"], "OFFERING")
        self.assertGreaterEqual(
            sum(event["type"] == "TOOL_CALL" for event in job["events"]),
            8,
        )
        self.assertEqual(job["token_usage"]["calls"], 3)
        self.assertTrue(any(event["type"] == "FALLBACK" for event in job["events"]))

        accepted = self.job_command(batch_id, "event-offer-accept", "OFFER_ACCEPTED", "recipient")
        self.assertEqual(accepted.status_code, 200)
        self.assertNotIn("delivery_pin", accepted.json())
        self.assertNotIn("pickup_code", accepted.json())
        delivery_pin = self.client.get(
            f"/api/jobs/{batch_id}/handover-credentials",
        ).json()["delivery_pin"]
        code_event = next(
            event for event in accepted.json()["events"]
            if event["type"] == "TOOL_CALL"
            and event["payload"].get("name") == "generate_handover_codes"
        )
        self.assertNotIn("pin", code_event["payload"]["outputs"])
        self.assertNotIn("pickup_code", code_event["payload"]["outputs"])
        self.assertNotIn("delivery_pin", code_event["payload"]["outputs"])
        self.assertEqual(code_event["payload"]["outputs"]["codes_generated"], True)
        picked_up = self.job_command(
            batch_id,
            "event-pickup-record",
            "PICKUP_CONFIRMED",
            "driver",
            {"temperature_c": 4.2},
        )
        self.assertEqual(picked_up.status_code, 200)
        delivered = self.job_command(
            batch_id,
            "event-delivery-record",
            "DELIVERY_CONFIRMED",
            "driver",
            {"pin": delivery_pin},
        )
        self.assertEqual(delivered.status_code, 200)
        self.assertEqual(delivered.json()["status"], "SEALED")
        self.assertGreaterEqual(
            sum(event["type"] == "TOOL_CALL" for event in delivered.json()["events"]),
            12,
        )

    def test_weather_tool_uses_live_open_meteo_data(self):
        current = {
            "temperature_2m": 37.2,
            "apparent_temperature": 41.0,
            "relative_humidity_2m": 45,
            "precipitation": 0.0,
            "weather_code": 2,
            "wind_speed_10m": 13.4,
            "time": "2026-11-17T15:00",
        }
        with patch("app.agent_tools._request_json", return_value={"current": current}) as fetch:
            result = execute_tool("get_weather", {"latitude": 25.2, "longitude": 55.27}, {})

        self.assertTrue(result["available"])
        self.assertEqual(result["temperature_c"], 37.2)
        self.assertEqual(result["conditions"], "Partly cloudy")
        self.assertEqual(result["source"], "Open-Meteo live conditions")
        self.assertIn("api.open-meteo.com", fetch.call_args.args[0])
        self.assertIn("weather_code", fetch.call_args.args[0])
        self.assertEqual(fetch.call_args.kwargs["timeout"], 5.0)

    def test_weather_tool_does_not_invent_a_reading_when_service_is_unavailable(self):
        with patch("app.agent_tools._request_json", side_effect=OSError("network unavailable")):
            result = execute_tool("get_weather", {}, {})

        self.assertFalse(result["available"])
        self.assertNotIn("temperature_c", result)
        self.assertEqual(result["source"], "Open-Meteo")
        self.assertIn("No weather value was assumed", result["message"])

    def test_local_network_origin_is_allowed_for_multi_device_demo(self):
        response = self.client.options(
            "/api/health",
            headers={
                "Origin": "http://192.168.1.25:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://192.168.1.25:5173")

    def test_agent_policy_blocks_unsafe_routes(self):
        with self.assertRaises(PolicyBlocked):
            policy_gate(
                "send_offer",
                {"confirmed_items": ["Biryani"], "remaining_minutes": 20},
                untouched_confirmed=False,
                confirmed_items=["Biryani"],
                remaining_minutes=20,
            )
        with self.assertRaises(PolicyBlocked):
            policy_gate(
                "send_offer",
                {"confirmed_items": ["Biryani"], "remaining_minutes": 0},
                untouched_confirmed=True,
                confirmed_items=["Biryani"],
                remaining_minutes=0,
            )
        with self.assertRaises(PolicyBlocked):
            policy_gate(
                "submit_food_bank_request",
                {"items": ["Biryani"], "remaining_minutes": 20, "channel": "b2c"},
                untouched_confirmed=True,
                confirmed_items=["Biryani"],
                remaining_minutes=20,
            )

    def test_menu_extraction_requires_venue_confirmation(self):
        extraction = self.client.post(
            "/api/events/extract",
            json={
                "text": "Vegetable biryani\nGrilled chicken",
                "filename": "menu.txt",
                "content_type": "text/plain",
            },
        )
        self.assertEqual(extraction.status_code, 200)
        item = extraction.json()["items"][0]
        self.assertFalse(item["confirmed"])

        payload = {
            "id": "event-confirmation-test",
            "name": "Test dinner",
            "type": "Dinner",
            "venue": "Test venue",
            "start": "2026-11-16T18:00:00+04:00",
            "end": "2026-11-16T22:00:00+04:00",
            "guest_count": 40,
            "contact": "Test contact",
            "status": "planned",
            "menu_items": extraction.json()["items"],
        }
        rejected = self.client.post("/api/events", json=payload)
        self.assertEqual(rejected.status_code, 422)

        for menu_item in payload["menu_items"]:
            menu_item["confirmed"] = True
        created = self.client.post("/api/events", json=payload)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["id"], payload["id"])

    def test_hash_chain_verifies_and_detects_event_changes(self):
        run_rescue(self.make_request(batch_id="TEST-HASH-001"))
        events = storage.list_events("TEST-HASH-001")

        self.assertTrue(storage.verify_event_chain(events))
        events[0]["summary"] = "Modified after recording"
        self.assertFalse(storage.verify_event_chain(events))

    def test_hash_tampering_is_not_repaired_on_storage_reinitialization(self):
        storage.add_event("TEST-HASH-002", "TEST_EVENT", "RECORDED", "Original value")
        with storage._connect() as connection:
            connection.execute(
                "UPDATE simulation_events SET summary = ? WHERE batch_id = ?",
                ("Tampered value", "TEST-HASH-002"),
            )

        storage.initialize_storage()
        self.assertFalse(storage.verify_event_chain(storage.list_events("TEST-HASH-002")))

    def test_custody_handover_is_final_and_audit_pdf_is_downloadable(self):
        batch_id = "TEST-CUSTODY-001"
        run_rescue(self.make_request(batch_id=batch_id))
        storage.save_job(batch_id, {
            "batch_id": batch_id,
            "status": "PICKED_UP",
            "pickup_code": "87654321",
            "delivery_pin": "123456",
        })

        pickup = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "pickup", "pickup_code": "87654321", "temperature_c": 4.2},
        )
        self.assertEqual(pickup.status_code, 200)

        wrong_pin = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "handover", "handover_pin": "000000"},
        )
        self.assertEqual(wrong_pin.status_code, 422)

        handover = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "handover", "handover_pin": "123456"},
        )
        self.assertEqual(handover.status_code, 200)
        self.assertEqual(handover.json()["status"], "FINAL_LOCK")

        locked = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "pickup", "pickup_code": "87654321", "temperature_c": 4.2},
        )
        self.assertEqual(locked.status_code, 409)

        audit = self.client.get(f"/api/demo/audit/{batch_id}")
        self.assertTrue(audit.json()["hash_chain_verified"])
        self.assertGreater(audit.json()["total_weight_kg"], 0)
        pdf = self.client.get(f"/api/demo/audit/{batch_id}/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.headers["content-type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF-1.4"))
        revoke_after_handover = self.client.post(
            f"/api/demo/revoke/{batch_id}",
            json={"reason": "Too late"},
        )
        self.assertEqual(revoke_after_handover.status_code, 409)

    def test_driver_codes_lock_after_five_incorrect_attempts(self):
        batch_id = "TEST-CODE-LOCKOUT-001"
        run_rescue(self.make_request(batch_id=batch_id))
        storage.save_job(batch_id, {
            "batch_id": batch_id,
            "status": "PICKED_UP",
            "pickup_code": "12345678",
            "delivery_pin": "654321",
        })
        pickup = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "pickup", "pickup_code": "12345678", "temperature_c": 4.0},
        )
        self.assertEqual(pickup.status_code, 200)
        for attempt in range(5):
            rejected = self.client.post(
                f"/api/demo/custody/{batch_id}",
                json={"action": "handover", "handover_pin": "000000"},
            )
            self.assertEqual(rejected.status_code, 429 if attempt == 4 else 422)
        locked = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "handover", "handover_pin": "654321"},
        )
        self.assertEqual(locked.status_code, 429)

    def test_intake_double_tap_is_idempotent_and_revoke_blocks_pickup(self):
        batch_id = "TEST-REVOKE-001"
        intake_payload = {
            "photo_name": "demo-photo.png",
            "selected_dishes": ["Biryani"],
            "untouched_confirmed": True,
            "estimated_weight_kg": 18,
            "venue_name": "Test Hotel",
            "pickup_location": "Test Hotel kitchen",
        }
        first_intake = self.client.post(
            f"/api/demo/intake/{batch_id}",
            json=intake_payload,
        )
        second_intake = self.client.post(
            f"/api/demo/intake/{batch_id}",
            json=intake_payload,
        )
        self.assertEqual(first_intake.status_code, 200)
        self.assertEqual(second_intake.json()["id"], first_intake.json()["id"])

        revoked = self.client.post(
            f"/api/demo/revoke/{batch_id}",
            json={"reason": "Kitchen staff reports possible handling contamination."},
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.json()["selected_recipient"], "reloop")
        pickup = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "pickup", "temperature_c": 4.0},
        )
        self.assertEqual(pickup.status_code, 409)
        self.assertTrue(storage.verify_event_chain(storage.list_events(batch_id)))

    def test_dispatched_rescue_can_be_revoked_until_final_handover(self):
        batch_id = "TEST-REVOKE-DISPATCHED-001"
        request = self.make_request(batch_id=batch_id)
        intake_payload = {
            "photo_name": "demo-photo.png",
            "selected_dishes": ["Biryani"],
            "untouched_confirmed": True,
            "estimated_weight_kg": request.estimated_weight_kg,
            "venue_name": request.venue_name,
            "pickup_location": request.pickup_location,
        }
        self.client.post(f"/api/demo/intake/{batch_id}", json=intake_payload)
        run_rescue(request)
        storage.save_job(batch_id, {
            "batch_id": batch_id,
            "status": "PICKED_UP",
            "pickup_code": "12345678",
            "delivery_pin": "654321",
        })

        pickup = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "pickup", "pickup_code": "12345678", "temperature_c": 4.1},
        )
        self.assertEqual(pickup.status_code, 200)
        revoked = self.client.post(
            f"/api/demo/revoke/{batch_id}",
            json={"reason": "Organiser noticed a new handling concern."},
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.json()["selected_recipient"], "reloop")
        self.assertTrue(storage.verify_event_chain(storage.list_events(batch_id)))
        handover = self.client.post(
            f"/api/demo/custody/{batch_id}",
            json={"action": "handover", "handover_pin": "654321"},
        )
        self.assertEqual(handover.status_code, 409)

    def test_rescue_double_submit_does_not_duplicate_dispatch(self):
        request = self.make_request(batch_id="TEST-DOUBLE-SUBMIT-001")
        first = self.client.post("/api/demo/rescue", json=request.model_dump())
        second = self.client.post("/api/demo/rescue", json=request.model_dump())

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(len(storage.list_records("collecteroo")), 1)

    def test_unconfirmed_intake_is_logged_and_routed_to_compost(self):
        batch_id = "TEST-UNCONFIRMED-001"
        intake = self.client.post(
            f"/api/demo/intake/{batch_id}",
            json={
                "photo_name": "demo-photo.png",
                "selected_dishes": ["Biryani"],
                "untouched_confirmed": False,
                "estimated_weight_kg": 10,
                "venue_name": "Test Hotel",
                "pickup_location": "Test Hotel kitchen",
            },
        )
        self.assertEqual(intake.status_code, 200)
        self.assertEqual(intake.json()["status"], "HUMAN_REJECTED")

        result = run_rescue(self.make_request(
            batch_id=batch_id,
            untouched_confirmed=False,
        ))
        self.assertEqual(result["selected_recipient"], "reloop")
        self.assertEqual(storage.list_records("uae-food-bank"), [])

    def test_nema_style_record_is_explicitly_simulated(self):
        response = self.client.post(
            "/api/demo/requests/ne-ma-style",
            json={
                "batch_id": "TEST-NEMA-STYLE-001",
                "estimated_weight_kg": 10,
                "estimated_co2e_kg": 25,
                "data_label": "SIMULATED",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["service"], "ne-ma-style-report")
        self.assertEqual(response.json()["status"], "SIMULATED_REPORT_RECORDED")

    def test_live_job_commands_replan_and_compost_with_idempotency(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        intake = {
            "dishes": ["Vegetable biryani", "Grilled chicken"],
            "photo_name": "demo-photo.png",
            "untouched_confirmed": True,
            "estimated_weight_kg": 24,
        }
        confirmed = self.job_command(batch_id, "intake-key-0001", "CHEF_CONFIRMED", "chef", intake)
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.json()["status"], "OFFERING")
        event_count = len(confirmed.json()["events"])
        duplicate = self.job_command(batch_id, "intake-key-0001", "CHEF_CONFIRMED", "chef", intake)
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(len(storage.list_events(batch_id)), event_count)

        first_decline = self.job_command(
            batch_id,
            "recipient-decline-01",
            "OFFER_DECLINED",
            "recipient",
            {"reason": "No capacity"},
        )
        self.assertEqual(first_decline.json()["current_tier"], 2)
        self.assertEqual(first_decline.json()["rungs"]["1"]["state"], "declined")

        second_decline = self.job_command(
            batch_id,
            "recipient-decline-02",
            "OFFER_DECLINED",
            "recipient",
            {"reason": "Pickup window too short"},
        )
        self.assertEqual(second_decline.json()["status"], "COMPOST_REQUESTED")
        self.assertTrue(second_decline.json()["cancelled"])
        self.assertEqual(len(storage.list_records("reloop")), 1)

        sealed = self.job_command(batch_id, "compost-confirm-01", "COMPOST_CONFIRMED", "composter")
        self.assertEqual(sealed.json()["status"], "SEALED")
        self.assertTrue(sealed.json()["audit"]["hash_chain_verified"])
        self.assertTrue(storage.verify_event_chain(storage.list_events(batch_id)))

    def test_live_job_acceptance_records_pickup_and_final_handover(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        self.job_command(
            batch_id,
            "intake-key-0002",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Vegetable biryani"],
                "photo_name": "banquet.png",
                "untouched_confirmed": True,
                "estimated_weight_kg": 18,
            },
        )
        accepted = self.job_command(batch_id, "recipient-accept-01", "OFFER_ACCEPTED", "recipient")
        self.assertEqual(accepted.json()["status"], "ACCEPTED")
        self.assertEqual(accepted.json()["selected_recipient"], "uae-food-bank")
        delivery_pin = self.client.get(
            f"/api/jobs/{batch_id}/handover-credentials",
        ).json()["delivery_pin"]

        pickup = self.job_command(
            batch_id,
            "driver-pickup-01",
            "PICKUP_CONFIRMED",
            "driver",
            {"temperature_c": 4.2},
        )
        self.assertEqual(pickup.json()["status"], "PICKED_UP")
        delivery = self.job_command(
            batch_id,
            "driver-delivery-01",
            "DELIVERY_CONFIRMED",
            "driver",
            {"pin": delivery_pin},
        )
        self.assertEqual(delivery.json()["status"], "SEALED")
        self.assertTrue(delivery.json()["audit"]["hash_chain_verified"])

    def test_decline_then_recover_preset_routes_to_next_recipient(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        selected = self.job_command(
            batch_id,
            "scenario-select-01",
            "SCENARIO_SELECTED",
            "organiser",
            {"scenario": "decline_then_recover"},
        )
        self.assertEqual(selected.json()["food_bank_response"], "decline")
        self.assertEqual(selected.json()["longer_life_response"], "accept")
        self.job_command(
            batch_id,
            "intake-key-0003",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Fruit platter"],
                "photo_name": "banquet.png",
                "untouched_confirmed": True,
                "estimated_weight_kg": 8,
            },
        )
        declined = self.job_command(
            batch_id,
            "recipient-decline-preset",
            "OFFER_DECLINED",
            "recipient",
            {"reason": "No capacity"},
        )
        self.assertEqual(declined.json()["current_tier"], 2)
        recovered = self.job_command(
            batch_id,
            "recipient-accept-preset",
            "OFFER_ACCEPTED",
            "recipient",
        )
        self.assertEqual(recovered.json()["status"], "ACCEPTED")
        self.assertEqual(recovered.json()["selected_recipient"], "public-cold-storage")
        self.assertTrue(storage.verify_event_chain(storage.list_events(batch_id)))

    def test_expired_accepted_job_is_revoked_before_pickup(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        self.job_command(
            batch_id,
            "intake-expiry-key",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Biryani"],
                "photo_name": "banquet.png",
                "untouched_confirmed": True,
                "estimated_weight_kg": 12,
            },
        )
        self.job_command(batch_id, "accept-expiry-key", "OFFER_ACCEPTED", "recipient")
        expired_job = storage.get_job(batch_id)
        expired_job["remaining_safe_seconds"] = 0
        expired_job["clock_anchor"] = "2026-11-16T08:00:00+00:00"
        storage.save_job(batch_id, expired_job)

        updated = self.client.get(f"/api/jobs/{batch_id}").json()
        self.assertEqual(updated["status"], "COMPOST_REQUESTED")
        self.assertTrue(updated["cancelled"])
        self.assertTrue(any(event["type"] == "WINDOW_EXPIRED" for event in updated["events"]))
        pickup = self.job_command(
            batch_id,
            "pickup-expiry-key",
            "PICKUP_CONFIRMED",
            "driver",
            {"temperature_c": 4.0},
        )
        self.assertEqual(pickup.status_code, 409)

    def test_live_job_refuses_acceptance_when_safe_window_cannot_cover_pickup(self):
        job = self.client.get("/api/jobs/active").json()
        batch_id = job["batch_id"]
        self.job_command(
            batch_id,
            "short-window-intake",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Biryani"],
                "photo_name": "banquet.png",
                "untouched_confirmed": True,
                "estimated_weight_kg": 10,
            },
        )
        current = storage.get_job(batch_id)
        current["remaining_safe_seconds"] = 20 * 60
        current["clock_anchor"] = "2026-11-16T08:53:00+00:00"
        storage.save_job(batch_id, current)

        response = self.job_command(batch_id, "short-window-accept", "OFFER_ACCEPTED", "recipient")
        self.assertEqual(response.json()["status"], "COMPOST_REQUESTED")
        self.assertFalse(any(event["type"] == "OFFER_ACCEPTED" for event in response.json()["events"]))
        self.assertEqual(storage.list_records("uae-food-bank"), [])

    def test_live_job_without_untouched_confirmation_routes_directly_to_compost(self):
        job = self.client.get("/api/jobs/active").json()
        response = self.job_command(
            job["batch_id"],
            "untouched-missing-key",
            "CHEF_CONFIRMED",
            "chef",
            {
                "dishes": ["Biryani"],
                "photo_name": "banquet.png",
                "untouched_confirmed": False,
                "estimated_weight_kg": 10,
            },
        )
        self.assertEqual(response.json()["status"], "COMPOST_REQUESTED")
        self.assertTrue(response.json()["cancelled"])
        self.assertFalse(any(event["type"] == "OFFER_SENT" for event in response.json()["events"]))
        self.assertEqual(storage.list_records("uae-food-bank"), [])
        self.assertEqual(len(storage.list_records("reloop")), 1)

    def test_job_reset_keeps_one_active_snapshot_and_wrong_actor_is_rejected(self):
        first = self.client.get("/api/jobs/active").json()
        rejected = self.job_command(first["batch_id"], "bad-actor-key-01", "CHEF_CONFIRMED", "recipient", {
            "dishes": ["Biryani"],
            "untouched_confirmed": True,
        })
        self.assertEqual(rejected.status_code, 403)

        reset = self.job_command(first["batch_id"], "job-reset-key-001", "JOB_RESET", "organiser")
        self.assertNotEqual(reset.json()["batch_id"], first["batch_id"])
        active = self.client.get("/api/jobs/active").json()
        self.assertEqual(active["batch_id"], reset.json()["batch_id"])
        with storage._connect() as connection:
            active_count = connection.execute(
                "SELECT COUNT(*) FROM demo_jobs WHERE active = 1"
            ).fetchone()[0]
        self.assertEqual(active_count, 1)


if __name__ == "__main__":
    unittest.main()
