from __future__ import annotations

import json
import hashlib
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DB_PATH = Path(os.getenv("SURPLUSOPS_DB_PATH", DATA_DIR / "surplusops.sqlite3"))
_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_storage() -> None:
    with _lock, _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS portal_records (
                id TEXT PRIMARY KEY,
                service TEXT NOT NULL,
                status TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS simulation_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                previous_hash TEXT,
                event_hash TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS demo_jobs (
                batch_id TEXT PRIMARY KEY,
                snapshot_json TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS demo_commands (
                idempotency_key TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                response_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS food_events (
                event_id TEXT PRIMARY KEY,
                event_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(simulation_events)").fetchall()
        }
        if "previous_hash" not in columns:
            connection.execute("ALTER TABLE simulation_events ADD COLUMN previous_hash TEXT")
        if "event_hash" not in columns:
            connection.execute("ALTER TABLE simulation_events ADD COLUMN event_hash TEXT")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_batch_id ON simulation_events(batch_id, id)"
        )
        _backfill_event_hashes(connection)


GENESIS_HASH = "0" * 64


def _event_hash(
    previous_hash: str,
    batch_id: str,
    event_type: str,
    status: str,
    summary: str,
    metadata_json: str,
    created_at: str,
) -> str:
    event_json = json.dumps(
        {
            "batch_id": batch_id,
            "created_at": created_at,
            "event_type": event_type,
            "metadata": json.loads(metadata_json),
            "status": status,
            "summary": summary,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(f"{previous_hash}\n{event_json}".encode("utf-8")).hexdigest()


def _backfill_event_hashes(connection: sqlite3.Connection) -> None:
    previous_by_batch: dict[str, str] = {}
    rows = connection.execute(
        """
        SELECT id, batch_id, event_type, status, summary, metadata_json, created_at,
               previous_hash, event_hash
        FROM simulation_events ORDER BY id ASC
        """
    ).fetchall()
    for row in rows:
        previous = previous_by_batch.get(row["batch_id"], GENESIS_HASH)
        if row["previous_hash"] is None or row["event_hash"] is None:
            digest = _event_hash(
                previous,
                row["batch_id"],
                row["event_type"],
                row["status"],
                row["summary"],
                row["metadata_json"],
                row["created_at"],
            )
            connection.execute(
                "UPDATE simulation_events SET previous_hash = ?, event_hash = ? WHERE id = ?",
                (previous, digest, row["id"]),
            )
        else:
            digest = row["event_hash"]
        previous_by_batch[row["batch_id"]] = digest


def verify_event_chain(events: list[dict[str, Any]]) -> bool:
    previous_hash = GENESIS_HASH
    for event in events:
        if event.get("previous_hash") != previous_hash:
            return False
        metadata_json = json.dumps(
            event["metadata"],
            sort_keys=True,
            separators=(",", ":"),
        )
        expected_hash = _event_hash(
            previous_hash,
            event["batch_id"],
            event["event_type"],
            event["status"],
            event["summary"],
            metadata_json,
            event["created_at"],
        )
        if event.get("event_hash") != expected_hash:
            return False
        previous_hash = expected_hash
    return True


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_record(service: str, payload: dict[str, Any], status: str = "SIMULATED_RECEIVED") -> dict[str, Any]:
    record = {
        "id": f"{service[:4]}-{uuid.uuid4().hex[:10]}",
        "service": service,
        "status": status,
        "payload": payload,
        "created_at": utc_now(),
    }
    with _lock, _connect() as connection:
        connection.execute(
            "INSERT INTO portal_records(id, service, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (record["id"], service, status, json.dumps(payload), record["created_at"]),
        )
    return record


def list_records(service: str, limit: int = 50) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, service, status, payload_json, created_at FROM portal_records WHERE service = ? ORDER BY created_at DESC LIMIT ?",
            (service, limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "service": row["service"],
            "status": row["status"],
            "created_at": row["created_at"],
            "payload": json.loads(row["payload_json"]),
        }
        for row in rows
    ]


def list_all_records(limit: int = 250) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, service, status, payload_json, created_at
            FROM portal_records ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "service": row["service"],
            "status": row["status"],
            "created_at": row["created_at"],
            "payload": json.loads(row["payload_json"]),
        }
        for row in rows
    ]


def add_event(
    batch_id: str,
    event_type: str,
    status: str,
    summary: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    created_at = utc_now()
    event_metadata = metadata or {}
    metadata_json = json.dumps(event_metadata, sort_keys=True, separators=(",", ":"))
    with _lock, _connect() as connection:
        previous_row = connection.execute(
            "SELECT event_hash FROM simulation_events WHERE batch_id = ? ORDER BY id DESC LIMIT 1",
            (batch_id,),
        ).fetchone()
        previous_hash = previous_row["event_hash"] if previous_row and previous_row["event_hash"] else GENESIS_HASH
        digest = _event_hash(
            previous_hash,
            batch_id,
            event_type,
            status,
            summary,
            metadata_json,
            created_at,
        )
        cursor = connection.execute(
            """
            INSERT INTO simulation_events(
                batch_id, event_type, status, summary, metadata_json, created_at,
                previous_hash, event_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                event_type,
                status,
                summary,
                metadata_json,
                created_at,
                previous_hash,
                digest,
            ),
        )
        event_id = cursor.lastrowid
    return {
        "id": event_id,
        "batch_id": batch_id,
        "event_type": event_type,
        "status": status,
        "summary": summary,
        "metadata": event_metadata,
        "created_at": created_at,
        "previous_hash": previous_hash,
        "event_hash": digest,
    }


def list_events(batch_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, batch_id, event_type, status, summary, metadata_json, created_at,
                   previous_hash, event_hash
            FROM simulation_events WHERE batch_id = ? ORDER BY id ASC LIMIT ?
            """,
            (batch_id, limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "batch_id": row["batch_id"],
            "event_type": row["event_type"],
            "status": row["status"],
            "summary": row["summary"],
            "metadata": json.loads(row["metadata_json"]),
            "created_at": row["created_at"],
            "previous_hash": row["previous_hash"],
            "event_hash": row["event_hash"],
        }
        for row in rows
    ]


def save_job(batch_id: str, snapshot: dict[str, Any], active: bool = True) -> None:
    with _lock, _connect() as connection:
        if active:
            connection.execute("UPDATE demo_jobs SET active = 0")
        connection.execute(
            """
            INSERT INTO demo_jobs(batch_id, snapshot_json, active, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(batch_id) DO UPDATE SET
                snapshot_json = excluded.snapshot_json,
                active = excluded.active,
                updated_at = excluded.updated_at
            """,
            (batch_id, json.dumps(snapshot), int(active), utc_now()),
        )


def get_job(batch_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT snapshot_json FROM demo_jobs WHERE batch_id = ?",
            (batch_id,),
        ).fetchone()
    return json.loads(row["snapshot_json"]) if row else None


def get_active_job() -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT snapshot_json FROM demo_jobs WHERE active = 1 ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
    return json.loads(row["snapshot_json"]) if row else None


def save_food_event(event_id: str, event: dict[str, Any]) -> None:
    with _lock, _connect() as connection:
        connection.execute(
            """
            INSERT INTO food_events(event_id, event_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(event_id) DO UPDATE SET
                event_json = excluded.event_json,
                updated_at = excluded.updated_at
            """,
            (event_id, json.dumps(event), utc_now()),
        )


def get_food_event(event_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT event_json FROM food_events WHERE event_id = ?",
            (event_id,),
        ).fetchone()
    return json.loads(row["event_json"]) if row else None


def list_food_events() -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT event_json FROM food_events ORDER BY updated_at DESC"
        ).fetchall()
    return [json.loads(row["event_json"]) for row in rows]


def save_command_result(idempotency_key: str, batch_id: str, response: dict[str, Any]) -> None:
    with _lock, _connect() as connection:
        connection.execute(
            """
            INSERT INTO demo_commands(idempotency_key, batch_id, response_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (idempotency_key, batch_id, json.dumps(response), utc_now()),
        )


def get_command_result(idempotency_key: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT batch_id, response_json FROM demo_commands WHERE idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()
    return (
        {"batch_id": row["batch_id"], "response": json.loads(row["response_json"])}
        if row
        else None
    )
