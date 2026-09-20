# CHLOM native 1.4.0

CHLOM's native distribution adds an executable Substrate node and embedded Wasm runtime around the ten CHLOM pallets. It extends the core 1.3 source release and preserves its evidence as history. The release target is a usable development and local-testnet installation; it does not announce a production validator network or economic-token launch.

## Shipped components

| Component | Release behavior |
|---|---|
| Runtime | System, Timestamp, Aura, GRANDPA, Balances, TransactionPayment, Sudo and ten CHLOM pallets; signed transaction/fee processing and finite block limits |
| Authority | Root administration; signed, current, unexpired D3 roles scope delegated privileged calls by module |
| Identity and rights | Governed identity/rights registry transitions; native licensing resolves actual rights records |
| Licensing, settlement, tokenization | Governed instrument and receipt state machines; shipped development filter prevents public/production activation claims |
| Oracle and checkpoint | Version-preserving observations and contiguous checkpoint commitments with validated boundaries |
| Utility | Owner-bound reserve, consume and release; nontransferable internal service allocations and idempotency |
| Policy | Approved version history, effective intervals, revocation and provenance references |
| Node | Persistent state, peer networking, Aura authoring, GRANDPA finality, transaction pool and loopback JSON-RPC defaults |
| Genesis | Development and two-authority local-testnet presets using public fixture keys and development UNIT balances |
| Distribution | Linux executable, runtime Wasm, normal/raw specs, actual smoke receipt, hashes, notices and corresponding dependency source |

Pallet aliases and stable indices are documented in the [runtime contract](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/substrate/chlom-l1/runtime/README.md). The source is pinned to Polkadot SDK `polkadot-stable2506-7` and Rust 1.98.1. Node/runtime package version is 1.4.0; the new chain starts with runtime spec version 1.

## Evidence required for publication

The `CHLOM Native Build and Release` workflow builds the exact tagged source, runs the locked release-mode workspace tests including `runtime-benchmarks`, reads actual benchmark availability for all ten CHLOM pallets, starts the real node, checks all ten pallets in runtime metadata, observes Aura blocks and GRANDPA finality, and packages the resulting binary/Wasm with SHA-256 hashes. The exported Wasm must exactly match both raw genesis specifications and the running node’s `:code` storage. The same published binary must also complete hardware calibration for all 28 dispatches at 50 steps and 20 repeats. The release includes the full calibration archive and receipt, with exact node/runtime/source binding and recorded hardware scope. Generated candidate schedules remain unactivated; original conservative schedules remain active. Release jobs also include the exact repository snapshot and locked dependency source, license inventory and full license texts. Tag, manifest and source commit must agree before upload.

The workflow also runs on native-code pull requests and preserves review artifacts. It accepts an exact existing native tag/commit through manual dispatch and a validated handoff from the release publisher. The latter handles tags created with GitHub's workflow token, which do not independently trigger downstream tag-push workflows.

Consult the actual `native-release.json`, `native-smoke.json`, `native-benchmarks.json`/`.csv`, `native-calibration-receipt.json`, checksums and Actions run attached to the release for acceptance evidence. This document defines the release contract; it is not a substitute for those results. Host-only tests with `SKIP_WASM_BUILD=1` are insufficient to claim a release binary or executable chain.

## Operating boundaries

- Public development keys must never become production keys. Genesis supplies no CHLOM role, rights or service-resource allocation grants.
- Runtime authority wiring and signed transactions are implemented; legal authority and private evidence remain governed outside public chain data.
- Native records and hashes do not prove external signatures, provider confirmations, ownership or compliance by themselves.
- Utility resources are internal, nontransferable accounting. Development fee balances do not select a CHLOM/CHM ticker, supply, price or sale.
- The shipped runtime does not automatically activate the cloud core's Groth16 verifier, a production ZK circuit, bridge, external mint or money movement.
- Static local GRANDPA authorities do not implement production validator rotation, staking, slashing, key ceremonies or emergency governance.
- Published calibration measures the synthetic development cases on the recorded CI hardware. It does not certify production weights or silently replace active conservative schedules. Candidate adoption requires a separate reviewed runtime change.
- A local smoke is distinct from operator sign-off on backup/recovery, a fleet security review and deployment-specific commercial acceptance.

Install and run the distribution using [CHLOM_NATIVE_INSTALLATION.md](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/docs/CHLOM_NATIVE_INSTALLATION.md). Preserve the previous core/application releases as component history; this release identifies CHLOM's native runtime/node lane directly.
