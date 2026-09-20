# CHLOM Native 1.4.0

CHLOM now includes an executable Substrate node and embedded runtime Wasm around its ten FRAME pallets. This distribution supports development and local-testnet installation. It extends `core-v1.3.0`; prior core and application releases remain preserved as component history. LEX remains an optional consuming application.

The immutable `native-v1.4.0` tag identifies source `f45be42eaf8aad80d01c5a65e0b447260b1591a1`. The release documentation's `MANIFEST.json` records the exact target, while the attached `native-release.json` binds the delivered node, runtime, toolchain and source commit.

## Runtime and integration

The runtime combines authority, identity, rights, licensing, settlement, tokenization, oracle, checkpoint, utility and policy with System, Timestamp, Aura, GRANDPA, Balances, TransactionPayment and Sudo. The node supplies persistent state, networking, signed transactions, block production and finality.

Authority administration uses Root. Privileged module calls accept Root or a signed account whose latest grant is active, unexpired and D3-class for that exact module. Utility reserve, consume and release are signed-owner operations. Licensing checks actual rights records and effective terms; identity and token transitions preserve stable identities and lifecycle bindings. Utility resources remain nontransferable accounting units, separate from development fee balances.

Source pins: Polkadot SDK `polkadot-stable2506-7`, Rust 1.98.1, node/runtime package 1.4.0, initial runtime spec version 1 and transaction version 1. Native state does not automatically synchronize with the cloud control plane.

## Download and verify

Release assets include the Linux `x86_64-unknown-linux-gnu` node, runtime Wasm, normal/raw development and local specifications, smoke and signed-transaction receipts, loader readback, benchmark inventory, calibration evidence, dependency licenses, corresponding source and `SHA256SUMS`. The Linux build uses Ubuntu 24.04; compatible glibc/C++ runtime libraries or a host-specific source build are required.

The source archive preserves registry and SDK identities in separate directories, including equal crate names/versions from different sources. Original Cargo manifests and lockfile remain unchanged. `native-source-verification.json` binds the delivered archive hash to an extracted, frozen all-features dependency graph verified under an empty Cargo cache. The current source closure contains 1,133 remote packages and 1,147 total graph packages. Toolchain and native OS tools are separate prerequisites.

Follow the [native installation guide](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/docs/CHLOM_NATIVE_INSTALLATION.md), [runtime contract](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/substrate/chlom-l1/runtime/README.md) and [release scope](https://github.com/crownthrive1/chlom-protocol/blob/native-v1.4.0/docs/CHLOM_NATIVE_RELEASE_1_4.md). Verify checksums and exact source lineage before execution. Source builds require both Wasm targets and the guide's SDK workspace hint and exact host-import allowlist; do not set `SKIP_WASM_BUILD` for release artifacts.

## Verification evidence

Local integration passed 107 Rust, 97 Python and 117 JavaScript tests. A real development node exposed all ten CHLOM metadata aliases, reached block 3 and finalized block 1. The signed-transaction acceptance covers authority rejection/grants, owner boundaries, replay safety, allocation, reservation, consumption, release and hash-linked receipts. Loader verification checks runtime libraries and unresolved symbols.

The benchmark inventory includes 70 cases, of which 28 are CHLOM dispatches. Hardware calibration exercises all 28 with 50 steps and 20 repeats, recording 5,460 timing and 5,460 database samples. Candidate schedules remain `MEASURED_REVIEW_REQUIRED`; conservative manual weights stay active. Measurements cover the synthetic development cases and recorded hardware, not production weight certification.

The release workflow verifies the exact tagged build and all 18 required assets while the release is a draft. It downloads and checks every asset before publication, then reads back the public release and source tag. The attached receipts provide the actual release-host observations; local receipts and previous-candidate CI are preserved separately. Existing published assets are never silently overwritten.

## Operating boundaries and continuity

Alice/Bob genesis keys are public test fixtures. `UNIT` is a development fee denomination with 12 decimals. Neither preset pre-grants CHLOM roles, rights or resource allocations. Keep RPC private: SDK `safe` mode still permits signed transaction submission. The shipped filter rejects production/public activation paths, including inside Sudo; Root can upgrade the runtime.

This release does not establish a production validator network, production authority rotation/staking/slashing, economic-token sale, external settlement, completed real-wallet signature acceptance, durable account binding, paid fulfillment or an independent security audit. It does not activate the cloud Groth16 verifier, an approved production proof circuit or bridge in the native chain. Deployment-specific commercial and recovery acceptance remain separate.

CrownThrive-authored material and dependencies retain their respective licenses. Review binary notices, full dependency license texts and corresponding source. Public availability is not a blanket CrownThrive commercial license or certification. Exact source custody does not assert byte-identical independent compiler builds.

Preserve the exact genesis, binary and finalized head before maintenance; back up a stopped node's full base path and verify restoration separately. Retain prior releases and ledger history; append corrections rather than erasing evidence.

Contact: contact@crownthrive.com.

Implementation: [PR55](https://github.com/crownthrive1/chlom-protocol/pull/55). Final candidate verification: [native CI](https://github.com/crownthrive1/chlom-protocol/actions/runs/35490378088) and the workflow identities in `MANIFEST.json`. The published assets are rebuilt from the exact source above.
