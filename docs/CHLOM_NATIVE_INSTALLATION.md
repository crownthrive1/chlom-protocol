# CHLOM native 1.4 installation and operation

This distribution runs CHLOM itself: a Substrate node, embedded Wasm runtime and ten CHLOM pallets, using Aura block production and GRANDPA finality. Its supplied networks are development and local testnet. LEX remains a separate application. The cloud control plane does not synchronize into this chain automatically.

The included Alice/Bob keys are public fixtures. `UNIT` is a development fee denomination with 12 decimal places; it is not a released CHLOM economic token. Rights, roles and resource allocations are not pre-granted. Use these artifacts for local integration, installation and evaluation under the applicable licenses. Public-validator rollout, economic token activation and commercial-network acceptance require their own configured network and evidence.

## Download and verify

Use the assets on the [native-v1.4.0 release](https://github.com/crownthrive1/chlom-protocol/releases/tag/native-v1.4.0). A source tag alone is insufficient evidence that binaries were built. The release must contain `native-release.json`, `native-smoke.json` and `SHA256SUMS`, alongside the binaries and specifications below.

| File | Purpose |
|---|---|
| `chlom-node-linux-x86_64.tar.gz` | Linux node, development chain specs, installation guide and full dependency license texts |
| `chlom-runtime.wasm` | The actual compact runtime from the same build |
| `chlom-dev.json`, `chlom-dev-raw.json` | Single-authority development genesis specifications |
| `chlom-local.json`, `chlom-local-raw.json` | Two-authority local-testnet specifications |
| `native-release.json` | Exact source commit, toolchain, node/lockfile/runtime hashes and declared scope |
| `native-loader.json` | Actual ELF dependencies, successful loader/relocation check, symbol requirements and installed package owners for the exact binary |
| `native-smoke.json` | Actual loopback RPC, metadata, Aura block advance and GRANDPA finality result |
| `native-calibration-receipt.json`, `native-calibration.tar.gz` | Hardware-scoped measurements of all 28 dispatches from the exact published binary; raw samples and candidate weights retained without activation |
| `native-benchmarks.json`, `native-benchmarks.csv` | Actual benchmark CLI readback for all ten CHLOM pallets, bound to the node hash; no calibration claim |
| `native-signed-rpc.json` | Real signed and finalized local transactions exercising utility authority, owner boundaries, lifecycle and receipt-chain checks |
| `dependency-licenses.json` | Resolved Cargo dependency/license inventory |
| `chlom-native-corresponding-source.tar.gz` | Exact repository source plus vendored locked Cargo dependencies and offline Cargo configuration |
| `SHA256SUMS` | SHA-256 checksums for every other top-level release asset |

The Linux artifact is built on Ubuntu 24.04 for `x86_64-unknown-linux-gnu`. The completed native build's loader inspection resolved `ld-linux-x86-64.so.2`, `libc.so.6`, `libm.so.6`, `libgcc_s.so.1` and `libstdc++.so.6`, with no missing libraries or undefined symbols. Their verified Ubuntu package owners are `libc6`, `libgcc-s1` and `libstdc++6`. Install those runtime packages before starting the downloaded executable:

```sh
sudo apt-get update
sudo apt-get install -y libc6 libgcc-s1 libstdc++6
```

The observed build requires symbol versions through `GLIBC_2.38`, `GLIBCXX_3.4.30` and `CXXABI_1.3.11`; an older distribution's presence of similarly named libraries is insufficient. Ubuntu 24.04 satisfies the inspected requirements. The release asset's `native-loader.json` is authoritative for its exact package versions and full symbol requirements. Use an equivalent environment that satisfies those requirements or build on the deployment host. The file hash detects corruption; compare the release's source commit and trusted publication channel as well.

```sh
mkdir chlom-native-1.4
cd chlom-native-1.4
gh release download native-v1.4.0 --repo crownthrive1/chlom-protocol
sha256sum --check SHA256SUMS
mkdir node
tar -xzf chlom-node-linux-x86_64.tar.gz -C node
./node/chlom-node --version
```

## Start a temporary development chain

```sh
./node/chlom-node --dev --tmp --no-telemetry --no-mdns \
  --rpc-methods safe --rpc-port 9944 \
  --listen-addr /ip4/127.0.0.1/tcp/30333
```

RPC remains on loopback. `safe` suppresses unsafe SDK methods; it does not mean all calls are read-only. Signed transaction submission remains possible. Keep RPC private; a public reverse proxy requires deliberate authentication, method restrictions and rate limits. No secret production key belongs in a command line or a development preset.

In another terminal:

```sh
curl --fail --silent http://127.0.0.1:9944 \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"state_getRuntimeVersion","params":[]}'
curl --fail --silent http://127.0.0.1:9944 \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"chain_getHeader","params":[]}'
curl --fail --silent http://127.0.0.1:9944 \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"chain_getFinalizedHead","params":[]}'
```

The runtime reports `specName: chlom-runtime`, initial `specVersion: 1` and `transactionVersion: 1`. Observe increasing block numbers and a finalized head beyond genesis. Block time targets six seconds. Stop with Ctrl-C; `--tmp` discards that temporary chain.

## Preserve local state

Replace `--tmp` with a dedicated base path:

```sh
mkdir -m 700 "$PWD/chlom-state"
./node/chlom-node --dev --base-path "$PWD/chlom-state" \
  --no-telemetry --no-mdns --rpc-methods safe --rpc-port 9944 \
  --listen-addr /ip4/127.0.0.1/tcp/30333
```

Restart with the same binary, exact chain specification and base path. Do not point two running processes at one database. A changed genesis needs a separate base path. `purge-chain`, `revert` and replacing runtime storage are destructive administrative operations, not routine installation steps.

For a two-validator local test, select `--chain local --alice` and `--chain local --bob` with separate base paths, RPC ports and loopback peer ports. Configure Bob's `--bootnodes` to Alice's actual loopback peer address and peer ID shown by the first node. Both validators must use the same local specification. These identities remain test fixtures.

## Pallet access and authority

See the [runtime contract](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/substrate/chlom-l1/runtime/README.md) for exact role labels, pallet indices and SCALE subject encoding. Metadata includes `ChlomAuthority`, `ChlomIdentity`, `ChlomRights`, `ChlomLicensing`, `ChlomSettlement`, `ChlomTokenization`, `ChlomOracle`, `ChlomCheckpoint`, `ChlomUtility` and `ChlomPolicy` at indices 20–29.

The genesis Sudo account administers authority grants in these development chains. Privileged module calls accept Root administration or signed accounts with active, unexpired D3 grants for the specific module role. Revoked grants cannot authorize a call; one role does not grant every role. Utility reserve/consume/release operations additionally bind to the resource owner. Balances fee units and nontransferable utility resources are separate ledgers.

Native licensing checks the referenced rights instrument in the actual runtime registry. Published LEX offers, production token approvals/mints and similar public activation paths are rejected by the supplied development call filter, including inside Sudo call wrappers. Development state cannot establish legal ownership or production entitlement.

## Build exact source

Install native build tools and the pinned Rust toolchain:

```sh
sudo apt-get update
sudo apt-get install -y binutils clang libclang-dev llvm-dev libssl-dev pkg-config protobuf-compiler
rustup toolchain install 1.98.1 --profile minimal --component rust-src
rustup target add wasm32v1-none wasm32-unknown-unknown --toolchain 1.98.1
```

For the corresponding-source archive, extract it into an empty directory and run:

```sh
cd substrate/chlom-l1
export WASM_BUILD_WORKSPACE_HINT="$PWD"
export WASM_BUILD_RUSTFLAGS="-C link-arg=--allow-undefined-file=$PWD/runtime/sdk-host-imports.txt"
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 \
  cargo build --frozen --release -p chlom-node --features runtime-benchmarks
```

`--frozen` uses the bundled dependency sources and lockfile. The Wasm linker flag allows only the exact SDK host imports listed in `runtime/sdk-host-imports.txt`; unknown imports remain errors. Keep that flag when running full-workspace Cargo commands directly. Rust itself, native OS tools and their standard libraries must already be installed; they are not bundled. Do not set `SKIP_WASM_BUILD` for a release build. Runtime Wasm must be embedded in the node and exported from `target/release/wbuild/chlom-runtime/`.

For a repository checkout pinned to the release commit, run `bash scripts/native/build.sh`. It tests the locked workspace in release mode with `runtime-benchmarks`, then builds the developer node with the same features. The distribution includes the pallet benchmark CLI; its presence does not constitute measured benchmark results. Then run:

```sh
python scripts/native/smoke.py \
  --node substrate/chlom-l1/target/release/chlom-node \
  --output native-smoke.json --timeout 180
```

This smoke starts and stops a temporary loopback chain, confirms runtime metadata contains all ten pallets, observes two new blocks and non-genesis finality, and binds the result to the binary hash. It does not certify a public validator fleet, migrations, failover or external settlement.

The separate signed acceptance harness uses public development keys against another isolated temporary node:

```sh
npm ci --ignore-scripts --prefix scripts/native/e2e
npm test --prefix scripts/native/e2e
npm run node --prefix scripts/native/e2e -- \
  --binary "$PWD/substrate/chlom-l1/target/release/chlom-node" \
  --output "$PWD/native-signed-rpc.json"
```

Release CI also runs `scripts/native/calibrate.py` with 50 steps and 20 repeats against that same binary. Packaging requires complete measurements for all 28 CHLOM dispatches, exact binary/runtime/source hashes, clean unchanged native source and verified hashes for every calibration artifact. Raw results, hardware conditions and candidate Rust schedules are retained in `native-calibration.tar.gz`; the top-level receipt state remains `MEASURED_REVIEW_REQUIRED`. The original conservative weight schedules remain active.

Both acceptance receipts must identify the packaged binary and the same runtime code. Packaging also compares the exported Wasm byte-for-byte with `:code` in both raw genesis specifications. This prevents a stale Wasm file from accompanying a newer node.

## Backup and restore a persistent local installation

Record the chain spec hash, binary hash and finalized block/hash before maintenance. Stop the node cleanly and confirm the process has exited. Copy the entire base path into a versioned backup on separate storage while it is stopped; preserve permissions. Treat the backup as private because future non-fixture installations may contain keystore data. Do not copy a live database and assume a consistent backup.

Restore into a new, empty base path. Start the same binary against the same chain specification and verify the stored block history, finalized head and continued block production. Keep the original backup until those observations are recorded. An exported block file is useful for replay but is not a complete keystore/state backup. The local RPC smoke does not replace a recorded recovery drill for a specific deployment.

## Release and licensing record

The native workflow tests and packages a source commit before attaching assets to its exact `native-v*` tag. PR artifacts are temporary review custody; GitHub release assets are the durable distribution. Existing assets are never silently overwritten. A failed or incomplete build must not be described as a binary release.

CrownThrive-authored material and third-party dependencies retain their respective licenses. Review `CROWNTHRIVE-LICENSE.txt`, `BINARY-LICENSE-NOTICE.txt`, dependency license texts and upstream notices in the archive. Public availability does not create a CrownThrive commercial license or certification. The bundled source is exact source custody, not a claim that independent compiler runs produce identical binary bytes.
