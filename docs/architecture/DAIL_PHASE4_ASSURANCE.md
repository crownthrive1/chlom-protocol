# DAIL Phase 4 Assurance

**Current institutional phase:** Phase 3 — Execute

**Target institutional phase:** Phase 4 — Verify

**Target state:** HOLD

**Hot state:** PRODUCTION_HOT_BOUNDED

**Internal hot ledger:** PRODUCTION_HOT_BOUNDED

**Public hot status route:** PASS

**Authenticated control route:** HOLD_AUTHORITY_AND_ACTOR_BOUND_IDEMPOTENCY_REQUIRED

**Cold state:** LEDGER_LINEAGE_RECOVERY_VERIFIED

**Cold assurance:** BOUNDED_COLD_ASSURANCE_ONLY

## Decision

DAIL—the **Decentralized Autonomous Information Ledger**—has a bounded production-hot ledger implementation. The read-only public CHLOM mesh status route and the restricted internal ledger data plane passed their dated production readbacks. A private, payload-free snapshot of a frozen ledger prefix also passed byte-exact provider readback, isolated non-production lineage reconstruction, hash and linkage verification, and tamper rejection. The separate authenticated public control-request route is not certified working: Edge v2 is JWT-gated and intentionally returns a fail-closed hold before parsing or persisting a request because accepted principal scope and actor/request-bound idempotency are absent.

This establishes a working bounded internal hot ledger data plane, a working read-only public status route, and a bounded cold **ledger-lineage** route. It does not establish a working public control-request route, complete data-bearing backup, PostgreSQL or PITR restore, cold standby, infrastructure failover, failback, unrestricted public ledger, or institutional Phase 4 activation.

Phase 3 remains CrownThrive's current institutional generation. Phase 4 remains an assurance target under HOLD until every required predicate in [the DAIL Phase 4 assurance manifest](../../developers/manifests/dail-phase4-assurance.v1.json) is independently evidenced and CrownThrive OS separately authorizes the institutional transition.

## Canonical scope

DAIL owns CHLOM's Records function:

- governed event and state-change lineage;
- evidence references and provenance;
- approvals, receipts, versions and agreements;
- append-only corrections and supersession links;
- integrity hashes and audit history;
- recovery and verification receipts.

DAIL evidence is evidence in context. A hash, event, receipt, signature, external anchor, or immutable storage claim does not independently create legal truth, ownership, rights, provider authority, entitlement, or D3 authority.

## Evidence-backed current state

| Surface | Current state | Claim ceiling |
| --- | --- | --- |
| Internal hot ledger data plane | PRODUCTION_HOT_BOUNDED; bounded readback PASS | Restricted append-oriented production evidence within the documented CHLOM runtime; not a public control-request path or the complete Phase 4 hot-API predicate |
| Post-hardening bounded chain readback | PASS at 2,761 events on 2026-08-27T00:02:09.625541Z; zero failures; integrity `pass_with_documented_legacy_correction` | Dated moving-head readback; not a perpetual or independent Phase 4 certificate |
| CHLOM mesh public status | Edge function v4 deployed with a fail-closed aggregate allowlist; GET returned 200 three times; POST returned 405; database status RPC restricted to application service role plus the PostgreSQL administrative owner | Public-safe aggregate status is not unrestricted DAIL append or control authority |
| CHLOM mesh authenticated control request | `HOLD_AUTHORITY_AND_ACTOR_BOUND_IDEMPOTENCY_REQUIRED`; Edge v2 is active, JWT verification is enabled, and the function performs no database call or body persistence | Anonymous and invalid-token probes return 401; no authenticated action-request path is certified working |
| Cold ledger-lineage route | LEDGER_LINEAGE_RECOVERY_VERIFIED; BOUNDED_COLD_ASSURANCE_ONLY | Payload-free lineage reconstruction only; not recovery of record bodies or the database data plane |
| Evidence custody | Private Drive package and manifest passed exact readback and hash verification | One verified lineage-artifact custody route is not a complete encrypted DAIL export in two failure domains |
| Source reconstruction | Bounded assurance controls deployed; complete source custody remains incomplete | Production application/readback of bounded controls does not establish complete reproducible source custody |
| Cold data restore | Not certified | No complete data-bearing DAIL export has been restored into isolated PostgreSQL 17 |
| Infrastructure failover | Not certified | Public fallback URLs and reachability monitoring do not prove database, ledger, runtime, or provider failover |
| Phase 4 | HOLD | No component or document may self-activate an institutional phase |

