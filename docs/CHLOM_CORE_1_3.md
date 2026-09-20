# CHLOM core 1.3

The September 20 founder clarification establishes the release target as **CHLOM itself**, the Compliance Hybrid Licensing and Ownership Model. LEX is a consuming application. The earlier application 1.2 release remains historical evidence and is not a completion record for the entire CHLOM protocol.

## Core system

The core consists of the governed control plane, DAIL evidence ledger, identity and rights records, policy and authority rules, utility/resource accounting, cryptographic verification, tokenization adapters and integration contracts. Its six permanent functions are Rights, Rules, Roles, Revenue, Records and Remedies.

The root interface opens CHLOM core. It obtains current public aggregate status from the existing control-plane projection and gives authenticated operators access to the existing scoped dispatcher. Browser sessions are separate from LEX. The optional LEX application remains available at `/lex`.

The core API accepts genuine backend user identities and preserves the existing operator registry, scopes, authority ceilings, idempotency rules and DAIL receipts. It never upgrades an anonymous visitor or ordinary account to an operator. Public status is an allowlisted aggregate projection, not a dump of private records.

The Node client and CLI provide the same bounded core integration path to other applications and installations. Core installation requires a provisioned compatible core backend; the LEX draft-workspace SQL is not a full CHLOM database installer.

## Protocol implementation and acceptance

Source and verification work for this release extends the native FRAME candidate and privacy verifier. Exact component manifests, tests, commit and deployment evidence determine the accepted state. The native source remains a candidate until its executable runtime/node, genesis, benchmarks, authority wiring, validator/recovery operations and security acceptance are complete. Compiling a pallet does not establish a live network.

Approved policy versions identify scope, provenance and effective intervals. Policy updates require their defined authority. A regulatory signal cannot silently become an operative legal determination.

Utility metering distinguishes allocation, available units, reservation, consumption and release. Such accounting does not by itself create a transferable economic token or settle external funds. Historical token symbols remain unresolved and are not inferred from the current source.

Privacy commitments and zero-knowledge verification are different capabilities. A salted commitment verifies a later opening. A ZK verifier must check the approved circuit/key, version, public signals and validity interval. No example circuit, mathematical verification or successful test becomes production compliance authority automatically.

## Included native and proof components

The ten-pallet FRAME candidate includes the existing authority, identity, rights, licensing, settlement, tokenization, oracle and checkpoint layers plus native utility and policy modules. The utility module implements nontransferable resource allocations, reservations, consumption, releases and hash-chained receipts. The policy module preserves approved versions and append-only revocations. Oracle history and checkpoint/anchor integrity are hardened. The workspace has a committed dependency lockfile and pinned Rust toolchain.

The Node protocol API implements Groth16 BN254 verification with a server-controlled circuit registry, exact verification-key digests, ordered public signals, validity intervals and bounded workers. Two original real proofs and altered-proof cases were checked independently against snarkjs. The runtime dependency is MIT-licensed `@noble/curves`; the adapter has not been independently audited. No production circuit or proof-generation service is enabled by default.

## Ecosystem use

Go Flipbooks and Virality Music can bind publication/music assets, versioned licensing instruments and provenance; CrownThriveU can consume credential and education-license records; Locticians and MM Suites can use authorized professional/service records; AdLuxe can bind campaign permissions and delivery evidence. Each integration uses its own subject, scope, approved rights and evidence. These integration roles do not certify that every brand adapter has already been activated.

## Operator documents

- [Core API](CHLOM_CORE_API.md)
- [Core console](CHLOM_CORE_INTERFACE.md)
- [Client and CLI](CHLOM_CORE_SDK.md)
- [Installation](INSTALLATION.md)
- [ZK verifier](CHLOM_ZK_VERIFIER.md)
- [Native integrity](architecture/CHLOM_NATIVE_CORE_INTEGRITY_20260920.md)
- [Native utility and policy](architecture/CHLOM_NATIVE_UTILITY_POLICY_CANDIDATE_V1.md)
- [Existing cryptographic architecture](architecture/CHLOM_CRYPTOGRAPHIC_SUBSTRATE_V1.md)
- [Earlier application 1.2 scope](CHLOM_RELEASE_1_2.md)

Publication receipts identify the exact built commit and observed deployment. Preserve earlier records and append this scope correction; do not relabel LEX delivery as the completion of CHLOM itself.
