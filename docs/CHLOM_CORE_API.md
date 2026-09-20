# CHLOM core API

Application adapter version: **1.3.0**. Canonical dispatcher: `public.chlom_api_dispatch_v3`.

CHLOM is the rights, rules, roles, revenue, records and remedies infrastructure. LEX is one application of that infrastructure. This API connects the CHLOM console to the existing authenticated core and its public projections. It does not substitute a local simulation for the production dispatcher.

## Routes

All routes use `/api/core?route=NAME` on the application's own HTTPS origin.

| Route | Method | Input | Result |
| --- | --- | --- | --- |
| `health` | GET | None | Adapter version and backend configuration state; this is not a runtime readiness certificate. |
| `status` | GET | None | Allowlisted protocol, control-plane, wallet and mesh summaries with per-source availability. |
| `resolve` | GET | `id=ctid_` followed by 32 lowercase hexadecimal characters | Public identity, public verification-key fields and up to 25 public lineage entries. |
| `session` | GET | Browser cookies or user bearer | `{ok:true,user:{id,email}}`, or a null user for an anonymous browser. |
| `signin` | POST | `{email,password}` | Creates this browser's core session; does not create an operator assignment. |
| `refresh` | POST | `{}` | Rotates the provider session and core cookies. |
| `logout` | POST | `{}` | Revokes the current provider session when reachable and always removes local core cookies. A provider failure is returned explicitly. |
| `operator` | GET | Session | The canonical operator capabilities response. |
| `operator` | POST | `{action,payload,idempotency_key}` | Canonical dispatch response and receipt; writes require a stable idempotency key. |

POST bodies must be JSON objects and cannot exceed 64 KiB. Unknown envelope fields are rejected. Responses are never cached. Status sources that fail are returned as `null` with `availability.NAME: "unavailable"`; missing counts are not reported as zero. A partial response has `ok:false` and HTTP 200 when at least one source was obtained; complete source failure returns HTTP 503.

## Authentication and authority

Browser calls use `__Host-chlom-core-access` and `__Host-chlom-core-refresh`: Secure, HttpOnly, SameSite=Strict, host-only cookies. The access cookie lasts at most one hour and the refresh cookie at most seven days. Tokens and passwords are never returned in API JSON or put in browser local storage. Every authenticated request validates the access token with the identity provider; an expired browser access token can be refreshed. Core and LEX cookies are separate.

Every browser POST requires the exact same HTTPS Origin. A non-browser client may call `operator` with `Authorization: Bearer USER_ACCESS_TOKEN` and no Origin header. A supplied bearer is verified directly and never falls back to browser cookies. A service key is not a user access token.

The database requires an active, current operator assignment, the required scope, and the required authority class. Signing in does not grant any of these. The dispatcher supplies the recorded actor, oracle actor, authority class, authority basis, approval reference and correlation identifier from the existing operator assignment. The client cannot manufacture authority by providing those fields.

Only the operations below are exposed. The current upstream capabilities document includes the older `control_plane_canary` name; that action is not implemented by this adapter. Clients should intersect advertised actions with this table. Core account provisioning, operator assignments and changes to authority require the existing authorized administrative process.

| Action | Scope | Minimum authority |
| --- | --- | --- |
| `status`, `capabilities` | `chlom:read` | D0 |
| `register_asset_binding` | `chlom:write` | D1 |
| `record_ownership_interest` | `chlom:write` | D2 |
| `record_rights_instrument` | `chlom:write` | D2 |
| `record_dla` | `chlom:write` | D2 |
| `record_lex_offer` | `chlom:write` | D2 |
| `record_agreement_entitlement` | `chlom:write` | D2 |
| `record_obligation` | `chlom:write` | D2 |
| `record_revenue_policy` | `chlom:write` | D2 |
| `preview_settlement` | `chlom:settlement-preview` | D2 |
| `register_token_candidate` | `chlom:token-candidate` | D2 |
| `report_oracle_signal` | `chlom:oracle` | D1 |
| `bind_dail_proof` | `chlom:proof` | D1 |

The `chlom:*` scope is also recognized by the canonical dispatcher. Authority is checked for each dispatch; showing an action in a menu does not authorize it.

## Request and retry contract