The public-safe hot evidence is recorded in:

- crownthrive1/CrownThrive-OS/runtime/chlom-mesh-control/PRODUCTION_RECEIPT_2026-08-26_v1.md;
- crownthrive1/CrownThrive-OS/developers/manifests/chlom-mesh-failover.v1.json;
- crownthrive1/CrownThrive-OS/runtime/melanated-institutionalization/RECEIPT_2026-08-26_wave2.json.

The public-safe, machine-readable receipt for the current hot repair and bounded cold drill is [artifacts/receipts/dail-phase4-assurance-production-evidence-2026-08-26.v1.json](../../artifacts/receipts/dail-phase4-assurance-production-evidence-2026-08-26.v1.json).

## Verified production and recovery receipt

The production readback at `2026-08-26T23:47:21Z` checked 2,756 events with zero failures. Its head was `3e942b3f6d851dd9c56bc507eeee40c8bd10d70ff16600deb1ebd98dc85f034c`; the verifier reported `pass_with_documented_legacy_correction`. A later post-hardening readback at `2026-08-27T00:02:09.625541Z` checked 2,761 events with zero failures and head `15cb005688665fb9d4c2f709f2c31740d17b5d79f39fb04c09645cd9ddb8b7bb`. These are dated moving-head observations, not timeless head commitments.

Checkpoint `89fd5b43-2b65-483c-a700-90c4a8951612` froze a payload-free lineage prefix of 2,746 events through sequence 3,042 with head `e7621d81b9b7eb5622a42a93add1c995f2533aceed4734af1c714354956e2f99`. The checkpoint receipt SHA-256 is `679d52d82b9974b3e506c79448cf96152b4d4179680d97dfa3c5a9568196c0d1`.

The private Drive custody objects were read back byte-for-byte:

- package object `1nB3RTe_8gtLESuD8PURD7TogCr-X_Hn_`, SHA-256 `48b0f0decd4bd48890f2d3567b663db09af460f9e5cac0ce996b97deb38d9b37`;
- manifest object `1gKgWKG7AR-hpNV1iFKGP-n9XNicvfAdQ`, SHA-256 `36bfb643150504ff2ba46612ffbb4aea2bc8c81e04508dab1075f1be0f17c564`.

Recovery drill `1746cdda-db6d-4d3a-a747-927c59b00061` reconstructed that lineage package in an isolated non-production target. Manifest, package, component, parse, and physical chain-link checks passed; a tampered link was rejected. The provider-exit path was verified for this lineage artifact, and the production-hot ledger and read-only status route remained unchanged. Observed RPO was 419 seconds. Observed local RTO was 0.130590 seconds and is conservatively recorded as 1 second.

The hardened verifier requires an independently supplied snapshot SHA-256 because the payload-free artifact cannot recompute event hashes from excluded record fields. At `2026-08-27T00:08:33.078719Z`, source SHA-256 `27a747da79a69830e86bbd497af30a9add4413ce43b8ba66d7e62bf14cd0cb19` replayed the real snapshot against its external anchor and passed all type, timestamp, boundary, correction-count, linkage, and limitation checks. Supplying a hash derived only from an untrusted snapshot would not constitute an independent anchor.

Those timings describe one bounded lineage drill. They do not satisfy the Phase 4 RPO/RTO predicate, which requires three independently timed data-plane drills, nor do they certify production failover or failback.

