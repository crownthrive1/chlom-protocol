# CHLOM Core 1.3.0

CHLOM itself is the release target: the Compliance Hybrid Licensing and Ownership Model and its core control plane, ledger interfaces, identity and rights records, authority rules, resource accounting, cryptographic verification, and integration contracts. LEX remains an optional consuming application at `/lex`. The earlier `application-v1.2.0` release is preserved as application history and is not a completion record for CHLOM core.

Release tag: `core-v1.3.0`. Exact source: [`c834b91ac13ac8ce72cee89c97deafc1c3083733`](https://github.com/crownthrive1/chlom-protocol/commit/c834b91ac13ac8ce72cee89c97deafc1c3083733).

**Published core software: local validation and all five GitHub workflows passed; PR #53 merged and the production deployment returned verified core readback.** Implementation descriptions below distinguish the deployed web/control plane from native candidate source and optional cryptographic activation.

## CHLOM core web and integration

- The root console presents CHLOM core architecture, public aggregate status, operator capabilities, wallet capabilities and local evidence tools. LEX retains its separate route and browser session.
- `/api/core` connects to the provisioned canonical backend using real user identities. It preserves existing operator assignments, scopes, authority ceilings, idempotency and DAIL receipts. It does not enroll a visitor as an operator.
- Public status is a bounded, allowlisted aggregate projection with explicit per-source availability. Missing data is not converted into zero counts or fabricated success.
- The Node 24 client and CLI provide the same bounded core dispatcher contract to other applications. Core operator calls use the intended user's backend access token; they do not substitute the optional protocol perimeter API token.
- Local and container installation support the core web runtime. A compatible core backend remains separately provisioned. The optional LEX draft-workspace database bootstrap does not install the entire CHLOM control plane.

Production destination: [CHLOM core](https://chlom-protocol.vercel.app/). Verified deployment: `dpl_AQFwVRojkpDqJuEh3z1VcRSAhqaU`, main `a8b994eccfe767398a097d9c2ff24736f3863ebd`, source tree `cc8080bbaf0fe81cacba954b801d942bd7132aaa` (identical to the release target). Browser observation at `2026-09-20T02:59:38.397Z` returned all four public core sources. The anonymous operator submit control was disabled. No authenticated production operator mutation was performed. See `PRODUCTION_READBACK.json` for the complete aggregate response.

## Ten-pallet native FRAME candidate

The source candidate contains authority, identity, rights, licensing, settlement, tokenization, oracle, checkpoint, utility and policy pallets with a committed dependency lockfile and pinned Rust toolchain.

Native utility implements nontransferable resource allocations, reservations, consumption, releases and hash-chained receipts. Allocated units reconcile to available, reserved and consumed units. Account-scoped operation IDs, exact retries, checked arithmetic and transactional closures protect accounting. Native policy stores authority-approved versions and separate append-only revocations with bounded scope and effective intervals. Expired or revoked current policy does not silently revive an old version.

Oracle case history now appends review versions instead of overwriting prior snapshots. Checkpoint counts, boundary hashes and cross-network anchor receipts are checked more strictly. Existing privileged-origin attestations are not relabeled as independent signer verification.

These are implemented and testable native source modules. This release does not ship an accepted standalone validator network, production Wasm deployment, genesis, generated production weights, ratified authority wiring, recovery acceptance or economic token. No public-chain activation follows from compilation or mock-runtime tests.

## Actual Groth16 verification, bounded activation

The protocol API and offline verifier implement Groth16 BN254 proof verification using `@noble/curves@2.4.0`. They check a server-controlled circuit registry, exact verification-key digests, ordered public signals, validity intervals, curve/subgroup membership and bounded worker execution. Original real proof fixtures and altered-proof cases were compared independently with snarkjs.

This is a proof verifier, separate from the existing salted-hash commitment tool. No production circuit registry, proof-generation service, trusted setup ceremony or application-specific CHLOM rights proof is activated by default. The CHLOM adapter has not received an independent security audit. A mathematical verification result does not establish legal ownership, validate real-world evidence, grant authority, persist a DAIL receipt or settle on-chain.

## Wallet and economic boundaries

Injected EVM discovery, connection and local capability display remain available in the core console. The server-side signature observation still requires `CHLOM_WALLET_CHALLENGE_SECRET`; production secret configuration and a real-wallet signature acceptance test remain pending unless separately evidenced in the final publication receipt. A browser connection does not authenticate a core account or create a permanent wallet binding.

No transferable utility/governance token, token sale, economic ticker assignment, external funds movement or paid fulfillment is activated by this release. Native resource units are nontransferable accounting units. The stateless Node utility evaluator remains snapshot eligibility only and does not execute native reservations or debits.

## Install and operate

- [Core release scope](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/CHLOM_CORE_1_3.md)
- [Installation](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/INSTALLATION.md)
- [Core API](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/CHLOM_CORE_API.md)
- [Operator interface](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/CHLOM_CORE_INTERFACE.md)
- [Client and CLI](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/CHLOM_CORE_SDK.md)
- [Groth16 verifier](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/CHLOM_ZK_VERIFIER.md)
- [Native utility and policy](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/architecture/CHLOM_NATIVE_UTILITY_POLICY_CANDIDATE_V1.md)
- [Native integrity changes](https://github.com/crownthrive1/chlom-protocol/blob/core-v1.3.0/docs/architecture/CHLOM_NATIVE_CORE_INTEGRITY_20260920.md)

Use Node.js 24 and the committed npm lockfile for the web runtime. Native candidate work requires the pinned Rust toolchain and Cargo lockfile. Secrets, private witnesses, restricted policy bodies and production keys are not included. The existing proprietary repository license remains in force; public source visibility does not create an open-source license.

## Validation and release evidence

The integrating release run passed 117 Node tests, 77 Python tests and 29 Rust tests. Locked Cargo workspace tests and the locked all-targets workspace check passed, along with registry validation and the static build. These are source and local-fixture checks, not a validator-network or production-circuit acceptance. [Implementation PR #53](https://github.com/crownthrive1/chlom-protocol/pull/53) passed all five GitHub workflows and merged. This package records the deployed source, provider deployment/readback, and the separate activation status of web, native, wallet and ZK components.

Rollback uses a previously reviewed source/deployment and its governed configuration. Preserve earlier release records, append scope corrections, retain private evidence/openings, and never erase ledger history to simulate rollback.

Contact: contact@crownthrive.com.