For read actions, send `{"action":"capabilities","payload":{}}` or `{"action":"status","payload":{}}`. Do not include an idempotency key or nonempty payload for either read action.

For every other action, use a stable key with 16–128 characters from `A-Z a-z 0-9 . _ : -`. Send it as `idempotency_key` in the JSON envelope or the `Idempotency-Key` HTTP header. When both are present, they must match. A retry must preserve the same key, action and payload. A changed request must use a new key. The canonical database locks and records requests per authenticated operator, returns completed exact replays, and rejects key reuse with different contents.

The dispatcher limits authenticated mutation requests to 30 per minute per action and reads to 120. The adapter applies an additional per-IP limit of 8 sign-in attempts per minute and 120 requests per minute for each other route. HTTP 429 includes `Retry-After: 60`.

A successful mutation may include `request_id`, `dispatch_receipt_id`, `result_sha256`, `result`, `receipt_dail`, `idempotency_key`, `idempotency_response_sha256` and `idempotent_replay`. Preserve the original receipt in your private integration log. Interpret the domain result: HTTP 200 alone does not mean a proof is verified, a right is granted, or money has moved.

Errors have `{ok:false,code,error}`. Codes include `AUTHENTICATION_REQUIRED`, `OPERATOR_NOT_ACTIVE`, `SCOPE_DENIED`, `AUTHORITY_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_CONFLICT` (header/body mismatch), `IDEMPOTENCY_CONFLICT` (canonical key reused for another request), `REQUEST_IN_PROGRESS`, `RATE_LIMITED`, `CORE_NOT_CONFIGURED`, `UPSTREAM_UNAVAILABLE` and `UPSTREAM_REJECTED`. Raw SQL diagnostics and provider error bodies are not returned.

## Production payload reference

The following field names were read from the deployed `chlom_protocol.*_v1` functions on 2026-09-20. They describe existing core operations, not a new grant of commercial or legal authority. Required references, enumerated states, relational integrity and current-version constraints remain authoritative in the database. Use real governed identifiers and private evidence references; do not submit example identifiers or invented legal effects.

Common actor/authority fields are supplied by the dispatcher and should be omitted: `recorded_by`, `created_by`, `oracle_subject_id`, `authority_class`, `authority_basis`, `approval_id`, `correlation_id`. Evidence should be private references or digests appropriate to the operation. A public hash is not proof of legal ownership by itself.