## Hot and cold are different claims

The bounded hot route is the restricted internal DAIL data plane. It accepts governed appends, preserves chain lineage, supports verification, and participates in bounded CHLOM mesh workflows. The public hot surface evidenced here is a separate read-only aggregate status route; the authenticated public control-request route remains fail-closed.

The current cold route is a verified payload-free ledger-lineage reconstruction path, not a data-bearing restorable standby:

~~~text
hot DAIL
  -> freeze a payload-free ledger prefix
  -> private custody package and manifest
  -> exact off-provider readback
  -> isolated lineage reconstruction and tamper test
  -> verify production hot remains unchanged
  -> HOLD before full data restore or traffic promotion
~~~

The exact cold state is:

~~~text
LEDGER_LINEAGE_RECOVERY_VERIFIED
~~~

The following terms are prohibited until the corresponding evidence exists:

- cold standby;
- restore certified;
- failover certified;
- PITR verified;
- active-active;
- active-passive ready;
- Phase 4 active.

## Source and recovery state

The current source includes bounded DAIL assurance controls:

- migrations/20260826_dail_phase4_assurance_v1.sql adds protected cold-checkpoint and recovery-drill receipt controls without replacing the existing hot append and chain-verification functions; its production application and bounded readback are verified;
- migrations/20260826_chlom_mesh_status_service_role_hardening_v1.sql restricts application execution of the database status RPC to `service_role`, while `postgres` remains the administrative owner role; its production application and privilege readback are verified;
- migrations/20260826_dail_checkpoint_receipt_link_index_v1.sql covers the append-only checkpoint receipt-chain foreign key; its production application cleared the corresponding unindexed-foreign-key advisory without opening a data route;
- migrations/20260827_dail_hash_delimiter_hardening_v1.sql adds a validated production constraint that rejects ambiguous pipe characters in every free-text event-hash input while leaving the deployed v1.1.0 hash formula unchanged;
- supabase/functions/chlom-mesh-status/index.ts is the source-controlled public-safe Edge function deployed as version 4; it treats service-role RPC data as untrusted and returns only a fixed aggregate allowlist;
- supabase/functions/chlom-mesh-control/index.ts is deployed as version 2 and fails closed before parsing a request body or calling the database; the control-request path remains held until principal scope and actor/request-bound idempotency are implemented and verified;
- tests/test_dail_phase4_migration.py checks additive, append-only, least-privilege, and phase-boundary properties;
- services/dail_v1/ provides a storage-neutral reference for deterministic hashing, idempotency, correction lineage, full-chain verification, and sanitized receipt export;
- tests/test_dail_v1.py tests the portable reference and its receipt-export behavior;
- scripts/verify_dail_lineage_snapshot.py validates the payload-free snapshot and materializes the isolated lineage reconstruction.

The deployed assurance migration, service-role hardening migration, and Edge function have production readback. Complete source custody for every production DAIL table, dependency, grant, policy, trigger, scheduler, extension, and configuration remains incomplete, so the Phase 4 source-custody predicate remains unmet.

The portable receipt export deliberately excludes event payloads, actors, raw secrets, and protected evidence bodies. That is a valuable least-data integrity artifact, but it cannot reconstruct the complete DAIL PostgreSQL data plane. A receipt materialization test must never be reported as the required PostgreSQL 17 data restore.

## Phase 4 activation predicates

All ten predicates are mandatory and combine with logical AND. UNKNOWN, partial evidence, a deny, a failed test, or a missing independent receipt leaves the gate at HOLD.

