# Runtime provenance and licensing

The runtime is adapted from `templates/solochain/runtime` in Parity Technologies’ Polkadot SDK, tag `polkadot-stable2506-7`, commit `d173a5f`. The template configuration, runtime API, benchmark and build structure are supplied under the Unlicense. Their original notices remain in the copied files. `src/genesis_config_presets.rs` is supplied under Apache-2.0, with its original Parity copyright and license notice preserved. CHLOM-specific integration, role origins, filters and tests are governed by the root repository LICENSE. Dependency licenses remain their own.

Only development and local test-network genesis presets exist. Every endowed and authority account comes from public SDK test keyrings. These keys are deliberately public and unsuitable for production custody. The balance denomination UNIT is an internal development fee unit; this package does not establish CHM, CHLOM or another economic token.
