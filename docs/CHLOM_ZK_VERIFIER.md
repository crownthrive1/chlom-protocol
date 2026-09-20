# CHLOM core Groth16 proof verifier

This module belongs to CHLOM's protocol proof layer. It verifies Groth16 proofs on BN254 against an operator-controlled circuit registry, separately from LEX and separately from salted SHA-256 commitments. It never receives the private witness.

The verifier is implemented. No production circuit or registry is included or activated by this release. An approved circuit, its setup ceremony, application semantics, key custody, public input bindings and security review still determine whether a production use is sound. The CHLOM adapter has not undergone an independent security audit. It performs verification only; it does not generate proofs, conduct a trusted setup, grant rights, authenticate an account, transfer tokens, persist a receipt or settle on-chain.

## Implementation and dependencies

- Exact runtime dependency: `@noble/curves@2.4.0`, MIT licensed. The dependency implements BN254 curve arithmetic, subgroup checks and pairings. Its license remains in the installed package.
- CHLOM implements the standard Groth16 verification equation using the maintained curve primitives. No snarkjs source is copied or linked into the runtime.
- Primary references: [Groth's construction](https://eprint.iacr.org/2016/260), [noble-curves documentation](https://github.com/paulmillr/noble-curves), [BN254 Ethereum pairing specification](https://eips.ethereum.org/EIPS/eip-197), and [snarkjs interoperability format](https://github.com/iden3/snarkjs).
- `snarkjs@0.7.6` and the `circom2@0.2.22` compiler wrapper were used in an isolated development directory to generate and independently verify original test fixtures. They are not application dependencies or shipped runtime code.
- BN254 should not be described as providing 128-bit security. Select cryptographic parameters and deployment policies through the circuit security review.

## Operator registry

Set the server-only `CHLOM_PROTOCOL_ZK_JSON` environment variable to a JSON object with schema `ct.chlom.protocol.zk-registry.v1` and a `circuits` array. Empty or missing configuration activates no circuit. Invalid configuration fails closed.

Each circuit must contain exactly these fields:

| Field | Meaning |
|---|---|
| `circuitId`, `version` | Stable circuit identifier and positive integer version |
| `circuitDigest` | Lowercase SHA-256 digest of the approved circuit artifact identified by the approval |
| `verificationKey` | Groth16 verification key in snarkjs JSON format, `curve: "bn128"` |
| `verificationKeyDigest` | SHA-256 of the verification key encoded as recursively key-sorted compact JSON; array order is retained |
| `approvalReference` | Existing operator approval for this circuit version and deployment |
| `auditReference` | Existing circuit/security review reference |
| `setupReference` | Existing trusted setup/transcript verification reference |
| `effectiveAt`, `expiresAt` | UTC timestamps with milliseconds; start inclusive, expiry exclusive |
| `publicSignals` | Ordered array of `{ "name", "min", "max" }`, describing the circuit's exact output/public-input order |

These references are server configuration supplied by an authorized operator. The verifier checks their schema and presence, not the truth or legal authority of documents referenced. Provisioning must independently validate them and bind the circuit artifact, verification key, application domain, tenant/subject/nullifier or other required public inputs. Do not enable the test fixture in production. An arbitrary multiplication statement is not a rights proof.

Coordinates and public signals must be canonical unsigned decimal strings. Public signals must be below the BN254 scalar modulus; coordinates must be below the distinct base-field modulus. No modular reduction of caller inputs occurs. Public signal values must also fall within their approved ranges. At most 16 public signals and 16 registered circuits are supported.

Only finite affine points in snarkjs's three-element form are accepted: G1 `[x,y,"1"]`, G2 `[[xReal,xImag],[yReal,yImag],["1","0"]]`. Do not send EVM calldata's reversed Fp2 coordinates. On-curve and prime-subgroup validation runs before pairings. The optional snarkjs `vk_alphabeta_12` field is shape checked and included in the configured digest but never used as trusted precomputation. Circuits whose configured IC points are infinity are outside this supported subset.

A registry can be constructed without copying the verification key into another format:

```js
import { zkDigest } from './lib/protocol/zk.js';
// approvedKey is the reviewed, locally loaded verification-key JSON object.
const verificationKeyDigest = zkDigest(approvedKey);
```

Do not place an unreviewed sample registry in the application environment simply to make its status green. Keep private circuit sources and review documents out of the public repository.

## Authenticated API

`POST /api/protocol` requires the existing `CHLOM_API_TOKEN` bearer authorization and permitted origin.

```json
{
  "operation": "proof.zk.verify",
  "input": {
    "circuitId": "your-approved-circuit-id",
    "version": 1,
    "proof": {
      "protocol": "groth16",
      "curve": "bn128",
      "pi_a": ["...", "...", "1"],
      "pi_b": [["...", "..."], ["...", "..."], ["1", "0"]],
      "pi_c": ["...", "...", "1"]
    },
    "publicSignals": ["..."]
  }
}
```

Ellipses above are documentation placeholders. The caller cannot send a verification key, witness, registry, timestamp override or approval reference. Unknown properties are rejected.

A completed result returns `valid`, the exact circuit version and digests, the approval reference, a public-signals digest, proof digest and evaluation time. A false result means verification failed. `zeroKnowledgeProof: true` identifies the verification scheme; it does not override `valid`. The result does not establish legal ownership or the truth of real-world facts beyond the approved circuit's mathematical relation. Public inputs are visible to this server and can reveal information; do not treat a zero-knowledge scheme as permission to send confidential fields as public signals.

Unconfigured or expired circuits return 503; malformed inputs return 400; wrong or missing bearer credentials fail before cryptographic work. Per-process concurrency is limited to one verification, with no waiting queue and a limit of 20 starts per minute. Each request runs in a worker with a 5-second deadline, 64 MiB JavaScript old-generation heap limit and 4 MiB stack limit. The worker is terminated before capacity is released. The heap cap is not a bound on total process RSS. Each proof request is limited to 8 KiB. Deployment-wide traffic limits still belong at the gateway; these are per-instance resource limits.

`GET /api/protocol` reports `zeroKnowledge.verifierAvailable`, `registryState`, `configuredActiveCircuitCount`, `configuredCircuitActive` and `moduleAudit`. `zeroKnowledgeImplemented: true` means the verifier exists. These circuit fields count only the configured validity windows; they do not certify key validity or production activation. Point and subgroup validation is deferred to bounded verification, reported as `keyValidation: "deferred_until_verification"`. `productionActivationVerified` is false because this endpoint does not independently establish deployment approval, ceremony validity or application integration. A default installation has zero configured active circuit windows and no proof-generation capability.

## Offline installation

After `npm ci`, the same verifier runs locally:

```sh
node scripts/verify-zk.mjs approved-registry.json proof-request.json
```

`proof-request.json` contains the API's `input` object only. The registry and request are read from local files; no network request or private witness is needed. Exit codes are 0 for a valid proof, 1 for an invalid proof and 2 for configuration/input/runtime failure. Approved validity windows also apply offline. Save the output through your governed evidence process if persistence is required.

## Verification evidence

`node --test tests/zk-verifier.test.mjs` verifies locally generated real proofs, including zero-valued public signals. It rejects changes to the public statement, context and proof points; off-curve and wrong-subgroup points; noncanonical/out-of-field scalars; unknown/expired circuits; key and witness injection; digest mismatch; excessive public inputs; and unauthorized API calls. It checks that execution capacity is released and that an approval expiring during verification cannot yield an accepted result.

`tests/fixtures/zk/README.md` records the original test circuit, generation procedure and independent snarkjs comparison. These fixtures establish interoperability and regression coverage. They are not production circuit audits, production setup ceremonies or deployed CHLOM rights proofs.