| Action | Domain payload fields |
| --- | --- |
| `register_asset_binding` | Required nonempty strings: `canonical_asset_id`, `asset_version_ref`, `asset_class`, `source_system`, `source_ref`; required `fingerprint_sha256` (64 lowercase hex). Optional `binding_state` (default `ASSERTED`), `legal_effect`, `supersedes_binding_id`, `evidence`, `causation_id`. |
| `record_ownership_interest` | `canonical_asset_id`, `asset_version_ref`, `holder_subject_id`, `interest_type`, `share_numerator`, `share_denominator`, `basis_instrument_ref`, `jurisdiction_scope`, `effective_from`, `effective_to`, `interest_state`, `legal_effect`, `supersedes_interest_id`, `evidence`, `causation_id`. |
| `record_rights_instrument` | `instrument_id`, `instrument_version`, `instrument_type`, `canonical_asset_id`, `asset_version_ref`, `grantor_subject_id`, `grantee_subject_id`, `rights_scope`, `excluded_scope`, `territory_scope`, `channel_scope`, `commercial_use`, `exclusive`, `transferable`, `sublicensable`, `valid_from`, `valid_to`, `royalty_policy_id`, `royalty_policy_version`, `instrument_state`, `legal_effect`, `supersedes_instrument_id`, `supersedes_instrument_version`, `evidence`, `causation_id`. |
| `record_dla` | `dla_id`, `dla_version`, `rights_instrument_id`, `rights_instrument_version`, `policy_binding`, `policy_binding_sha256`, `dla_state`, `rights_readiness`, `evidence_readiness`, `offerability_state`, `tokenization_eligibility`, `supersedes_dla_id`, `supersedes_dla_version`, `evidence`, `causation_id`. |
| `record_lex_offer` | `offer_id`, `offer_version`, `dla_id`, `dla_version`, `license_template_id`, `license_template_version`, `licensor_subject_id`, `offered_scope`, `excluded_scope`, `price`, `currency`, `payment_mode`, `valid_from`, `valid_to`, `offer_state`, `provider_activation_state`, `supersedes_offer_id`, `supersedes_offer_version`, `evidence`, `causation_id`. |
| `record_agreement_entitlement` | `agreement_id`, `agreement_version`, `offer_id`, `offer_version`, `licensee_subject_id`, `agreement_state`, `assent_receipts`, `effective_at`, `expires_at`, `legal_effect`, `provider_refs`, `supersedes_agreement_id`, `supersedes_agreement_version`, `agreement_evidence`; `entitlement_id`, `entitlement_version`, `entitlement_state`, `granted_scope`, `obligations_summary`, `supersedes_entitlement_id`, `supersedes_entitlement_version`, `entitlement_evidence`, `causation_id`. |
| `record_obligation` | `obligation_id`, `obligation_version`, `agreement_id`, `agreement_version`, `entitlement_id`, `entitlement_version`, `obligation_type`, `obligated_subject_id`, `beneficiary_subject_id`, `obligation_terms`, `due_at`, `obligation_state`, `evidence`, `causation_id`. |
| `record_revenue_policy` | `policy_id`, `policy_version`, `label`, `currency`, `calculation_basis`, `legs`, `legal_tax_review_state`, `policy_state`, `money_movement_authorized`, `supersedes_policy_id`, `supersedes_policy_version`, `evidence`, `causation_id`. A policy record is not payment execution. |
| `preview_settlement` | `policy_id`, `policy_version`, `source_object_type`, `source_object_id`, `gross_amount`, `currency`, `evidence`, `causation_id`. This produces a preview, not a transfer. |
| `register_token_candidate` | `tokenized_object_id`, `token_class_id`, `token_class_version`, `source_object_type`, `source_object_id`, `source_object_version`, `canonical_asset_id`, `dla_id`, `dla_version`, `agreement_id`, `agreement_version`, `entitlement_id`, `entitlement_version`, `initial_holder_subject_id`, `initial_state`, `source_verified`, `metadata`, `evidence`, `causation_id`. Candidate registration does not mint a production token. |
| `report_oracle_signal` | `target_type`, `target_id`, `signal_type`, numeric `risk_score`, optional numeric `confidence`, `recommended_action` (default `REVIEW`), `evidence_sha256`, `evidence`, `causation_id`. A risk score at least 80 or a quarantine/suspension recommendation opens a review case; it does not apply an autonomous legal action. |
| `bind_dail_proof` | `dail_event_id` (existing UUID), `subject_type`, `subject_id`, `subject_version`, `evidence`. The result reports `ANCHOR_ELIGIBLE`, `VERIFIED_INTERNAL` or `PENDING_CHECKPOINT` according to available DAIL proofs; no public chain transaction is implied. |

## Backend installation

Set both `CHLOM_CORE_SUPABASE_URL` and `CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY` for a compatible self-hosted deployment. The URL must be an HTTPS origin with no path, credentials or trailing slash. A `sb_secret_` key or legacy service-role JWT is rejected. Never configure a service-role key in this adapter.

Only the existing first-party Vercel project ID can use its established public backend fallback. Forks, custom Vercel projects and local installations cannot inherit CrownThrive's production tenancy. Core configuration is separate from LEX configuration. The backend must already provide the documented CHLOM functions and operator registry; the optional LEX draft database bootstrap does not install the CHLOM core.

## Capability boundaries

Current live summaries distinguish production rights records, DAIL verification, wallet inventory and mesh health from pending capabilities. This adapter does not activate native validators, issue utility/governance tokens, broadcast transactions, execute settlement, adjudicate legal title, deploy production zero-knowledge circuits, or automatically adopt laws. The local salted commitment tool remains distinct from DAIL proof binding and from zero-knowledge proof verification.

The release tests use controlled mock identity/provider responses and verify authorization forwarding, session isolation, error sanitization, input bounds, idempotency preservation and public projection filters. A successful deployed status readback is public integration evidence. Acceptance of a private operator workflow still requires the real operator's signed-in session and an authorized domain operation; no production mutation is performed by the tests.
