#!/usr/bin/env python3
"""Validate the public mesh v2 read surface without promoting binding readiness."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_RESPONSE_BYTES = 262_144
MAX_SAFE_INTEGER = 9_007_199_254_740_991
DEFAULT_HEARTBEAT_AGE_SECONDS = 900
FORBIDDEN_KEYS = {
    "api_key", "apikey", "access_token", "authorization", "client_secret",
    "password", "private_key", "refresh_token", "service_role_key", "token",
}
TOP_FIELDS = {
    "contract", "service", "status", "decision", "release_readiness",
    "all_binding_gates_clear", "control_plane", "binding_summary",
    "latest_heartbeat", "public_surface", "raw_private_evidence_exposed",
    "secret_values_exposed",
}
CONTROL_FIELDS = {
    "operating_state", "fail_closed", "d3_human_reserved", "no_secret_exposure",
    "no_delete_default", "no_money_movement_default", "heartbeat_interval_seconds",
}
SUMMARY_FIELDS = {"total", "operational", "pending", "held", "degraded", "deactivated", "other"}
HEARTBEAT_FIELDS = {"state", "binding_count", "hold_count", "degraded_count", "observed_at"}


class StatusValidationError(ValueError):
    """Contains only fixed diagnostics, never values from a provider response."""


def require(condition, message):
    if not condition:
        raise StatusValidationError(message)


def reject_secret_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower().replace("-", "_")
            require(normalized not in FORBIDDEN_KEYS, "response contains a forbidden credential field")
            reject_secret_keys(child)
    elif isinstance(value, list):
        for child in value:
            reject_secret_keys(child)


def exact_fields(value, fields, label):
    require(type(value) is dict, f"{label} must be a JSON object")
    require(set(value) == fields, f"{label} does not match the public v2 field allowlist")


def integer(value, label, minimum=0):
    require(type(value) is int and minimum <= value <= MAX_SAFE_INTEGER,
            f"{label} must be a bounded integer")
    return value


def validate_status(status, *, now=None, max_heartbeat_age_seconds=DEFAULT_HEARTBEAT_AGE_SECONDS):
    """Return only canonical public counts and derived readiness after validation.

    v2 ALLOW_READ is service availability. Its binding readiness is a separate
    result. Pending/held/deactivated bindings are not converted into a release
    approval. Readiness precedence mirrors chlom_mesh_status_compact_v2.
    """
    integer(max_heartbeat_age_seconds, "heartbeat age limit", minimum=1)
    reject_secret_keys(status)
    exact_fields(status, TOP_FIELDS, "status")
    expected = {
        "contract": "ct.chlom.mesh.status.v2", "service": "ct.chlom.mesh.status.v2",
        "status": "operational", "decision": "ALLOW_READ", "public_surface": True,
        "raw_private_evidence_exposed": False, "secret_values_exposed": False,
    }
    for key, value in expected.items():
        require(type(status[key]) is type(value) and status[key] == value,
                f"status field {key} does not attest the required public v2 state")
    control, summary, heartbeat = (status[name] for name in ("control_plane", "binding_summary", "latest_heartbeat"))
    exact_fields(control, CONTROL_FIELDS, "control_plane")
    exact_fields(summary, SUMMARY_FIELDS, "binding_summary")
    exact_fields(heartbeat, HEARTBEAT_FIELDS, "latest_heartbeat")
    require(control["operating_state"] == "production_hot", "control plane is not production_hot")
    for field in ("fail_closed", "d3_human_reserved", "no_secret_exposure", "no_delete_default", "no_money_movement_default"):
        require(control[field] is True, f"control plane does not attest {field}")
    integer(control["heartbeat_interval_seconds"], "heartbeat interval", minimum=1)
    total = integer(summary["total"], "binding total", minimum=1)
    for field in sorted(SUMMARY_FIELDS - {"total"}):
        require(integer(summary[field], f"binding {field} count") <= total,
                "a binding count exceeds the current total")
    # SQL substring classifications can overlap (for example, pending_hold).
    # current_state is NOT NULL and SQL's other bucket covers every remaining
    # value, so the categories must cover total even though they can overlap.
    require(sum(summary[field] for field in SUMMARY_FIELDS - {"total"}) >= total,
            "binding classifications do not cover the current total")
    require(summary["operational"] + summary["deactivated"] + summary["other"] <= total,
            "disjoint binding categories exceed the current total")
    require(heartbeat["state"] == "hot", "latest heartbeat is not hot")
    heartbeat_total = integer(heartbeat["binding_count"], "heartbeat binding count", minimum=1)
    for field in ("hold_count", "degraded_count"):
        require(integer(heartbeat[field], f"heartbeat {field}") <= heartbeat_total,
                "a heartbeat count exceeds its observed binding total")
    require(heartbeat["degraded_count"] == 0, "latest heartbeat reports service degradation")
    observed = heartbeat["observed_at"]
    require(type(observed) is str and len(observed) <= 64, "heartbeat timestamp is invalid")
    try:
        observed_at = datetime.fromisoformat(observed.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StatusValidationError("heartbeat timestamp is invalid") from exc
    require(observed_at.tzinfo is not None, "heartbeat timestamp must include its UTC offset")
    current = now or datetime.now(timezone.utc)
    age = (current - observed_at).total_seconds()
    require(-60 <= age <= max_heartbeat_age_seconds, "latest heartbeat is stale or outside allowed clock skew")

    if summary["degraded"] > 0:
        readiness = "HOLD_DEGRADED_BINDINGS"
    elif summary["held"] > 0 or heartbeat["hold_count"] > 0:
        readiness = "HOLD_BINDING_GATES"
    elif summary["pending"] > 0:
        readiness = "PENDING_LIFECYCLE_COMPLETION"
    elif summary["other"] > 0:
        readiness = "REVIEW_UNCLASSIFIED_BINDINGS"
    else:
        readiness = "READY_CURRENT_BINDING_SCOPE"
    clear = readiness == "READY_CURRENT_BINDING_SCOPE"
    require(status["release_readiness"] == readiness, "binding readiness contradicts the observed gate counts")
    require(type(status["all_binding_gates_clear"]) is bool and status["all_binding_gates_clear"] is clear,
            "all_binding_gates_clear contradicts the observed gate counts")
    return {
        "contract": expected["contract"], "read_service_operational": True,
        "release_readiness": readiness, "all_binding_gates_clear": clear,
        "binding_summary": dict(summary), "heartbeat_age_seconds": max(0, round(age)),
    }


def _unique_object(pairs):
    value = {}
    for key, child in pairs:
        require(key not in value, "status response contains duplicate JSON fields")
        value[key] = child
    return value


def load_status(path):
    try:
        with Path(path).open("rb") as source:
            raw = source.read(MAX_RESPONSE_BYTES + 1)
        require(len(raw) <= MAX_RESPONSE_BYTES, "status response exceeded the bounded 256 KiB limit")
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise StatusValidationError("status response is not readable bounded UTF-8 JSON") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("response_file")
    parser.add_argument("--summary-file", help="Append safe validation results to a GitHub step summary")
    parser.add_argument("--require-release-ready", action="store_true",
                        help="Additionally fail unless all current binding gates are clear")
    args = parser.parse_args(argv)
    try:
        result = validate_status(load_status(args.response_file))
        print("PASS: bounded public v2 read service returned sanitized ALLOW_READ")
        print("Binding release readiness: " + result["release_readiness"])
        counts = "; ".join(f"{field}={result['binding_summary'][field]}" for field in sorted(SUMMARY_FIELDS))
        print("Observed bindings: " + counts)
        if not result["all_binding_gates_clear"]:
            print("Binding gates remain unresolved; this route smoke does not authorize their release.")
        if args.summary_file:
            with Path(args.summary_file).open("a", encoding="utf-8") as summary:
                summary.write("### CHLOM mesh public v2 read-route assurance\n\n")
                summary.write("Read service: **PASS — operational, sanitized ALLOW_READ**.\n\n")
                summary.write("Binding release readiness: **" + result["release_readiness"] + "**.\n\n")
                summary.write("Observed bindings: " + counts + ".\n\n")
                summary.write("This smoke validates service availability; it does not clear binding holds or activate Phase 4.\n")
        if args.require_release_ready and not result["all_binding_gates_clear"]:
            raise StatusValidationError("release requires all current binding gates to be clear")
        return 0
    except (StatusValidationError, OSError, RecursionError) as exc:
        message = str(exc) if isinstance(exc, StatusValidationError) else "status validation could not complete safely"
        print("FAIL: " + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
