import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260901014500_pentawire_factory_materialization_guard_v1.sql"),
  "utf8",
);
const deployer = readFileSync(
  resolve(root, "supabase/functions/ct-factory-deployer/index.ts"),
  "utf8",
);

test("PentaWire generator materializes executable fail-closed candidate artifacts", () => {
  for (const marker of [
    "penta_factory_materialize_gap_candidate_v1",
    "generated_manifest",
    "compiler_report",
    "'json_document'",
    "'typescript_module'",
    "'mcp_tool_manifest'",
    "'deno_test'",
    "PENTAWIRE_PROVIDER_ADAPTER_NOT_BOUND",
    "PENTAWIRE_EXACT_EVIDENCE_REQUIRED",
  ]) {
    assert.ok(migration.includes(marker), `missing ${marker}`);
  }

  assert.match(migration, /'exact_evidence_complete',false/);
  assert.match(migration, /'release_permitted',false/);
  assert.match(migration, /'provider_write',false/);
  assert.match(migration, /'money_movement',false/);
  assert.match(migration, /'d3_human_reserved',true/);
  assert.doesNotMatch(migration, /'exact_evidence_complete',true/);
  assert.doesNotMatch(migration, /'independent_certification_complete',true/);
});

test("database claim path terminalizes unresolved PentaWire deploys before worker claim", () => {
  assert.ok(migration.includes("ct_factory_hold_unreleasable_gap_deploys_v1"));
  assert.ok(migration.includes("perform public.ct_factory_hold_unreleasable_gap_deploys_v1(16);"));
  assert.ok(migration.includes("factory.penta_wire.deploy.held"));
  assert.ok(migration.includes("'provider_write_performed',false"));

  const holdCall = migration.indexOf("perform public.ct_factory_hold_unreleasable_gap_deploys_v1(16);");
  const workerClaim = migration.indexOf("select w.id into v_id", holdCall);
  assert.ok(holdCall >= 0 && workerClaim > holdCall, "release hold must execute before claim selection");
});

test("edge deployer independently refuses unresolved exact-evidence gap work before provider actions", () => {
  assert.ok(deployer.includes("pentaWireExactEvidenceHold"));
  assert.ok(deployer.includes('code: "PENTAWIRE_EXACT_EVIDENCE_REQUIRED"'));
  assert.ok(deployer.includes("provider_write_performed: false"));
  assert.ok(deployer.includes("provider_jobs_enqueued: 0"));
  assert.ok(deployer.includes("d3_human_reserved: true"));

  const guard = deployer.indexOf("if (pentaWireExactEvidenceHold(p.requirements))");
  const githubWrite = deployer.indexOf('p_operation: "publish_source_bundle"');
  const adapterWrite = deployer.indexOf("const r = await call", guard);
  assert.ok(guard >= 0 && githubWrite > guard, "PentaWire hold must precede GitHub provider jobs");
  assert.ok(guard >= 0 && adapterWrite > guard, "PentaWire hold must precede provider adapter calls");
});
