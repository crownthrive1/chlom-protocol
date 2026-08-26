# CHLOM™ — Phase 3 Governed Protocol

**CHLOM — Compliance Hybrid Licensing and Ownership Model** is CrownThrive's governed rights, authority, evidence, licensing, compliance, and remedy layer for **Rights, Rules, Roles, Revenue, Records, and Remedies**.

> **Source-of-truth rule:** CrownThrive OS governs CrownThrive-wide institutional state. This repository is authoritative for the exact CHLOM component scope recorded here. Mintlify, websites, and other publication surfaces are downstream OS projections and do not override the OS or this repository's current component records.

## Current Phase 3 posture

The former “Phase 2 foundation / pre-alpha” label is historical and no longer describes this repository as a whole. Current Phase 3 material includes executable services, integration-mesh governance, runtime-certification records, software-factory assets, public-safe evidence, and the **Phase 3 Bounded-Write Certification v3** contract.

Current evidence records `thrivetools_seo:audits.create` as `verified_write` within its exact governed operation scope. Other provider lanes remain candidate or blocked until their required certification evidence exists. A service-level write gate never grants provider-wide authority.

See:

- [`services/phase3-bounded-write/README.md`](services/phase3-bounded-write/README.md)
- [`services/phase3-bounded-write/TEST_EVIDENCE.md`](services/phase3-bounded-write/TEST_EVIDENCE.md)
- [`docs/architecture/INTEGRATION_RUNTIME_CERTIFICATION.md`](docs/architecture/INTEGRATION_RUNTIME_CERTIFICATION.md)
- [`registry/integration-runtime-certification.json`](registry/integration-runtime-certification.json)

## CHLOM Pentafabric™

CHLOM operates through five interoperable layers:

1. **Identity & Imprint** — identity, provenance, custody, authorship/ownership evidence, Fingerprint context, and Cultural Imprint handoffs.
2. **Rights & Conditions** — rights, rules, roles, DLA, issuer authority, permissions, restrictions, conditions, revocation, and remedies.
3. **Ledger & Assurance** — DAIL evidence, attestations, audits, disputes, corrections, holds, appeals, and certification.
4. **Execution & Interoperability** — services, components, frameworks, skills, APIs, MCPs, SDKs, webhooks, agents, factories, verifiers, provider adapters, and mesh routes.
5. **Economy & Distribution** — governed economic activation, licensing, entitlements, royalties, commissions, settlement, distribution, and support within separately proven authority.

Technical capability, provider availability, deployment, certified write scope, economic authority, licensing authority, and D3/sovereign authority remain separate state dimensions.

## Six canonical functions

1. **Rights** — assets, versions, provenance, authority, permissions, restrictions, and controlled uses.
2. **Rules** — policies, conditions, eligibility, risk, compliance, and approval requirements.
3. **Roles** — organizations, actors, delegated authority, quorum, and separation of duties.
4. **Revenue** — fees, allocations, royalties, commissions, holds, adjustments, and reconciliation where separately authorized.
5. **Records** — DAIL events, evidence references, approvals, versions, agreements, certification receipts, and audit history.
6. **Remedies** — disputes, holds, corrections, suspensions, revocations, appeals, compensation/rollback, and restoration.

## Canonical terminology

- **DLA** = Dynamic Licensing Asset.
- **DAIL** = Decentralized Autonomous Information Ledger.
- Historical **Decentralized Licensing Authority** responsibilities are represented through Licensing Stewardship / Issuer Authority rather than an autonomous authority claim.
- Historical DAL meanings are separated among DAIL, case management, identity/attestations, and revenue allocation.

Historical documents preserve their original terminology and effective context. Current use follows active OS/CHLOM canon.

## CIE interoperability

CHLOM and the **Cultural Imprint Engine (CIE)** are interoperable, not interchangeable.

- CIE governs cultural meaning, narrative continuity, representation, imprint identity, aesthetics, audience/canon constraints, and responsible reuse.
- CHLOM governs rights, rules, roles, licensing conditions, evidence, records, economic authority, and remedies.
- Neither layer may manufacture the other's authority.

## Repository map

```text
registry/            public-safe machine registries and certification state
schemas/             versioned JSON Schemas
services/            executable/runtime/service contracts and evidence
migrations/          governed data/runtime migrations
scripts/             validation, certification, and compliance tooling
.github/             CI, monitoring, governance, and change-control workflows
docs/                architecture, papers, current/historical doctrine, archive
help-center/         recovered-title taxonomy and reconstruction policy
tests/               automated validation tests
artifacts/            retained formal/research artifacts and historical packages
```

## Current state vs. history

Prior papers, Phase 2/2.5 material, old architecture generations, and research artifacts are preserved for lineage. Historical visibility does not make those records current operational instruction.

Use [`docs/archive/README.md`](docs/archive/README.md) for archive/supersession rules. Current Phase 3 component truth is determined from active registries, effective contracts, executable service state, test evidence, and CrownThrive OS governance.

## Licensing

CHLOM is proprietary CrownThrive intellectual property except where a specific file or third-party dependency states another license. Public visibility is not an open-source, model-training, commercial-reuse, certification, trademark, or derivative-system license.

Read [`LICENSE`](LICENSE). Technical ability to clone, inspect, call, or integrate does not equal permission or institutional authority.

## Validation

```bash
python -m pip install -r requirements-dev.txt
python scripts/validate_registry.py
python scripts/validate_integration_mesh.py
python -m unittest discover -s tests -v
```

## Governance

- CrownThrive OS governs institution-wide state and release lineage.
- CHLOM records govern exact CHLOM scope subject to OS authority.
- D3/new sovereign authority remains human-reserved unless separately changed through governing process.
- `HOLD` is never converted to `PASS` by documentation, versioning, or generated output alone.
- No agent, factory, provider, or contributor may self-manufacture authority.

**Owner:** CrownThrive, LLC  
**Contact:** contact@crownthrive.com

**Phase 3 is operational. CHLOM certification remains evidence-by-evidence and operation-by-operation.**
