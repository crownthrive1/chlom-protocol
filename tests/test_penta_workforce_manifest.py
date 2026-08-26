import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "services" / "penta-workforce-v1"
MIGRATIONS = ROOT / "migrations" / "penta_workforce_os_v1"


class PentaWorkforceManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(
            (SERVICE / "penta-workforce-interface-contract.v1.json").read_text(encoding="utf-8")
        )
        cls.readme = (SERVICE / "README.md").read_text(encoding="utf-8")
        cls.sql = "\n".join(
            (MIGRATIONS / name).read_text(encoding="utf-8")
            for name in (
                "001_tables.sql",
                "002_guardrails.sql",
                "003_bootstrap_registry.sql",
                "004_marks_reconciliation.sql",
            )
        )

    def test_contract_is_production_server_only(self):
        self.assertEqual(self.manifest["state"], "production")
        self.assertEqual(self.manifest["provider"]["exposure"], "server_only")
        self.assertFalse(self.manifest["provider"]["public_api"])
        self.assertTrue(self.manifest["guardrails"]["fail_closed"])

    def test_canonical_authority_chain(self):
        chain = self.manifest["authority_model"]["ordinary_chain"]
        self.assertEqual(
            [(r["name"], r["rank"]) for r in chain],
            [
                ("PentaBoard™", 500),
                ("PentaDirectors™", 400),
                ("PentaManagers™", 300),
                ("PentaCohorts™", 200),
                ("PentaWorkers™", 100),
            ],
        )
        self.assertEqual(chain[0]["issues"], ["directive"])
        self.assertEqual(chain[1]["issues"], ["policy", "sop", "sla"])
        self.assertEqual(chain[2]["issues"], ["contract", "task_order"])

    def test_living_environment_modules_are_institutionalized(self):
        expected = {
            "PentaBoard™",
            "PentaDirectors™",
            "PentaManagers™",
            "PentaCohorts™",
            "PentaAccelerator™",
            "PentaNotes™",
            "PentaTriage™",
            "PentaHealth™",
            "PentaHR™",
            "PentaBenefits™",
            "PentaPay™",
            "PentaCost™",
            "PentaLegal™",
        }
        self.assertTrue(expected.issubset(set(self.manifest["modules"])))

    def test_guardrails_are_fail_closed(self):
        g = self.manifest["guardrails"]
        self.assertFalse(g["money_movement"])
        self.assertFalse(g["medical_decisioning"])
        self.assertFalse(g["protected_health_data"])
        self.assertFalse(g["vote_is_punishment_authority"])
        self.assertFalse(g["pay_self_approval"])
        self.assertFalse(g["lease_reconciliation_inherits_authority"])
        self.assertTrue(g["restrictive_ramifications_require_authority_instrument"])
        self.assertTrue(g["restrictive_ramifications_require_appeal"])
        self.assertTrue(g["manager_contract_requires_target"])
        self.assertTrue(g["cost_hard_cap"])

    def test_trademark_claim_does_not_fake_registration(self):
        mark = self.manifest["trademark"]
        self.assertEqual(mark["owner"], "CrownThrive, LLC")
        self.assertEqual(mark["default_symbol"], "TM")
        self.assertFalse(mark["federal_registration_claimed"])
        self.assertTrue(mark["registered_symbol_requires_verified_registration"])
        self.assertTrue(mark["preserve_penta_mark_in_wrapped_names"])
        self.assertIn("not a USPTO filing", self.readme)

    def test_database_enforces_role_separation_and_cost_cap(self):
        self.assertIn("v_role.role_key = 'penta.role.board'", self.sql)
        self.assertIn("v_role.role_key = 'penta.role.director'", self.sql)
        self.assertIn("v_role.role_key = 'penta.role.manager'", self.sql)
        self.assertIn("manager contract/task order requires a target", self.sql)
        self.assertIn("PentaCost hard limit exceeded", self.sql)
        self.assertIn("PentaPay self-approval is prohibited", self.sql)
        self.assertIn("restrictive ramification must preserve appeal availability", self.sql)

    def test_sensitive_tables_are_private_by_default(self):
        self.assertIn("enable row level security", self.sql)
        self.assertIn("revoke all on table public.%I from anon, authenticated", self.sql)
        self.assertIn("grant all on table public.%I to service_role", self.sql)

    def test_mark_registry_blocks_unverified_registered_symbol(self):
        self.assertIn("registration_number is not null", self.sql)
        self.assertIn("where canonical_name ilike 'Penta%'", self.sql)
        self.assertIn("registration_status='registered'", self.sql)

    def test_manifest_declares_all_21_tables(self):
        self.assertEqual(self.manifest["database"]["table_count"], 21)
        self.assertEqual(len(self.manifest["database"]["tables"]), 21)


if __name__ == "__main__":
    unittest.main()