| Predicate | Measurable minimum | Current state |
| --- | --- | --- |
| Hot API | Authenticated append/readback/verify/correction/health; 10,000-event isolated load; p95 ≤ 500 ms; 100 safe production canaries; zero unexpected errors, duplicate appends, or chain failures; 24-hour observation | Bounded internal ledger and read-only status readbacks PASS; public control path held and full predicate incomplete |
| Source custody | Complete tables/indexes/constraints/triggers/functions/grants/RLS/schedulers/extensions/config inventory; zero source gaps or production/source digest mismatches; clean PG17 build | Bounded controls deployed; complete custody incomplete |
| Independent conformance | Separate implementation and principal recompute the complete chain; checked count equals source count; zero sequence, hash, link, replay, or correction-lineage failures before and after restore | Frozen lineage prefix verified; full independent conformance not verified |
| Encrypted data export | Complete DAIL rows and dependencies; approved authenticated encryption; plaintext/ciphertext/schema hashes; row count and head hash; two off-provider failure domains; independent download/decrypt readback | Payload-free lineage package only; no data-bearing export |
| Isolated PG17 restore | Fresh network-isolated PostgreSQL 17; no source connection; exact row/sequence/head match; zero chain failures or schema gaps; RLS/grant/trigger and append/idempotency/correction tests | Isolated lineage reconstruction passed; full data restore not performed |
| RPO/RTO | RPO ≤ 15 minutes; RTO ≤ 60 minutes; at least three independently timed drills within 30 days; no loss beyond RPO | One bounded lineage drill: RPO 419 s, RTO recorded 1 s; predicate still HOLD |
| Failover/failback | At least three primary-outage drills; writer fencing; zero split-brain interval, duplicates, or sequence gaps; successful cold append/readback; reconciled failback and final zero-failure chain verification | Not certified |
| External anchoring | Signed or attested head commitment at least hourly to two independent failure domains; 24 consecutive verified anchors; tamper and provider-exit readback; no raw record body | Not deployed |
| CI | Registry, full unit, DAIL conformance, migration safety, schema/privilege drift, isolated restore, secret, dependency, and static-security checks; three protected-main passes; zero bypasses | Local tests only / partial |
| Security | Current threat model; independent review; zero open Critical/High findings; forced RLS; zero client direct-write grants; hardened security-definer functions; escalation/leak/key-separation/incident tests | Partial controls; no Phase 4 certificate |

The machine-readable thresholds are authoritative for this component gate.

## Required data-bearing recovery package

The cold recovery package must include enough protected data and source to rebuild the DAIL service without contacting the failed hot database:

1. complete DAIL event rows and correction lineage;
2. required identity, schema-version, and dependency rows;
3. exact schema, indexes, constraints, triggers, functions, grants and RLS state;
4. extension and configuration prerequisites;
5. export timestamp, source event count, sequence boundaries, and head hash;
6. plaintext manifest hash and encrypted-package hash;
7. opaque custody references for at least two independent failure domains;
8. recovery authority, retention, key-separation, and destruction rules;
9. independent verification and restore-receipt formats.

Raw keys, credentials, access grants, folder paths, and protected evidence bodies not required for recovery remain outside public source. Public receipts may carry an opaque private-object identifier and its content hash; the identifier does not confer read access.

## Isolated restore sequence

~~~text
freeze source prefix
  -> verify hot chain
  -> export complete required data and schema
  -> hash manifest and encrypt package
  -> read back from independent custody
  -> create fresh isolated PostgreSQL 17
  -> restore without source connectivity
  -> compare counts, sequence boundaries and head
  -> independently verify the full chain
  -> run access, mutation, idempotency and correction tests
  -> record RPO/RTO and immutable drill receipt
  -> remain HOLD until all other predicates pass
~~~

## Failover and failback contract

Failover must fence the hot writer before any cold writer can accept traffic. The promoted environment must prove the expected head and append one governed canary before ordinary routing is considered. Failback must reconcile both sides, prove there was no split brain, preserve every accepted event, and end with a complete independent chain verification.

If fencing, head identity, authority, credentials, data freshness, or reconciliation is uncertain, failover aborts and the system remains read-only or unavailable. Availability pressure does not authorize ledger divergence.

## External anchoring

Phase 4 anchoring publishes only a public-safe commitment:

