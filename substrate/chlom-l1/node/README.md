# CHLOM native node 1.4.0

This executable embeds the CHLOM runtime and runs an Aura block-authoring service,
GRANDPA finality, persistent state, transaction validation, peer networking and
Substrate JSON-RPC. It is a development/local network distribution. It does not
configure a public validator network, assign a market ticker or bridge to the
cloud control plane automatically.

Build from `substrate/chlom-l1` with the pinned toolchain and native prerequisites:

```sh
cargo build --locked --release -p chlom-node
./target/release/chlom-node --dev --tmp --rpc-methods safe --no-telemetry
```

The runtime Wasm is required. A build with `SKIP_WASM_BUILD` cannot export a usable
built-in chain specification or run the chain. Use a persistent `--base-path` in
place of `--tmp` when local state must survive a restart.

## Networks and key custody

`--dev` selects one authority and standard public development keys. `--chain local`
selects the two-authority local preset; `--alice` and `--bob` select its public test
identities. A node with no network selection fails with a helpful error. A custom
chain may be loaded with `--chain /absolute/path/spec.json`; public development key
shortcuts are rejected when that specification declares a live/custom chain.
These known identities and neutral `UNIT` balances are fixtures with no economic
value. They must not be used for a public deployment.

The chain properties use SS58 format 42 and 12 decimal places. Development and
local specifications have separate CHLOM protocol IDs and no preset public
bootnodes or telemetry endpoints. Runtime authority/admin configuration is owned
by the runtime genesis presets, not by node CLI defaults.

## RPC and operations

RPC listens on loopback by default. Standard SDK flags control the method set,
CORS, request limits, rate limits and explicit external listening. Use
`--rpc-methods safe` to suppress unsafe methods. Safe RPC may still accept signed
transaction submissions; it is not a read-only mode. Key management and privileged
RPC should remain private. Offchain runtime HTTP requests are disabled in the
node service; adding a future oracle transport requires a deliberate integration.

Core RPC includes block/state/metadata and transaction APIs. Runtime-specific
extensions provide `system_accountNextIndex` and transaction payment queries.

```sh
./target/release/chlom-node export-chain-spec --chain dev --raw --output /tmp/chlom-dev.json
./target/release/chlom-node export-chain-spec --chain local --raw --output /tmp/chlom-local.json
./target/release/chlom-node build-spec --chain dev --raw
./target/release/chlom-node export-blocks --chain dev --base-path /tmp/chlom-data /tmp/chlom-blocks.bin
./target/release/chlom-node import-blocks --chain dev --base-path /tmp/chlom-import /tmp/chlom-blocks.bin
./target/release/chlom-node chain-info --chain dev --base-path /tmp/chlom-data
./target/release/chlom-node check-block --help
./target/release/chlom-node key --help
```

`export-chain-spec` is the pinned SDK's preferred spec export command; legacy
`build-spec` remains supported. `purge-chain` and `revert` are explicit destructive
maintenance commands and retain the SDK confirmation and argument handling.

## Pallet benchmark entry point

```sh
cargo build --locked --release -p chlom-node --features runtime-benchmarks
./target/release/chlom-node benchmark pallet --chain dev --list
```

Only the pallet benchmark mode is exposed by this release. Build support alone is
not benchmark evidence; record the measured command, hardware, results and generated
weight file when running a specific pallet benchmark. Production weight claims
require that evidence.

## Verification and upstream source

Node unit tests build both runtime genesis presets, check distinct storage and
network identity, round-trip a raw specification, and check explicit network/key
selection and loopback RPC defaults. Run `cargo test --locked -p chlom-node` with
Wasm building enabled. Runtime and pallet behavior has separate test suites.
The release smoke script additionally verifies a running node and block advance.

See `NOTICE` and `UPSTREAM-LICENSE` for the pinned SDK solochain template provenance.
