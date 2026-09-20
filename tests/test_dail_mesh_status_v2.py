import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("dail_mesh_status", ROOT / "scripts" / "verify_dail_mesh_status.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
NOW = datetime(2026, 9, 20, 5, 30, tzinfo=timezone.utc)


def fixture():
    return {
        "contract": "ct.chlom.mesh.status.v2", "service": "ct.chlom.mesh.status.v2",
        "status": "operational", "decision": "ALLOW_READ",
        "release_readiness": "READY_CURRENT_BINDING_SCOPE", "all_binding_gates_clear": True,
        "control_plane": {"operating_state": "production_hot", "fail_closed": True,
                          "d3_human_reserved": True, "no_secret_exposure": True,
                          "no_delete_default": True, "no_money_movement_default": True,
                          "heartbeat_interval_seconds": 300},
        "binding_summary": {"total": 101, "operational": 100, "pending": 0, "held": 0,
                            "degraded": 0, "deactivated": 1, "other": 0},
        "latest_heartbeat": {"state": "hot", "binding_count": 100, "hold_count": 0,
                             "degraded_count": 0, "observed_at": NOW.isoformat()},
        "public_surface": True, "raw_private_evidence_exposed": False, "secret_values_exposed": False,
    }


class DailMeshStatusV2Tests(unittest.TestCase):
    def validate(self, value):
        return MODULE.validate_status(value, now=NOW)

    def test_exact_v2_read_service_and_ready_current_scope_are_distinct_results(self):
        result = self.validate(fixture())
        self.assertIs(result["read_service_operational"], True)
        self.assertIs(result["all_binding_gates_clear"], True)
        self.assertEqual(result["release_readiness"], "READY_CURRENT_BINDING_SCOPE")
        self.assertNotIn("phase4_activated", result)

    def test_binding_holds_are_preserved_without_mislabeling_read_service_failure(self):
        cases = [("degraded", "HOLD_DEGRADED_BINDINGS"), ("held", "HOLD_BINDING_GATES"),
                 ("pending", "PENDING_LIFECYCLE_COMPLETION"), ("other", "REVIEW_UNCLASSIFIED_BINDINGS")]
        for field, readiness in cases:
            with self.subTest(field=field):
                value = fixture()
                value["binding_summary"]["operational"] -= 1
                value["binding_summary"][field] = 1
                value["release_readiness"] = readiness
                value["all_binding_gates_clear"] = False
                result = self.validate(value)
                self.assertEqual(result["release_readiness"], readiness)
                self.assertFalse(result["all_binding_gates_clear"])
                self.assertEqual(result["binding_summary"][field], 1)

    def test_readiness_precedence_matches_authoritative_v2_sql(self):
        value = fixture()
        value["binding_summary"].update(operational=97, held=1, pending=1, other=1)
        value.update(release_readiness="HOLD_BINDING_GATES", all_binding_gates_clear=False)
        self.assertEqual(self.validate(value)["release_readiness"], "HOLD_BINDING_GATES")
        value["binding_summary"].update(operational=96, degraded=1)
        value["release_readiness"] = "HOLD_DEGRADED_BINDINGS"
        self.assertEqual(self.validate(value)["release_readiness"], "HOLD_DEGRADED_BINDINGS")
        value = fixture()
        value["latest_heartbeat"]["hold_count"] = 1
        value.update(release_readiness="HOLD_BINDING_GATES", all_binding_gates_clear=False)
        self.assertFalse(self.validate(value)["all_binding_gates_clear"])

    def test_no_green_readiness_when_counters_report_unresolved_gates(self):
        value = fixture()
        value["binding_summary"].update(operational=99, held=1)
        with self.assertRaises(MODULE.StatusValidationError):
            self.validate(value)
        value["release_readiness"] = "HOLD_BINDING_GATES"
        with self.assertRaises(MODULE.StatusValidationError):
            self.validate(value)
        value["all_binding_gates_clear"] = 0
        with self.assertRaises(MODULE.StatusValidationError):
            self.validate(value)

    def test_service_degradation_old_contracts_and_guardrail_failures_fail_closed(self):
        mutations = [
            lambda v: v.update(contract="ct.chlom.mesh.status.v1"),
            lambda v: v.update(status="ok", decision="ALLOW"),
            lambda v: v.update(status="degraded", decision="HOLD_SERVICE"),
            lambda v: v.update(public_surface=1),
            lambda v: v.update(secret_values_exposed=True),
            lambda v: v.update(raw_private_evidence_exposed=True),
            lambda v: v["control_plane"].update(fail_closed=False),
            lambda v: v["control_plane"].update(d3_human_reserved=False),
            lambda v: v["control_plane"].update(no_secret_exposure=False),
            lambda v: v["control_plane"].update(no_delete_default=False),
            lambda v: v["control_plane"].update(no_money_movement_default=False),
            lambda v: v["latest_heartbeat"].update(state="cold"),
            lambda v: v["latest_heartbeat"].update(degraded_count=1),
        ]
        for mutate in mutations:
            value = fixture()
            mutate(value)
            with self.assertRaises(MODULE.StatusValidationError):
                self.validate(value)

    def test_counts_reject_booleans_negative_overflow_and_impossible_disjoint_totals(self):
        for count in (True, -1, 1.0, "1", MODULE.MAX_SAFE_INTEGER + 1):
            value = fixture()
            value["binding_summary"]["held"] = count
            with self.assertRaises(MODULE.StatusValidationError):
                self.validate(value)
        for section, field, count in [("binding_summary", "total", 0), ("binding_summary", "other", 102),
                                      ("binding_summary", "deactivated", 2), ("latest_heartbeat", "hold_count", 101)]:
            value = fixture()
            value[section][field] = count
            with self.assertRaises(MODULE.StatusValidationError):
                self.validate(value)

    def test_known_overlapping_sql_classifications_are_not_forced_into_a_partition(self):
        value = fixture()
        # One non-operational row whose state contains both "pending" and "hold".
        value["binding_summary"].update(operational=99, held=1, pending=1)
        value.update(release_readiness="HOLD_BINDING_GATES", all_binding_gates_clear=False)
        self.assertFalse(self.validate(value)["all_binding_gates_clear"])
        self.assertGreater(sum(value["binding_summary"][name] for name in MODULE.SUMMARY_FIELDS - {"total"}),
                           value["binding_summary"]["total"])

    def test_undercoverage_cannot_hide_bindings_or_claim_ready(self):
        for readiness, held in [("READY_CURRENT_BINDING_SCOPE", 0), ("HOLD_BINDING_GATES", 1)]:
            with self.subTest(readiness=readiness):
                value = fixture()
                value["binding_summary"].update(operational=0, held=held)
                value.update(release_readiness=readiness, all_binding_gates_clear=held == 0)
                with self.assertRaisesRegex(MODULE.StatusValidationError, "do not cover the current total"):
                    self.validate(value)
        value = fixture()
        value["binding_summary"]["operational"] = 99
        with self.assertRaisesRegex(MODULE.StatusValidationError, "do not cover the current total"):
            self.validate(value)

    def test_stale_future_and_naive_heartbeats_fail(self):
        values = [(NOW - timedelta(seconds=901)).isoformat(), (NOW + timedelta(seconds=61)).isoformat(),
                  NOW.replace(tzinfo=None).isoformat(), "not-a-date", None]
        for observed in values:
            value = fixture()
            value["latest_heartbeat"]["observed_at"] = observed
            with self.assertRaises(MODULE.StatusValidationError):
                self.validate(value)
        value = fixture()
        value["latest_heartbeat"]["observed_at"] = (NOW - timedelta(seconds=900)).isoformat()
        self.assertEqual(self.validate(value)["heartbeat_age_seconds"], 900)

    def test_nested_secrets_and_unknown_fields_are_rejected_without_echoing_data(self):
        for value in [dict(fixture(), private_notes={"Access-Token": "sensitive-marker"}),
                      dict(fixture(), private_evidence="sensitive-marker")]:
            with self.assertRaises(MODULE.StatusValidationError) as result:
                self.validate(value)
            self.assertNotIn("sensitive-marker", str(result.exception))
        value = fixture()
        value["control_plane"]["source_document"] = "sensitive-marker"
        with self.assertRaises(MODULE.StatusValidationError):
            self.validate(value)

    def test_bounded_parser_rejects_duplicate_fields_non_json_and_oversize(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "response.json"
            for raw in [b'{"contract":"a","contract":"b"}', b"not-json", b"\xff", b" " * (MODULE.MAX_RESPONSE_BYTES + 1)]:
                path.write_bytes(raw)
                with self.assertRaises(MODULE.StatusValidationError):
                    MODULE.load_status(path)

    def test_cli_smoke_reports_hold_and_strict_release_mode_fails_without_leaking(self):
        value = fixture()
        value["latest_heartbeat"]["observed_at"] = datetime.now(timezone.utc).isoformat()
        value["binding_summary"].update(operational=99, held=1)
        value.update(release_readiness="HOLD_BINDING_GATES", all_binding_gates_clear=False)
        with tempfile.TemporaryDirectory() as directory:
            path, summary = Path(directory) / "response.json", Path(directory) / "summary.md"
            path.write_text(json.dumps(value), encoding="utf-8")
            output, errors = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(MODULE.main([str(path), "--summary-file", str(summary)]), 0)
                self.assertEqual(MODULE.main([str(path), "--require-release-ready"]), 1)
            self.assertIn("held=1", output.getvalue())
            self.assertIn("HOLD_BINDING_GATES", summary.read_text())
            self.assertIn("does not clear binding holds", summary.read_text())

    def test_workflow_checks_out_and_uses_versioned_service_validator(self):
        workflow = (ROOT / ".github/workflows/dail-phase4-assurance.yml").read_text()
        smoke = workflow.split("  public-status-route-smoke:", 1)[1]
        self.assertIn("actions/checkout@v4", smoke)
        self.assertIn("python scripts/verify_dail_mesh_status.py", smoke)
        self.assertNotIn("ct.chlom.mesh.status.v1", smoke)
        self.assertNotIn("--location", smoke)
        self.assertNotIn("--require-release-ready", smoke)


if __name__ == "__main__":
    unittest.main()