- DAIL identity and version;
- sequence or checkpoint identifier;
- head hash;
- timestamp;
- signature or governed attestation.

No public blockchain is required. An independent WORM store, timestamping service, transparency log, or other separately administered provider can satisfy the architecture if it passes the stated availability, custody, verification, and provider-exit tests.

## Activation authority

When all ten DAIL predicates pass, the result is **DAIL Phase 4 readiness evidence**. It is not the CrownThrive institutional phase transition.

Institutional Phase 4 requires a separate canonical CrownThrive OS record, current-state reconciliation, release/version decision, archive impact review, and public-safe documentation projection. D3 and other human-reserved actions remain human-reserved.

## September 20 public status-contract maintenance

The public mesh endpoint currently implements `ct.chlom.mesh.status.v2`: `status=operational` and `decision=ALLOW_READ` establish read-service health. Its `release_readiness` and `all_binding_gates_clear` separately describe binding gates. A working public read route can truthfully report `HOLD_BINDING_GATES`, `PENDING_LIFECYCLE_COMPLETION`, `HOLD_DEGRADED_BINDINGS`, or `REVIEW_UNCLASSIFIED_BINDINGS`. None of these is a release approval.

The **Public v2 read-service contract smoke** job now uses `scripts/verify_dail_mesh_status.py` instead of the historical inline v1 validator. It requires HTTP 200 without following redirects, the exact public v2 field allowlist, fail-closed and human-reserved control flags, bounded integer counts, a hot heartbeat no older than 15 minutes (three currently configured 300-second intervals), and no credential fields or raw-evidence exposure. It derives readiness using the deployed database's precedence and rejects contradictory `release_readiness` or `all_binding_gates_clear`. Its summary preserves the actual held, pending, degraded, deactivated and other counts. The v2 SQL classification can overlap for state names containing both `pending` and `hold`; the validator does not invent a mutually exclusive partition.

A PASS from this job means **the sanitized read-service contract passed**. It does not clear binding gates, certify full DAIL recovery, grant execution authority, or activate institutional Phase 4. A consumer requiring cleared bindings can additionally use `--require-release-ready`; that option fails whenever current binding gates remain unresolved. Service degradation, stale heartbeat, malformed response, secrecy failures and contradictory readiness always fail the smoke itself.

Read-only provider inspection on 2026-09-20 confirmed the deployed `chlom-mesh-status` Edge Function is version **8**, with bundle SHA-256 `01993f6718e86b1a17623b38b914167d5529c4699c500fd4e6c0530e3601e4ee`. Its fixed server-side RPC is `public.chlom_mesh_public_status_v2()`, wrapping `integration_control.chlom_mesh_status_compact_v2()`. The repository's `supabase/functions/chlom-mesh-status/index.ts` still contains the earlier v1 implementation. This is an explicit provider/source custody discrepancy: this maintenance change validates the observed v2 contract and does **not** certify that a checkout reproduces that provider deployment or redeploy the historical edge source.

The source/tag of CHLOM native 1.4.0 remains immutable. This maintenance change follows publication commit `9cafb1eef1ec1ac0961ae33c4da54abb283680fe`; it neither changes the native artifact nor converts a public route check into native runtime acceptance.

The new validator passed a direct HTTP 200 public readback with heartbeat `2026-09-20T05:26:01.150225+00:00`. The observed classification was total 33,349; operational 32,900; pending 157; held 1; degraded 0; deactivated 1; other 290. The receipt retained `release_readiness=HOLD_BINDING_GATES` and `all_binding_gates_clear=false`. No credentials, operator session, database writes or deployment changes were used for this readback.

The deployed binding table's `current_state` is non-nullable, and the v2 SQL `other` category covers all remaining states. Classification counts must therefore sum to at least the total; overlaps may make the sum greater. The validator rejects undercoverage, including an apparently ready response that silently leaves bindings unclassified, while retaining the upper bound for the disjoint operational/deactivated/other categories.
