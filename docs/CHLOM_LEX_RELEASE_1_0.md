# CHLOM LEX 1.0 — production release record

Release date: September 17, 2026 (America/New_York). Final HTTP observations were collected September 18, 2026 at 02:44–02:50 UTC.

## Public identity and scope

CHLOM remains the governing framework. CHLOM LEX is CrownThrive's public asset and licensing workspace. This release replaces the public homepage of the existing CHLOM protocol deployment, rather than creating a competing protocol authority.

Verified production URL: https://chlom-protocol.vercel.app

Requested custom domain: chlomlex.io. **Domain association, DNS cutover, and custom-domain HTTPS verification were not completed in this release.** No claim is made that the legacy chlom.io or chlomlex.io origin has been replaced or redirected.

## Release identifiers

- Repository: crownthrive1/chlom-protocol, main.
- Complete public relaunch commit: 71be5e650a84649ed0852d99b238cbbd104bfe86.
- Verified production deployment: dpl_FxyDhoRkjbiV9HbAkDNR5uB8zR8d; READY; target production; no alias error.
- Subsequent committed regression tests: fcb0aef89e463edcefb715c54819fc73ed5a8d56.
- Public homepage identity: CHLOM LEX — Your work. Your terms.

## Delivered interface and tools

- Original CHLOM LEX visual identity, responsive homepage, desktop workspace navigation, mobile navigation, and accessible dialogs.
- Asset records with self-declared rights holder, original-source reference, intended uses, exclusions, cultural context, and optional SHA-256 fingerprint.
- License studio with linked asset, proposed licensee, license class, territory, duration, audience or seats, attribution, proposed compensation, exclusions, and AI/voice/likeness considerations.
- Local draft creation, editing, search, archiving, activity history, workspace import/export, record export, and text license-brief export.
- On-device file hashing and digest comparison, with a 100 MB file limit. Original file bytes are not uploaded by this interface.
- Revenue-split scenario planner with percentages summing to 100% and exact-cent allocation using largest remainders. No funds are transferred.
- Account-based private cloud metadata, version conflicts, retained snapshot history, and explicit review submission.
- Public identity lookup through the existing CHLOM public resolver.
- Exchange catalog sourced from the canonical registry, exposing only explicitly eligible public offers.
- Ecosystem, developer, pricing, privacy, use-boundary, and observed system-status pages.

## Backend implementation

Two additive database migrations were applied successfully: chlom_lex_public_workspace_v1 and chlom_lex_public_catalog_projection_v1.

Cloud draft and event tables have row-level security enabled. Anonymous SELECT is denied. Authenticated SELECT is owner-scoped. Direct authenticated INSERT and UPDATE are denied; scoped functions handle writes and retain the caller's authenticated identity.

Cloud review submissions enter the existing CHLOM review registry with the selected draft version and its snapshot digest. A review request does not grant rights, approve ownership, publish an offer, or execute a payment.

The same-origin web adapter uses Secure, HttpOnly session cookies. Administrative credentials are not delivered to the browser. Existing native CHLOM operator permissions remain separate from ordinary workspace accounts.

## Production observations

| Surface | Observed response |
| --- | --- |
| Homepage / | HTTP 200 with the new CHLOM LEX HTML, module script, stylesheet, identity and navigation |
| /api/lex?route=health | HTTP 200; CHLOM LEX version 1.0.0; payment execution false; legal-title adjudication false |
| /api/lex?route=catalog | HTTP 200; canonical source; zero eligible public offers at observation time |
| /api/lex?route=drafts without authentication | HTTP 401 with explicit sign-in requirement |
| /protocol | HTTP 200 with preserved CHLOM Chain Evidence Fabric diagnostics |

Original health, REST and MCP source routes were preserved, not replaced with mock implementations. Readiness of their underlying providers and execution authority is independent of the LEX interface release.

## Verification scope

Twenty local unit/security checks passed with zero failures. They covered JavaScript syntax, HTML escaping, import state stripping, payload validation, split arithmetic, known SHA-256 output, draft-document boundaries, cookie parsing, origin checks, unauthenticated access rejection, invalid methods/identifiers, anonymous sessions, and request-size enforcement.

An isolated browser-rendering test covered desktop and mobile route layouts plus local asset creation and deriving a license brief. No JavaScript page errors or horizontal-overflow failures were observed. Browser-rendering tests used controlled API fixtures and did not prove provider authentication or cloud persistence. Production HTTP observations above were separate real provider reads.

Repository checks on the regression-test commit reported validate, enforce-main, and enforce-canonical-identity success; validate-pr was skipped. These CI labels alone are not asserted to prove the whole application test suite executed.

## Explicit outstanding work and boundaries

1. Complete and verify the requested chlomlex.io domain association, DNS, and HTTPS cutover through an authorized domain-management route.
2. Complete an authorized real-user end-to-end signup/confirmation/sign-in/cloud-save/review-submission acceptance test. The implementation is deployed, but this full user journey was not verified during this release.
3. Populate the public exchange only through properly authorized offer publication. The observed zero-offer state is real; internal offers were not exposed or relabeled for launch.
4. Paid checkout, entitlement fulfillment, money movement, title adjudication, and blockchain execution are not activated by this release.

This release record does not certify unrelated database security findings, other CrownThrive websites, autonomous commercial execution, or the complete CHLOM roadmap.

## Preservation and rollback

The original diagnostic presentation is preserved at public/protocol.html and served at /protocol. Existing native styles, script, APIs, package configuration, and Vercel routing were retained. The previous homepage remains in Git history. Rollback should use a reviewed prior production deployment or a source revert that preserves the original native routes; do not delete private cloud records as a frontend rollback action.

Contact: contact@crownthrive.com.
