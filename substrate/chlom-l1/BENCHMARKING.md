# Native pallet weight and benchmark coverage

All ten CHLOM pallets expose `Config::WeightInfo` and `weights::SubstrateWeight<T>`. Every dispatch uses the selected implementation. The `()` implementation is a nonzero RocksDB reference fallback for isolated tests.

The checked-in weights are **conservative accounting estimates, not generated benchmark results**. They include runtime database costs, nonzero proof allowances, two reads for signed role authorization, and system/event overhead. Reference-time margins and 8 KiB-per-read proof allowances are engineering budgets; they are not measured performance or a mathematical trie-proof bound. Bounded vector payloads and service-version searches add explicit scaling terms. These weights must be calibrated against the exact runtime and deployment hardware before admission to a production economic network.

FRAME v2 benchmark definitions cover all 28 dispatches:

| Pallet | Dispatches | Expensive successful path exercised |
| --- | ---: | --- |
| Authority | 1 | Append a grant with a prior version |
| Identity | 2 | Append identity and non-transferable credential versions |
| Rights | 2 | Supersede an ownership interest and rights instrument |
| Licensing | 4 | Current rights, active license, public offer, operative entitlement, prior versions |
| Settlement | 2 | Revenue policy and settlement preview across `MaxLegs` |
| Tokenization | 4 | Class, adapter, object and provider transfer with prior mint |
| Oracle | 2 | Signal plus case; legacy case preservation plus decision |
| Checkpoint | 3 | Prior checkpoint, anchor intent and matching-network receipt |
| Utility | 6 | Full version index, reverse service lookup, allocation, reservation, consumption and release |
| Policy | 2 | Full version index and revocation |

Each benchmark asserts its persisted outcome. Each pallet includes an isolated FRAME mock and a benchmark test suite. These tests execute fixture setup, dispatch and verification. Passing them proves that benchmark scenarios run; it does not generate timing measurements.

Run the dispatch benchmarks' functional tests from this directory:

```sh
cargo test --locked --features runtime-benchmarks --lib \
  -p pallet-chlom-authority -p pallet-chlom-identity \
  -p pallet-chlom-rights -p pallet-chlom-licensing \
  -p pallet-chlom-settlement -p pallet-chlom-tokenization \
  -p pallet-chlom-oracle -p pallet-chlom-checkpoint \
  -p pallet-chlom-utility -p pallet-chlom-policy
```

For hardware measurements, build the node with `--features runtime-benchmarks`, list its supported benchmark command options, then run pallet benchmarking for all ten CHLOM pallets. Preserve command, source commit, SDK lockfile, chain specification, hardware/OS, execution mode, steps/repeats and output hashes alongside the generated weights. Check the generated method signatures against each `WeightInfo` trait before replacing estimates.

The composed runtime's `try_successful_origin()` seeds a synthetic D3 authority grant and returns its signed account. Measurements on that runtime therefore include signer hashing and both authority storage reads. The authority administrator remains Root. Isolated pallet mocks use Root to test pallet behavior without importing every runtime dependency. Benchmarking does not certify ownership, policy legality, external provider truth, token economics, validator operations, cryptographic signer verification or public network activation.
