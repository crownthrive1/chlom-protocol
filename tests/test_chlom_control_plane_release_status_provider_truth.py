from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260905115630_chlom_control_plane_release_status_provider_truth_v1.sql"


class ChlomControlPlaneReleaseStatusProviderTruthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.normalized = " ".join(cls.sql.lower().split())

    def test_projection_uses_governed_provider_readback_registry(self):
        self.assertIn("chlom_protocol.gateway_deployment_versions_v1", self.normalized)
        self.assertIn("g.provider_state='active'", self.normalized)
        self.assertIn("and g.provider_readback", self.normalized)
        self.assertIn("order by g.version desc, g.recorded_at desc", self.normalized)

    def test_projection_no_longer_hard_codes_stale_gateway_claim(self):
        self.assertNotIn("'version','1.2.0'", self.normalized)
        self.assertNotIn("'database_dispatch','public.chlom_api_dispatch_v2(text,jsonb,text)'", self.normalized)
        self.assertIn("v_gateway.evidence->>'gateway_version'", self.normalized)
        self.assertIn("v_gateway.evidence->>'dispatcher_contract'", self.normalized)

    def test_dispatcher_mapping_is_allowlisted_and_existence_checked(self):
        for version in ("v1", "v2", "v3"):
            self.assertIn(
                f"public.chlom_api_dispatch_{version}(text,jsonb,text)",
                self.normalized,
            )
        self.assertIn("to_regprocedure(v_database_dispatch) is not null", self.normalized)
        self.assertIn("'database_dispatch_present',v_dispatch_present", self.normalized)

    def test_projection_fails_closed_without_current_provider_truth(self):
        self.assertIn("'hold_provider_readback_unavailable'", self.normalized)
        self.assertIn("'hold_gateway_version_unresolved'", self.normalized)
        self.assertIn("'hold_dispatcher_unavailable'", self.normalized)
        self.assertIn("'exact_provider_identity_bound'", self.normalized)

    def test_security_and_authority_boundaries_are_preserved(self):
        self.assertIn("stable security definer", self.normalized)
        self.assertIn("set search_path to 'pg_catalog', 'chlom_protocol', 'public'", self.normalized)
        self.assertIn("'external_execution_enabled',false", self.normalized)
        self.assertIn("'external_money_movement'", self.normalized)
        self.assertIn("'legal_title_adjudication'", self.normalized)
        self.assertNotIn("create policy", self.normalized)
        self.assertNotIn("alter role", self.normalized)
        self.assertNotIn("create role", self.normalized)


if __name__ == "__main__":
    unittest.main()
