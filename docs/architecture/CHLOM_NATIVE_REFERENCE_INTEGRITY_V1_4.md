# CHLOM native reference integrity — 1.4

This change strengthens the native records and their effective access predicates. It does not establish legal ownership, perform an external mint, verify provider evidence cryptographically, or move money.

## Bound identities

Credential revisions keep the original subject, credential type and issuer. A correction that changes any of those bindings requires a new credential ID; revocation and claim revisions remain available on the existing ID.

A DLA references a real rights instrument through the runtime's `RightsVerifier`. Its asset, asset version and recorded rights state must match that instrument. Eligible DLA states additionally require the rights term to be current and the instrument not to have been superseded. A DLA ID cannot move to another asset.

A license ID keeps its DLA, license type and issuer. A nontransferable license cannot change holder or become transferable through a revision. A transferable license may change holder through its authorized versioned record path. Existing entitlements do not transfer with it.

An entitlement references an existing license and its current holder. Operative entitlements cannot already be expired or outlast a finite license term. The entitlement ID keeps its original license and holder.

## Effective access

`is_license_active` checks both the license's status/expiry and its current DLA/source-rights eligibility. Pausing a DLA, superseding source rights or allowing source rights to expire stops effective access without rewriting historical records. `is_entitlement_active` additionally checks its own status/expiry and the current license holder.

Raw record getters return historical facts and latest recorded projections; callers must use the effective predicates for access decisions. These predicates do not interpret legal terms or the private policy DSL.

## Provider observation integrity

A mint observation requires an eligible class, certified adapter for that environment, nonzero contract/token commitments, and the registered initial holder. Each tokenized-object ID supports one provider token identity. Transfers and burns require a prior live mint/transfer observation, the same adapter/contract/token commitments and the recorded current holder. A transfer destination must be a nonzero different holder. Burn, suspension and revocation stop further mint/transfer on that object ID; this release does not provide a resume or remint transition.

Provider-failure observations remain append-only history but do not replace the latest effective provider event. `provider_readback_verified` remains the configured privileged origin's attestation about the receipt commitment, not a light-client or signature-verifier result. No external transaction is submitted by these pallets.

## Arithmetic and evidence

Settlement split calculation supports the full `u128` amount range by dividing before intermediate multiplication and rejects an overflowing basis-point sum without panicking. Settlement remains preview-only with `money_moved=false`.

Regression tests cover immutable bindings, nonexistent/mismatched/expired source rights, entitlement holder/expiry checks, effective access after source state changes, transfer holder isolation, provider identity continuity, terminal token states, failed-provider observation continuity and arithmetic boundaries. This is implementation verification, not an independent security audit.
