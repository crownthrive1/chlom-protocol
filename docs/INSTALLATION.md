# CHLOM installation and operation

This package runs the CHLOM LEX browser tools and the protocol HTTP adapters on Node.js 24, Vercel, or a container host. Source installation does not issue tokens, provision a chain, create a database tenant, grant operator roles, or activate billing. The repository's `LICENSE` governs installation and commercial distribution; publicly visible source is not an open-source license.

## Local installation

Use an authorized checkout of this repository and Node.js 24.x.

```sh
npm ci
cp .env.example .env.local
node --env-file=.env.local scripts/install-preflight.mjs
npm run build
node --env-file=.env.local scripts/serve-local.mjs
```

Open `http://127.0.0.1:3000`. The workspace, local drafts, file hashing, license-brief export, and split planning are usable without a cloud account. Preview mode requires no secrets. Without an explicit LEX backend, the local server blocks every LEX cloud route except health with HTTP 503. It never silently sends installer sign-ins or private workspace data to CrownThrive's canonical tenant.

The server binds to loopback by default. `HOST` and `PORT` change its listener. The release's APIs use server-only environment variables; none should be embedded into static JavaScript or image build arguments. Restart the process after changing environment variables.

## HTTPS and private cloud workspace

LEX session cookies and wallet challenge cookies use `__Host-`, `Secure`, `HttpOnly`, and `SameSite=Strict`. Cloud mutations and wallet proofs require a same-origin HTTPS request. Plain HTTP preview does not support those authenticated journeys. Do not disable the cookie protections or set `NODE_ENV=test` to make a production installation work.

For an HTTPS host:

1. Set `CHLOM_PUBLIC_ORIGIN` to the exact user-facing origin, for example `https://lex.example.com`.
2. Set `CHLOM_LEX_SUPABASE_URL` and `CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY` to the compatible backend allocated to this installation. Use an HTTPS project origin and a publishable key or legacy `anon` key. Never use an administrative/service-role key.
3. Generate a distinct random `CHLOM_API_TOKEN` of at least 32 characters. Generate a separate random `CHLOM_WALLET_CHALLENGE_SECRET` of at least 32 bytes to enable wallet message verification. Keep both in the host's secret manager or protected `.env` file.
4. Set `CHLOM_ALLOWED_ORIGINS` to approved exact origins, separated by commas. Configure the backend's authentication site URL, permitted redirect URLs, email delivery, and account rules for your host.
5. Terminate TLS at a reverse proxy that preserves `Host`, sets `X-Forwarded-Proto: https`, and replaces client-supplied forwarding headers. Set `CHLOM_TRUST_PROXY=true` only when the application port is accessible exclusively to that proxy. Keep the Node listener on loopback or an isolated container network.
6. Run the production preflight before starting the release:

```sh
node --env-file=.env.local scripts/install-preflight.mjs --production
node --env-file=.env.local scripts/serve-local.mjs
```

For example, a Caddy host serving the application on the same machine can use:

```caddyfile
lex.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

DNS must already point to your host and TLS issuance must succeed. A reverse proxy deployment under a path prefix such as `/chlom/` is not supported: the interface uses origin-root routes. Serve it at its own origin or subdomain.

The preflight checks configuration shape and reports missing features without exposing values. It does not prove provider availability, database permissions, wallet signatures, or a successful user journey. `/api/lex?route=health` identifies the adapter; it is not a database health check.

## Backend contract and database installation boundary

An isolated LEX cloud workspace requires the canonical CHLOM schema and functions. The adapters use these resources:

| Resource | Purpose |
| --- | --- |
| Supabase Auth `/auth/v1` | Account registration, sign-in, refresh, recovery, and sign-out |
| `chlom_lex_drafts_v1`, `chlom_lex_events_v1` | Owner-scoped cloud drafts and activity |
| `chlom_lex_save_draft_v1` | Version-checked draft writes |
| `chlom_lex_request_review_v1` | Explicit review submission |
| `chlom_lex_public_offers_v1` | Public offer projection |
| `chlom_api_dispatch_v3` | Existing scoped CHLOM operator dispatcher |
| Edge function `chlom-public-resolver` | Public identity resolution |

For a new independent private-draft deployment, use [the isolated workspace database package](DATABASE_INSTALLATION.md) in `installation/database/`. It provides account-scoped drafts, versioned saves, event history, and explicit unavailable responses for canonical catalog, review, and operator functions. It is not a copy of the full CrownThrive cloud control plane. Install into a new authorized Supabase project and run its verification script before customer use. A full canonical integration requires its separately provisioned backend and authorization.

After provisioning, verify owner-scoped row security, cross-user isolation, fresh signup/confirmation/sign-in, draft save and revision conflicts, review submission, refresh, logout, and public catalog behavior with designated test accounts. Existing accounts do not gain CHLOM operator authority through installation.

## Protocol providers and governed modules

`CHLOM_API_TOKEN` protects RPC, analytics, attestation, MCP, and protocol POST operations. The browser wallet never needs this token. Configure appropriate provider endpoints from `.env.example` for chain reads. The local server has no arbitrary HTTP proxy route; provider URLs are server configuration, not request parameters.

Keep `CHLOM_CHAIN_WRITE_ENABLED=false` unless the installation has the existing promoted governance state, exact ECAC binding, and authorization for the requested broadcast. A chain endpoint alone does not enable writes. The attestation endpoint prepares intents; a returned digest is not evidence of completed public-chain anchoring.

For BigQuery on Vercel, configure the documented Workload Identity Federation variables. Self-hosted execution uses Google Application Default Credentials and the configured `GCP_PROJECT_ID`; provide identity through your host's managed identity or an external credentials mechanism. Do not bake a service-account key into the container. The current `/api/health` readiness model still expects Vercel provider binding and can return HTTP 503 on a local/self-hosted installation even while `/readyz` and local features are working. Verify actual provider calls separately; do not set fake Vercel environment variables to force a healthy badge.

`GET /api/protocol` reports the policy, utility, and proof module modes. `POST /api/protocol` uses the API bearer token. The server may load `CHLOM_PROTOCOL_POLICY_JSON` and `CHLOM_PROTOCOL_UTILITY_JSON`, each limited to 64 KiB. Supply approved, versioned, time-bounded tenant data; callers cannot submit their own registry or account balances. Missing or invalid registries close evaluation.

- Policy evaluation checks configured rules and referenced evidence. It does not automatically adopt a legal update or issue a legal/compliance determination.
- Utility evaluation checks an authoritative snapshot against a configured resource requirement. It does not issue tokens, reserve funds, debit a balance, or grant access. A transactional reservation and entitlement adapter is required for consumption.
- Salted SHA-256 commitments provide digest-opening verification. They are not zero-knowledge proofs or an immutable public ledger.

See `lib/protocol/policy.js`, `lib/protocol/utility.js`, and `tests/protocol-modules.test.mjs` for the validated registry contracts. The test fixtures are fictional examples, not live policy or entitlement authority. For confidential work, generate and verify commitments locally:

```js
import { createLocalCommitment, verifyDigestCommitment } from './lib/protocol/proofs.js';

