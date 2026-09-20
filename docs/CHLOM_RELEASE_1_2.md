# CHLOM 1.2 — Wallet, private commitments, and installation

Release scope: the `crownthrive1/chlom-protocol` application. This is separate from the cPanel application at chlomlex.com. Publication receipts identify the exact commit and deployment; this source document describes the implementation.

## Available in this release

- `/release`: product, installation, documentation, and local privacy tools.
- `/#wallet`: explicit EIP-6963/EIP-1193 wallet discovery, connect/disconnect, network/address/native-balance display, and Base network switching through the user's wallet.
- `/api/wallet`: a five-minute HTTPS-origin/address/chain-bound EVM signature observation when a server-only challenge secret is configured. This is not account login or a persistent identity binding. It supports externally owned account signatures, not ERC-1271 contract-wallet validation. A challenge can be replayed within its validity period only to obtain the same bounded observation; no authorization follows from it.
- Browser-local file commitments: hash up to 25 MB, generate a random 256-bit salt, export public commitment and private opening separately, and verify later against the original bytes. Neither file bytes nor its name are sent to the server by the local tool. Keep the private opening confidential.
- `/api/protocol`: authenticated deterministic policy evaluation, utility snapshot eligibility, and salted digest commitment creation/verification. Rules and snapshots come from server configuration. Requests cannot supply replacement policy, fabricated account balances, or client-selected evaluation time.
- Node 24 local server, bounded JSON parsing, safe static routing, preflight, Docker packaging, exact dependency lockfile, and installation documentation.

## Architecture and limits

The existing cloud rights system and DAIL remain canonical. The new stateless evaluators do not replace the canonical rights dispatcher, write the DAIL, reserve balances, grant entitlements, mint tokens, or transmit transactions. A policy result evaluates the configured conditions; it does not determine legal compliance or automatically adopt a new law. A commitment is a salted hash, not a zero-knowledge proof.

Utility and governance remain separate roles. Historical papers conflict on symbols; this release does not resolve that conflict by silently assigning a ticker. The repository remains under its existing proprietary license. Public source visibility is not an open-source license.

Configure authenticated services through server secrets and versioned approved registries. Absence or invalid configuration is reported explicitly. No default seed phrase, spending key, wallet control, price, customer, or subscription is created.

## Commercial and network completion

This release provides installable software and documentation. It does not establish accepted paid fulfillment, operational native L1, production ZK, public token issuance, WalletConnect QR transport, embedded wallet provisioning, or on-chain settlement. Those require their own implementations and provider acceptance.

The native LEX R12 record separately reported pending database/key setup and finite collection execution. Deploying this protocol update does not close those native marketplace requirements.

## Validation and rollback

Run `npm ci`, `npm run certify`, `python scripts/validate_registry.py`, and `python -m unittest discover -s tests -v`. Run installation preflight for the intended environment. Tests exercise local fixtures and security boundaries; an actual wallet signature, private account journey, provider configuration, and customer transaction require separate acceptance in their respective environment.

Rollback to the previous verified deployment and its exact source commit. Restore configuration from its approved custody without copying secrets into source. Preserve new receipts and private openings; never erase audit history to simulate rollback.

## Source reconciliation

The release follows [current source reconciliation](architecture/CHLOM_RELEASE_SOURCE_RECONCILIATION_20260920.md), the current cryptographic doctrine, and the existing public/private boundary. Current implementation evidence outranks older aspirational descriptions when reporting availability.
