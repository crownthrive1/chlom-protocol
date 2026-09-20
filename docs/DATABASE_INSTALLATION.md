# Isolated LEX workspace database

This package supplies a private draft workspace for a **new Supabase project**. It is not a copy of CrownThrive's canonical operator, licensing, review, or commercial registry. The production schema was inspected read-only to preserve the draft API contract; no production data or credentials are included.

| Capability | This bootstrap |
| --- | --- |
| Supabase account authentication | Supplied by the installer's Supabase project |
| Private asset and license drafts | Included |
| Owner-visible event snapshots and payload digests | Included |
| Revision conflict detection; per-user save and record limits | Included |
| Canonical review cases, operator dispatch and public offers | Explicitly unavailable |
| Public identity resolver | Requires separately deployed, authorized integration |
| Token issuance, settlement, binding rights grants | Not supplied |

## Install

1. Provision or select a new authorized Supabase project. Use PostgreSQL 15 or later. Configure its authentication, email confirmation, SMTP, site URL and allowed redirects for your HTTPS deployment. Do not reuse CrownThrive's production connection settings.
2. Review `installation/database/workspace-bootstrap-v1.sql`, then execute it once through the SQL editor as the project database owner. The script creates its objects in a transaction and refuses an existing CHLOM schema or API. It deliberately has no `CREATE OR REPLACE`, destructive reset, or seed customer records.
3. Keep `public` enabled in the Data API. Do **not** add `chlom_workspace_private` to the exposed schemas. The public save RPC is an invoker wrapper around a narrow private writer that checks the authenticated user and record ownership.
4. Configure the application with this project's URL and publishable key. Administrative/service-role keys are unnecessary and must not be installed in the browser. Select the application's isolated workspace deployment mode and keep canonical catalog, operator, review and resolver integrations disabled until separately installed and verified.
5. Run `installation/database/workspace-verification-v1.sql` in the SQL editor. Every returned `passed` value must be true. This checks deployed grants, RLS, function security and the explicit capability contract without creating or reading customer records.
6. Through the deployed app, create two test accounts. Account A must be able to save, edit, archive and list its own drafts and events. Account B must see none of A's records and must be denied an update using A's draft ID. A stale revision must fail. Remove disposable accounts only after this acceptance check.

The API uses `chlom_lex_install_capabilities_v1()` to report the installation's limited capabilities. Attempts to use unavailable RPCs return `CAPABILITY_NOT_INSTALLED` with SQLSTATE `0A000`; they do not silently produce empty catalog results or imaginary review receipts.

## Security and data behavior

Authenticated clients receive SELECT access with owner-based row policies. Direct INSERT, UPDATE, DELETE and TRUNCATE privileges are revoked, including for the application service role. Only the save routine appends events, and every save creates one snapshot in the same transaction as its draft revision. The routine serializes saves per user, enforces 30 saves per minute and 1,000 drafts per account, rejects malformed and oversized payloads, and does not accept an owner ID from the client.

Activity is private, application-append-only history. It is **not** an immutable blockchain ledger or a zero-knowledge proof. Payload hashes identify database JSONB serialization, so they are not interchangeable with hashes over arbitrary client JSON text. Database administrators retain their administrative powers. Deleting an authentication user cascades their private drafts and events; configure your retention and account-deletion procedures accordingly. Archiving through the app preserves revision history.

The isolated schema excludes review foreign keys and permits only DRAFT/ARCHIVED states. A future canonical integration requires an explicit reviewed migration, authoritative registries, authenticated operator grants, review routing, and end-to-end verification; do not enable it merely by changing a label or returning a success object. Historical migrations elsewhere in this repository reference institutional services and must not be bulk-applied to an empty customer database.

## Verification scope

The release includes an executable database regression test using a temporary PostgreSQL-compatible PGlite engine, with minimal mocked Supabase Auth tables and roles. It covers private reads, cross-account update denial, direct-write denial, append-only event privileges, revision conflicts, archive history, null input validation, explicit unavailable capabilities, rate limits and install collision refusal. This validates SQL and application authorization behavior locally; it does not validate a customer's SMTP, hosted Supabase JWT gateway, backups or deployment configuration. Run the SQL verification and two-account acceptance checks after each actual installation.

References: [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api), [database functions](https://supabase.com/docs/guides/database/functions), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [current changelog](https://supabase.com/changelog). The changelog's explicit-grant and extension changes were reviewed; this bootstrap uses explicit grants and PostgreSQL's built-in SHA-256 function, with no extension installation.
