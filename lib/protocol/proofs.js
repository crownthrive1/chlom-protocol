import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { digest, invalid, object } from './validation.js';

const SCHEMA = 'ct.chlom.protocol.salted-commitment.v1';
const DOMAIN = 'CHLOM:salted-evidence-commitment:v1';
const LIMIT = 64 * 1024;

function canonical(value, depth = 0) {
  if (depth > 20) invalid('Private evidence exceeds the nesting limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length > LIMIT || Object.keys(value).length !== value.length ||
        Array.from({ length: value.length }, (_, index) => index).some(index => !Object.hasOwn(value, index))) {
      invalid('Private evidence arrays must be dense JSON arrays.');
    }
    return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
  }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
  }
  invalid('Private evidence must contain only JSON values.');
}

function saltBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) invalid('The salt must encode 32 random bytes as base64url.');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) invalid();
  return bytes;
}

export function hashPrivateEvidenceLocally(evidence) {
  const encoded = canonical(evidence);
  if (Buffer.byteLength(encoded) > LIMIT) invalid('Private evidence exceeds the local hashing limit.');
  return createHash('sha256').update(encoded).digest('hex');
}

/** Only digests cross this API boundary. Keep the opening and salt private. */
export function createDigestCommitment(input) {
  object(input, ['evidenceDigest', 'contextDigest', 'salt'], ['evidenceDigest', 'contextDigest']);
  digest(input.evidenceDigest); digest(input.contextDigest);
  const salt = input.salt === undefined ? randomBytes(32).toString('base64url') : input.salt;
  const bytes = saltBytes(salt);
  const commitment = createHash('sha256').update(DOMAIN).update(Buffer.from([0]))
    .update(Buffer.from(input.contextDigest, 'hex')).update(bytes)
    .update(Buffer.from(input.evidenceDigest, 'hex')).digest('hex');
  return {
    publicCommitment: { schema: SCHEMA, algorithm: 'SHA-256', contextDigest: input.contextDigest, commitment },
    privateOpening: { evidenceDigest: input.evidenceDigest, salt },
    zeroKnowledgeProof: false, onChain: false,
  };
}

export function createLocalCommitment(evidence, context) {
  return createDigestCommitment({
    evidenceDigest: hashPrivateEvidenceLocally(evidence),
    contextDigest: hashPrivateEvidenceLocally(context),
  });
}

export function verifyDigestCommitment(input) {
  object(input, ['publicCommitment', 'privateOpening']);
  object(input.publicCommitment, ['schema', 'algorithm', 'contextDigest', 'commitment']);
  object(input.privateOpening, ['evidenceDigest', 'salt']);
  const { publicCommitment: claim, privateOpening: opening } = input;
  if (claim.schema !== SCHEMA || claim.algorithm !== 'SHA-256') invalid();
  digest(claim.commitment);
  const actual = createDigestCommitment({ ...opening, contextDigest: claim.contextDigest }).publicCommitment.commitment;
  return {
    schema: 'ct.chlom.protocol.commitment-verification.v1',
    valid: timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(claim.commitment, 'hex')),
    verificationType: 'salted_hash_opening', zeroKnowledgeProof: false,
    ownershipVerified: false, evidenceTruthVerified: false, onChain: false,
  };
}
