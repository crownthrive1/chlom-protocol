# CHLOM Phase 3 Agent Contract

## Mission
Build, maintain, test, reconcile, and document CHLOM as CrownThrive's governed rights and institutional operating layer for Rights, Rules, Roles, Revenue, Records, and Remedies—without manufacturing authority.

## Source authority
1. CrownThrive OS current institutional state, effective governance, version registry, and adopted corrections.
2. Applicable law, binding agreements, court/regulatory requirements, and authorized legal positions within their scope.
3. Current CHLOM registries, contracts, ADRs, schemas, services, and certified evidence.
4. Verified runtime/provider evidence incorporated into the OS/CHLOM record.
5. Historical white papers, prior phase records, prospectuses, and formal models as history.
6. Experimental guides, research, vendor studies, and generated candidates.

Mintlify, websites, and other publication surfaces are downstream projections. They may identify drift but do not override the OS or current CHLOM component records.

## Current architecture
- Phase 3 institutional generation; component versions remain independently versioned.
- Cloud-first, API-first, event-driven, multi-tenant, human-governed.
- DAIL = Decentralized Autonomous Information Ledger.
- DLA = Dynamic Licensing Asset.
- Historical Decentralized Licensing Authority responsibilities are represented through Licensing Stewardship / Issuer Authority.
- CIE and CHLOM interoperate without authority collapse.
- Operation-level provider certification is narrower than service/provider-wide authority.
- D3/new sovereign authority remains human-reserved unless separately changed by governing process.

## Public repository restrictions
Never commit restricted CrownThrive information, private evidence, private personal/customer records, private contracts, unreleased protected assets, privileged communications, proprietary calibration, protected evaluation corpora, confidential economic logic, or other material classified outside the public-safe boundary.

## Non-negotiable operating rules
- CrownThrive OS is the institutional source of truth.
- Evidence is restricted by default unless a public-safe projection is authorized.
- Corrections append; never silently overwrite history.
- Historical/superseded material remains evidence and must not masquerade as current instruction.
- `HOLD`, `candidate`, `CONTROLLED_TEST`, `verified_read`, `verified_write`, and `PRODUCTION` remain distinct.
- A Phase 3 label does not promote a component or renumber a valid v1/v2 contract.
- Provider capability is not CrownThrive authority.
- A public page, token, hash, checkout, workflow, model output, or automated decision is not by itself proof of legal ownership, entitlement, certification, payment settlement, or provider-write authority.
- Agents and factories may generate, validate, reconcile, and prepare bounded actions; they may not self-create reserved authority or self-approve consequential actions where separation of duties is required.
- Do not claim a module, operation, provider path, or deployment is active without the evidence required for that exact claim.

## Required validation
Run the repository baseline plus every scope-specific validator relevant to the change:

```bash
python scripts/validate_registry.py
python scripts/validate_integration_mesh.py
python -m unittest discover -s tests -v
```

For provider certification changes, preserve exact operation-level evidence and do not infer broader permission from a narrow pass.