const result = createLocalCommitment(privateEvidence, nonSecretContext);
const check = verifyDigestCommitment({
  publicCommitment: result.publicCommitment,
  privateOpening: result.privateOpening,
});
// Publish only result.publicCommitment.
// Store result.privateOpening securely with the private evidence.
```

The API proof operations accept digests and salts, but those values are visible to the API server. Do not send raw evidence or put private openings into a public audit log. Retaining the private opening is necessary for later verification.

## Wallet support

The workspace can discover injected EVM wallets through EIP-6963 and EIP-1193. `GET /api/wallet?route=status` reports whether server message-proof verification is configured. HTTPS and `CHLOM_WALLET_CHALLENGE_SECRET` are required for challenge and verification routes.

The signature confirms a short-lived wallet-control observation for the selected address, chain, and origin. It does not authenticate a LEX account, link an account permanently, approve spending, sign a transaction, or create rights. Current proof scope is browser observation only; it is not a durable one-use authentication nonce system. Contract-wallet signatures, WalletConnect relay, embedded wallets, and token issuance are not provided by this verifier.

## Container installation

```sh
docker build -t chlom-lex:local .
docker run --rm --env-file .env.local -e HOST=0.0.0.0 \
  -p 127.0.0.1:3000:3000 chlom-lex:local
```

The image runs as the unprivileged `node` user and checks `/readyz` for process liveness. `.dockerignore` excludes environment files, private-key patterns, local deployment state, and generated receipts. The image includes source required for operation and the public installation documentation; distribution remains subject to the repository license. Browser-local work lives in the user's browser; cloud records live in the configured backend. The container is not a database backup.

## Routes, health, and release checks

| Route | Meaning |
| --- | --- |
| `/` | LEX application |
| `/protocol` | Provider diagnostics page |
| `/release` | Release capability information |
| `/readyz` | Local process liveness only; suitable for container checks |
| `/health`, `/api/health` | Existing provider and authority readiness |
| `/api/lex?route=health` | LEX adapter response |
| `/api/wallet?route=status` | Wallet capability/configuration response |
| `/api/protocol` | Policy, utility, and proof capabilities |
| `/api/v1/rpc`, `/api/v1/analytics`, `/api/v1/attest` | Existing authenticated protocol endpoints |
| `/mcp`, `/api/mcp` | Existing authenticated MCP endpoint |

The local server loads the repository's API handlers and exact Vercel rewrites, supplies compatible `status()`/`json()` response methods, retains request query strings, and enforces streamed request limits. Clean static routes resolve `.html` files. Dotfiles, path traversal, encoded separators, and symlinks escaping `public/` are rejected. Unknown API paths return 404.

Before releasing a modified installation:

```sh
npm test
npm run build
python scripts/validate_registry.py
python -m unittest discover -s tests -v
```

Verify HTTPS in a real browser, run a designated-user workspace test, and check actual configured provider calls. Health responses or local tests alone do not prove cloud persistence, public-chain activity, or paid fulfillment. Back up the configured database and retain private evidence independently. Roll back the application by deploying the prior reviewed source/image; preserve cloud records and append their corrections.
