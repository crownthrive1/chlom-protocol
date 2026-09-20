# CHLOM Application 1.2.0

This application release delivers injected EVM wallet connection, bounded wallet-signature observations, browser-local private file commitments, approved-registry policy and utility evaluation, and portable Node 24 installation with an isolated private-draft database bootstrap.

Source tag: `application-v1.2.0`. Exact implementation: [`6dc789ee334a46f4982e8fdd449494182fc8c22c`](https://github.com/crownthrive1/chlom-protocol/commit/6dc789ee334a46f4982e8fdd449494182fc8c22c). The application version is independent of the historical protocol repository generation `v3.0.0`.

## Start using the release

- [CHLOM LEX application](https://chlom-protocol.vercel.app/)
- [Release surface and local privacy tools](https://chlom-protocol.vercel.app/release)
- [Installation instructions](https://github.com/crownthrive1/chlom-protocol/blob/application-v1.2.0/docs/INSTALLATION.md)
- [Isolated workspace database installation](https://github.com/crownthrive1/chlom-protocol/blob/application-v1.2.0/docs/DATABASE_INSTALLATION.md)
- [Protocol API contract](https://github.com/crownthrive1/chlom-protocol/blob/application-v1.2.0/docs/PROTOCOL_API_1_2.md)
- [Architecture and source reconciliation](https://github.com/crownthrive1/chlom-protocol/blob/application-v1.2.0/docs/architecture/CHLOM_RELEASE_SOURCE_RECONCILIATION_20260920.md)

Use the automatically generated source archive for this tag or check out `application-v1.2.0`, run `npm ci`, `npm run certify`, and follow the installation guide. No credentials are included. A local preview works without a cloud backend; HTTPS and explicit installation credentials are required for authenticated cloud features.

## Delivered behavior

- Explicit EIP-6963/EIP-1193 wallet discovery, address/network/native-balance display, connect/disconnect and user-approved Base network switching.
- Five-minute HTTPS-origin, address and chain-bound EVM signature observations when a server-only challenge secret is configured. No account login, permanent account binding or spending approval is created.
- Browser-local salted SHA-256 file commitments with separately exported public commitments and private openings. The local tool sends neither original file bytes nor its filename to the server.
- Authenticated policy evaluation and utility snapshot eligibility using versioned, time-bounded server registries. Missing or invalid registry configuration closes evaluation.
- Safe static/API routing, streamed JSON limits, proxy-header controls, installation preflight, Docker packaging and an exact dependency lockfile.
- An isolated Supabase workspace bootstrap with owner-scoped private drafts, revision checks and event history. Canonical catalog, review and operator functions remain explicitly unavailable until separately integrated.

## Evidence and limits

GitHub checks for the tagged implementation completed successfully: runtime certification, registry validation, canonical identity and main-branch enforcement. Production deployment `dpl_FsNBhcpZqfbSdxiwpfMD1ijLhPkG` was READY; `/build.json` and `/api/health` identified this exact source SHA at 2026-09-20 02:17:25 UTC. Release and wallet browser surfaces were also checked. Implementation validation recorded 76 Node tests, 77 Python tests, and 12 database fixture checks. Source tests and health responses do not establish a completed real-wallet signature, private-user acceptance journey or paid transaction.

This release does not issue or transfer tokens, reserve/debit balances, grant rights, write the canonical DAIL, execute billing, activate a native L1, anchor a public-chain record or provide a zero-knowledge proof. Current wallet verification supports externally owned accounts, not ERC-1271 contract wallets, WalletConnect relay or embedded wallets. A signature observation remains replayable within its short validity period and grants no authority.

The repository retains its existing proprietary license. Public visibility is not an open-source grant. Native cPanel LEX commerce is a separate application and release scope.

## Preservation

The tag identifies the verified implementation before the documentation-only publication follow-up. That follow-up repairs public Markdown links and adds this release request and manifest; it does not replace or retarget the implementation. Roll back application code using the previous reviewed deployment while preserving private records, evidence openings and audit history.

Contact: contact@crownthrive.com.
