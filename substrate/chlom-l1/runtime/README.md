# CHLOM native runtime 1.4.0

This is the first executable CHLOM development-chain runtime: `spec_name = chlom-runtime`, `spec_version = 1`, `transaction_version = 1`. It composes ten CHLOM pallets with Substrate System, Timestamp, Aura, GRANDPA, Balances, TransactionPayment and Sudo. The pinned upstream is Polkadot SDK `polkadot-stable2506-7`; see [upstream licensing](UPSTREAM-LICENSES.md).

The supplied genesis presets are **development** and **local_testnet** only. Their SDK Alice/Bob test keys are public. UNIT is the internal development fee denomination with 12 decimal places. No CHM/CHLOM economic token, price, public network, treasury key or commercial acceptance is established by this runtime.

## Authority and signing

Authority administration uses Root. In the supplied development chains, the genesis Sudo account can dispatch Root calls. Privileged CHLOM module operations accept Root administration or a valid transaction signature from an account whose **latest** on-chain authority grant is active, unexpired and class D3 for the exact module role. A role for one module does not authorize another. Revocation or a lower-class replacement immediately removes access. Expiry follows the authority pallet's inclusive `valid_until` convention.

The runtime computes the authority subject with `blake2_256(SCALE((b"CHLOM:runtime-account:v1", AccountId)))`; clients must use the precise SCALE byte-array tuple encoding. The Rust helper is `origins::account_subject`. Role IDs are `blake2_256` of the UTF-8 label below, available through `origins::role_id`.

| Pallet alias / index | Role number | Role label |
|---|---:|---|
| ChlomAuthority / 20 | — | Root administration only |
| ChlomIdentity / 21 | 1 | CHLOM:role:identity:v1 |
| ChlomRights / 22 | 2 | CHLOM:role:rights:v1 |
| ChlomLicensing / 23 | 3 | CHLOM:role:licensing:v1 |
| ChlomSettlement / 24 | 4 | CHLOM:role:settlement:v1 |
| ChlomTokenization / 25 | 5 | CHLOM:role:tokenization:v1 |
| ChlomOracle / 26 | 6 | CHLOM:role:oracle:v1 |
| ChlomCheckpoint / 27 | 7 | CHLOM:role:checkpoint:v1 |
| ChlomUtility / 28 | 8 | CHLOM:role:utility:v1 |
| ChlomPolicy / 29 | 9 | CHLOM:role:policy:v1 |

Utility reserve, consume and release are signed account-owner operations. A caller cannot spend another account's resource allocation. Resource units are nontransferable internal service accounting and are separate from Balances fee units. No roles, rights or resource allocations are pre-granted by either genesis preset.

## Runtime connections

Licensing resolves instrument references against this runtime's actual Rights registry through `RuntimeRightsVerifier`. Instrument asset/version/state, effective term and supersession must match the licensing transition's requirements. A caller-supplied rights-state field alone cannot establish the referenced instrument.

The runtime exposes Core, Metadata, BlockBuilder, TaggedTransactionQueue, OffchainWorkerApi, AuraApi, SessionKeys, GrandpaApi, AccountNonceApi, TransactionPaymentApi, TransactionPaymentCallApi, GenesisBuilder and RuntimeViewFunction APIs. `runtime-benchmarks` adds the standard benchmark runtime API; `try-runtime` adds upgrade checks.

Blocks target six seconds, with a two-second reference-time budget, a 5 MiB proof-size cap, a 5 MiB encoded-length cap, and a 75% normal dispatch share. Transaction extensions check signature, runtime/genesis versions, era, nonce and weight, charge development fees, and support metadata-hash validation. CHLOM weights are conservative manual schedules pending hardware-calibrated benchmarking; executable benchmark cases do not by themselves constitute an audited weight certificate.

## Development release boundaries

`DevelopmentCallFilter` rejects public DLA eligibility, published LEX offers, public/legal token approvals, production-eligible token classes, production-certified adapters and production-mint confirmations. It also inspects these calls nested inside Sudo wrappers. Root can change runtime code or storage, so this boundary describes the shipped release, not an immutable restriction against an authorized upgrade.

The runtime does not turn evidence hashes into proof of ownership, legal compliance, provider confirmations or cryptographic verification of external signatures. Raw source evidence stays outside public chain storage. GRANDPA uses static genesis authorities here; staking, slashing, key-owner proofs, validator rotation and production governance need separate implementation and deployment configuration.

## Build and verification

From `substrate/chlom-l1`, build `cargo build --release -p chlom-runtime`. The standard WASM builder emits the runtime under `target/release/wbuild/chlom-runtime/`. A native host-only test pass can use `SKIP_WASM_BUILD=1 cargo test -p chlom-runtime`; that pass does not verify a WASM artifact. Runtime tests cover authorization at the actual dispatcher, signer-bound roles, expiry/revocation, owner resource consumption, recursive public-activation filtering, finite limits and real signed Executive fee/nonce processing.

## Pinned SDK host import compatibility

Rust 1.98.1's Wasm linker requires the older SDK's plain `extern "C"` declarations to be explicitly admitted as imports. `sdk-host-imports.txt` contains exactly the 121 names exported by the pinned SDK's `sp_io::SubstrateHostFunctions` and `frame_benchmarking::benchmarking::HostFunctions`. A runtime test checks exact equality against those provider tables. Regenerate with `cargo run --release -p chlom-runtime --example export_host_imports` after an intentional SDK upgrade.

The runtime build script passes this exact allowlist to LLD with `--allow-undefined-file`. Unknown unresolved symbols remain fatal. Full node/workspace builds also compile an upstream benchmark fixture runtime, so the native build wrapper exports `WASM_BUILD_RUSTFLAGS` with the absolute allowlist path for every SDK Wasm build. Direct full-workspace Cargo invocations must set the same variable first. The node supplies both host providers when the benchmarking feature is enabled.
