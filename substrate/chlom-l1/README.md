# CHLOM Native Runtime and Node

This workspace composes the native FRAME pallets described by the CHLOM whitepapers and current doctrine into an executable Aura/GRANDPA runtime and node.

See [native installation](../../docs/CHLOM_NATIVE_INSTALLATION.md), [runtime authority and APIs](runtime/README.md), [node commands](node/README.md), and [native release scope](../../docs/CHLOM_NATIVE_RELEASE_1_4.md). Source/runtime execution and production-network acceptance are reported separately.

Pinned SDK: `paritytech/polkadot-sdk@polkadot-stable2506-7`.

Pallets:

- `authority`: versioned D0-D3 role grants and structural authority boundaries.
- `identity`: versioned DIDs/Fingerprint IDs, settlement-route commitments, and non-transferable credential records.
- `rights`: append-only ownership interests and rights instruments; workflow verification is never represented as court-adjudicated title.
- `licensing`: Dynamic Licensing Assets, licenses, revocation/suspension versions, LEX offers, and entitlements.
- `settlement`: balanced basis-point policies and deterministic previews; no native money movement is enabled in this candidate.
- `tokenization`: rights-aware token classes, candidates, chain adapters, and provider receipts.
- `oracle`: off-chain signal intake and governed review cases; no autonomous legal effect.
- `checkpoint`: compact DAIL checkpoint roots and external anchor receipts without private payloads.
- `utility`: nontransferable resource allocations, reservations, consumption, release and chained receipts.
- `policy`: immutable approved versions, provenance commitments, exact scope/effective intervals and append-only revocation.

Rust is pinned in `rust-toolchain.toml`; `Cargo.lock` locks the dependency graph. Run `cargo check --locked --workspace --all-targets` and `cargo test --locked --workspace`.

## Production boundary

The ThriveBase `chlom_protocol` control plane and DAIL v4 compact verifier are production-deployed. This FRAME workspace is a production candidate until its Wasm artifact, genesis configuration, validator identities/keys, networking, recovery, security review, benchmarking, legal/economic approvals, and provider readback are independently certified. No live CHLOM Coin, CHM token, public NFT mint, validator network, or external settlement is claimed by this source tree.

Doctrine: **Rights before tokens. Rights inside tokens. Rights survive tokens.**
