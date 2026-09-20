# CHLOM native core integrity — September 20, 2026

This change hardens the existing native CHLOM FRAME candidate. It does not change LEX and does not activate a validator network, issue tokens, or provide a production ZK verifier.

## Checkpoint and anchor invariants

The checkpoint pallet now rejects a reported event count greater than the inclusive sequence span. A one-event checkpoint must have exactly one sequence position and matching first/last event hashes. Multiple events require distinct boundary hashes. Legitimate gaps caused by sequence allocation remain accepted; event count is not equated with the numeric span. Checked arithmetic handles the `u64` upper boundary.

An anchor receipt must identify exactly the network named by its existing anchor intent. A receipt for another network cannot certify that intent. The call signatures, existing storage encoding, and prior event indexes remain compatible; the new error is appended.

These checks validate the shape and linkage of a checkpoint observation. They do not recompute its Merkle root from event witnesses. The legacy `signature_verified` and `provider_readback_verified` flags remain attestations accepted only from the configured privileged origins. This workspace contains no approved signer-key registry to turn those flags into independent signature verification. A cryptographic signer binding and provider verification adapter remain required before external-network activation. A hash or a submitted boolean is not a cryptographic proof.

## Append-only oracle review history

`ReviewCaseVersions(case_id, version)` now preserves every case opening and subsequent review decision. Each version contains the case snapshot, prior record hash, and custody block. `ReviewCaseHeads(case_id)` identifies the latest revision; `ReviewCases(case_id)` remains the compatibility projection consumed by existing callers. Corrections append a new version instead of erasing a prior review snapshot.

Existing call signatures remain unchanged. A decision cannot reuse the prior record hash, and version arithmetic rejects overflow. Rejected review authority, reused case identifiers, invalid case identifiers, and invalid decisions must leave no partial signal, revision, or event.

If a pre-upgrade case has only a current projection, its first new decision captures that projection as revision 1 before appending revision 2. The captured revision's block records when it was preserved, not an invented historical creation time. Decisions already overwritten by the previous implementation cannot be recovered from that projection; historical chain events or external custody are needed for reconstruction.

The candidate still uses configured `OracleOrigin` and `ReviewOrigin`. The caller's supplied authority class is not newly bound to a subject or signer by this patch. No new authorization or autonomous legal effect is introduced. Runtime benchmarking and generated dispatch weights remain activation prerequisites.

## Verification contract

The existing composed FRAME runtime includes tests for impossible checkpoint counts, boundary hashes, allowed sequence gaps, `u64` boundaries, cross-network receipts, preserved review revisions, rejected writes without residue, and capture of a legacy case projection. Run:

```sh
cd substrate/chlom-l1
cargo test --workspace
cargo check --workspace --all-targets
```

Provider deployment, production keys, an executable standalone node, consensus, genesis, recovery, and independent network readback require separate evidence. Passing these tests establishes candidate code behavior only.

The September 20 local run used Rust 1.98.1 and SDK commit `d173a5f3` from the pinned `polkadot-stable2506-7` tag. `cargo test --workspace` passed 12 tests: two primitives tests, eight authored integration tests, and two generated runtime-integrity/genesis tests. `cargo check --locked --workspace --all-targets` also passed. The pre-existing integration-test manifest required a missing direct `scale-info` dependency before the composed runtime could build; this release fixes that manifest. The repository's 77 Python tests and both registry validators also passed. `Cargo.lock` records the resolved dependency set.
