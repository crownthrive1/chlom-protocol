# CHLOM core interface

The root application at `/` represents CHLOM itself: the framework for Rights, Rules, Roles, Revenue, Records, and Remedies. The optional LEX licensing application is available at `/lex`.

## Core navigation

| Interface | Purpose |
| --- | --- |
| `/` | CHLOM architecture and live deployment observations |
| `/#records` | Canonical status, governed record counts, DAIL state, exact capability responses |
| `/#operator` | Dedicated core sign-in, current permissions, scoped operator requests, public identity resolution |
| `/#wallet` | EVM wallet connection and scoped signature observation |
| `/release#proofs` | Browser-local salted file commitments and verification |
| `/release#install` | Installation and license documentation |
| `/protocol` | Chain provider, analytics, attestation, and MCP diagnostics |
| `/lex` | Optional licensing workspace connected to CHLOM |

## Status means observation

The interface fetches five independent responses: core health, canonical core status, stateless protocol capabilities, wallet verification configuration, and chain runtime health. A partial core status response retains its available sources and explicitly identifies unavailable ones. Missing counts are omitted, not rendered as zero. Displayed counts come from the canonical status projection.

DAIL integrity and sequence lag are displayed separately. A verified prefix does not imply that verification has caught up to the current head. A configured provider does not prove a successful external execution. Downloaded capability responses retain the observation timestamp, origin, exact endpoint, HTTP status, and returned projection.

## Authorized operations

1. Use an existing account authorized by the connected CHLOM core.
2. Sign in at the operator console. Core session cookies are separate from LEX cookies. The browser does not store passwords or tokens in local storage.
3. Review the returned authority class, scopes, and allowed actions. The interface intersects these with its supported operation list. A stale or unsupported backend action is not exposed.
4. Choose an operation and prepare its documented payload using [the Core API reference](CHLOM_CORE_API.md). There are no invented asset IDs or sample records preloaded for submission.
5. Retain the idempotency key for exact retries. Generate a new key for a different request. Review the operation before submitting.
6. Inspect the returned state and retain the response receipt. An operator response is not itself proof of legal title, external settlement, token issuance, or public-chain anchoring.

Operations are authorized again by the core on every request. Sign-in alone does not grant operator authority. The interface does not auto-create roles, approve its own authority, or bypass a denied scope. Operational errors are displayed with the backend's safe error code and message.

The console supports the existing core operations for asset binding, ownership interests, rights instruments, DLA records, optional LEX offers, agreements and entitlements, obligations, revenue policy, settlement previews, token candidates, oracle signals, and DAIL proof binding. Token candidate registration is not production token issuance. Settlement preview is not money movement.

## Wallet and private evidence

Wallet discovery does not request account access until the user selects Connect. Signature verification is a separate, short-lived browser observation bound to the address, chain, and origin. It does not create an operator session. The same connection module supports both the CHLOM core interface and the sibling LEX application while their presentation and account sessions remain separate.

The private evidence tool creates salted commitments locally. A commitment establishes consistency with the later disclosed opening; it does not prove authorship, legal rights, or regulatory compliance. Retain the original and private opening securely. This tool is not a zero-knowledge circuit.

## Installation scope

See [Installation](INSTALLATION.md). Set `CHLOM_CORE_SUPABASE_URL` and `CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY` for the allocated compatible core backend. Optional LEX settings do not replace core settings. The LEX private-draft bootstrap SQL does not install the full CHLOM control plane.

Source visibility and distribution remain subject to CrownThrive's repository license and applicable written agreements.
