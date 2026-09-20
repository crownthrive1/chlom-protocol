# CHLOM protocol utility API

`GET /api/protocol` returns non-secret capability and configuration status. `POST /api/protocol` requires `Authorization: Bearer <CHLOM_API_TOKEN>` and an allowed origin when an Origin header is present. Never put that token in a browser bundle or public client. This is a trusted service API; the token authorizes its configured tenant scope and is not a per-user login token.

The envelope is `{ "operation": "policy.evaluate", "input": { ... } }`. Unknown fields and unsupported operations are rejected. Decisions use server time.

## Policy evaluation

Input fields: `tenantId`, `subjectId`, `jurisdiction`, `action`, `evidenceIds` (array of known evidence identifiers). `CHLOM_PROTOCOL_POLICY_JSON` is a versioned registry with schema `ct.chlom.protocol.policy-registry.v1`, `policies`, and `evidence` arrays.

Each policy has `id`, `version`, `effectiveAt`, `expiresAt`, `scope` (`tenantId`, `jurisdictions`, `actions`), `effect` (`requirements` or `deny`), `requiredEvidence` (`kind` and `issuer` pairs), `approvalReference`, and `sourceReference`. Evidence records bind `id`, `tenantId`, `subjectId`, `kind`, `issuer`, `digest`, `verifiedAt`, `expiresAt`, and `revoked`. Keep this registry server-side and limited to references/digests; raw evidence remains in approved private custody.

An applicable deny overrides satisfied evidence. Expired or revoked evidence cannot satisfy a requirement. Missing/expired policy cannot become an approval. Version windows must not overlap for the same policy identity. Receipts include input, registry, policy, and evaluation digests. The result is a review input, not a legal finding or a rights grant.

## Utility eligibility

Input fields: `tenantId`, `subjectId`, `jurisdiction`, `action`, `gateId`, `resource`, `resourceUnits`. Quantities are canonical positive integer strings; floating-point money is not used.

`CHLOM_PROTOCOL_UTILITY_JSON` has schema `ct.chlom.protocol.utility-registry.v1`, `gates`, and `snapshots`. Each gate has `id`, `version`, `effectiveAt`, `expiresAt`, `scope`, `resource`, `unit`, `unitsPerResource`, `maxResourceUnits`, and `approvalReference`. Each snapshot has `id`, `tenantId`, `subjectId`, `unit`, `availableUnits`, `observedAt`, `expiresAt`, `allowedGates`, and `sourceReference`.

The result checks current configured balance, explicit gate eligibility, quantity, and freshness. It does not debit, reserve, grant access, or protect concurrent spending. A production consumption adapter must atomically reserve/debit against canonical balances before executing a paid action. No token symbols, prices, or balances are inferred.

## Private commitments

For confidential work, use the browser-local tool at `/release#proofs` or the local helper. The API receives digest/salt values and therefore is not the preferred path for highly confidential openings.

`proof.commit` takes `evidenceDigest` and `contextDigest` (lowercase 64-character hexadecimal SHA-256), with optional `salt` (exactly 32 bytes encoded as canonical base64url). Omit salt to generate a cryptographically random salt. The result separates `publicCommitment` from `privateOpening`.

`proof.verify` accepts that `publicCommitment` and `privateOpening`. It verifies their mathematical consistency; it does not fetch or verify original evidence, prove authorship, determine truth, verify an on-chain anchor, or supply a ZK proof.

The exact byte sequence hashed is:

`UTF8("CHLOM:salted-evidence-commitment:v1") || 0x00 || contextDigestBytes[32] || saltBytes[32] || evidenceDigestBytes[32]`

Public schema: `ct.chlom.protocol.salted-commitment.v1`, algorithm `SHA-256`, context digest and commitment. Private opening: evidence digest and salt. The local file tool uses `SHA256(UTF8("ct.chlom.file-evidence.v1"))` as context. It downloads a combined private opening containing both objects so the file can be checked later.

Do not publish the opening with the public commitment. A compromised opening permits candidate-file tests. Preserve it securely; loss of the opening prevents later verification. These commitments do not provide zero-knowledge properties, public timestamps, immutable storage, or regulatory certification.
