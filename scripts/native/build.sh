#!/usr/bin/env bash
# CrownThrive-authored; governed by the repository LICENSE.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT/substrate/chlom-l1"
export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-2}
export CARGO_INCREMENTAL=0
export CARGO_PROFILE_RELEASE_DEBUG=0
export CARGO_NET_GIT_FETCH_WITH_CLI=true
export WASM_BUILD_WORKSPACE_HINT="$ROOT/substrate/chlom-l1"
export WASM_BUILD_RUSTFLAGS="-C link-arg=--allow-undefined-file=$ROOT/substrate/chlom-l1/runtime/sdk-host-imports.txt"
cargo test --locked --release --workspace --features runtime-benchmarks
cargo build --locked --release -p chlom-node --features runtime-benchmarks
