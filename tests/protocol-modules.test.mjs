import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import handler, { protocolCapabilities } from '../api/protocol.js';
import { evaluatePolicy, validatePolicyRegistry } from '../lib/protocol/policy.js';
import { evaluateUtility, validateUtilityRegistry } from '../lib/protocol/utility.js';
import {
  createDigestCommitment, createLocalCommitment, hashPrivateEvidenceLocally, verifyDigestCommitment,
} from '../lib/protocol/proofs.js';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const START = '2026-09-20T00:00:00.000Z';
const END = '2026-09-21T00:00:00.000Z';
const scope = () => ({ tenantId: 'tenant-a', jurisdictions: ['US-VA'], actions: ['publish'] });
const policyInput = () => ({ tenantId: 'tenant-a', subjectId: 'subject-a', jurisdiction: 'US-VA', action: 'publish', evidenceIds: ['review-1'] });
const policyRegistry = () => ({
  schema: 'ct.chlom.protocol.policy-registry.v1',
  policies: [{ id: 'release-review', version: 1, effectiveAt: START, expiresAt: END,
    scope: scope(), effect: 'requirements', requiredEvidence: [{ kind: 'rights-review', issuer: 'review-office' }],
    approvalReference: 'approval:1', sourceReference: 'policy-source:1' }],
  evidence: [{ id: 'review-1', tenantId: 'tenant-a', subjectId: 'subject-a', kind: 'rights-review',
    issuer: 'review-office', digest: 'a'.repeat(64), verifiedAt: START, expiresAt: END, revoked: false }],
});
const utilityInput = () => ({ tenantId: 'tenant-a', subjectId: 'subject-a', jurisdiction: 'US-VA',
  action: 'publish', gateId: 'render-access', resource: 'render-page', resourceUnits: '3' });
const utilityRegistry = () => ({
  schema: 'ct.chlom.protocol.utility-registry.v1',
  gates: [{ id: 'render-access', version: 1, effectiveAt: START, expiresAt: END, scope: scope(),
    resource: 'render-page', unit: 'render-unit', unitsPerResource: '2', maxResourceUnits: '20', approvalReference: 'approval:2' }],
  snapshots: [{ id: 'snapshot-1', tenantId: 'tenant-a', subjectId: 'subject-a', unit: 'render-unit',
    availableUnits: '10', observedAt: START, expiresAt: END, allowedGates: ['render-access'], sourceReference: 'ledger-snapshot:1' }],
});

function response() {
  return { headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function environment(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('policy results bind configured versions, scope, evidence and receipt; no legal decision', () => {
  const result = evaluatePolicy(policyInput(), policyRegistry(), NOW);
  assert.equal(result.status, 'requirements_satisfied');
  assert.equal(result.eligibleForReview, true);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.legalDetermination, false);
  assert.equal(result.enforcementPerformed, false);
  assert.equal(result.policies[0].version, 1);
  assert.match(result.evaluationDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(result, evaluatePolicy(policyInput(), policyRegistry(), NOW));
  assert.equal(evaluatePolicy({ ...policyInput(), jurisdiction: 'US-NY' }, policyRegistry(), NOW).status, 'no_matching_policy');
  assert.equal(evaluatePolicy({ ...policyInput(), action: 'sell' }, policyRegistry(), NOW).status, 'no_matching_policy');
  assert.equal(evaluatePolicy({ ...policyInput(), tenantId: 'tenant-b' }, policyRegistry(), NOW).status, 'no_matching_policy');
});

test('evidence is issuer, subject and tenant scoped; revoked/expired/future records cannot satisfy a rule', () => {
  for (const mutation of [
    { tenantId: 'tenant-b' }, { subjectId: 'subject-b' }, { issuer: 'untrusted' },
    { revoked: true }, { expiresAt: '2026-09-20T11:59:59.999Z' },
    { verifiedAt: '2026-09-20T12:00:00.001Z' },
  ]) {
    const registry = policyRegistry();
    Object.assign(registry.evidence[0], mutation);
    const result = evaluatePolicy(policyInput(), registry, NOW);
    assert.equal(result.status, 'evidence_required', JSON.stringify(mutation));
    assert.equal(result.eligibleForReview, false);
  }
  assert.equal(evaluatePolicy({ ...policyInput(), evidenceIds: [] }, policyRegistry(), NOW).status, 'evidence_required');
});

test('policy effective boundary is inclusive, expiry exclusive; deny takes precedence', () => {
  assert.equal(evaluatePolicy(policyInput(), policyRegistry(), Date.parse(START)).status, 'requirements_satisfied');
  assert.equal(evaluatePolicy(policyInput(), policyRegistry(), Date.parse(START) - 1).status, 'no_active_policy');
  assert.equal(evaluatePolicy(policyInput(), policyRegistry(), Date.parse(END)).status, 'no_active_policy');
  const registry = policyRegistry();
  registry.policies.push({ ...structuredClone(registry.policies[0]), id: 'release-suspension', effect: 'deny', requiredEvidence: [] });
  assert.equal(evaluatePolicy(policyInput(), registry, NOW).status, 'denied_by_configured_policy');
  assert.equal(evaluatePolicy(policyInput(), registry, NOW).eligibleForReview, false);
});

test('overlapping policy versions are rejected and adjacent version changes are deterministic', () => {
  const registry = policyRegistry();
  const second = { ...structuredClone(registry.policies[0]), version: 2 };
  registry.policies.push(second);
  assert.throws(() => validatePolicyRegistry(registry), /overlap/);
  registry.policies[0].expiresAt = '2026-09-20T12:00:00.000Z';
  second.effectiveAt = '2026-09-20T12:00:00.000Z';
  assert.equal(evaluatePolicy(policyInput(), registry, NOW).policies[0].version, 2);
  assert.equal(evaluatePolicy(policyInput(), registry, NOW - 1).policies[0].version, 1);
  second.expiresAt = '2026-02-30T12:00:00.000Z';
  assert.throws(() => validatePolicyRegistry(registry));
});

test('caller-supplied rules, verified evidence and time overrides are rejected', () => {
  for (const extra of [{ now: NOW }, { policies: [] }, { evidence: [{ verified: true }] }, { balance: 999 }]) {
    assert.throws(() => evaluatePolicy({ ...policyInput(), ...extra }, policyRegistry(), NOW));
  }
  assert.throws(() => evaluatePolicy({ ...policyInput(), jurisdiction: '*' }, policyRegistry(), NOW));
  assert.throws(() => evaluatePolicy({ ...policyInput(), evidenceIds: ['review-1', 'review-1'] }, policyRegistry(), NOW));
});

test('utility computes exact eligibility from configured snapshots without consuming or granting access', () => {
  const registry = utilityRegistry();
  const before = JSON.stringify(registry);
  const first = evaluateUtility(utilityInput(), registry, NOW);
  const second = evaluateUtility(utilityInput(), registry, NOW);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(registry), before);
  assert.equal(first.status, 'eligible_pending_reservation');
  assert.equal(first.gate.requiredUnits, '6');
  assert.equal(first.eligible, true);
  for (const key of ['accessGranted', 'reservationCreated', 'debitPerformed', 'tokenIssued']) assert.equal(first[key], false);
  assert.equal(first.reservationAdapterRequired, true);
  assert.equal(evaluateUtility({ ...utilityInput(), resourceUnits: '6' }, registry, NOW).status, 'insufficient_units');
  assert.equal(evaluateUtility({ ...utilityInput(), resourceUnits: '21' }, registry, NOW).status, 'quantity_exceeds_gate_limit');
});

test('utility rejects stale/missing snapshots, absent entitlement, cross-tenant access, unapproved resources', () => {
  for (const [mutation, expected] of [
    [{ tenantId: 'tenant-b' }, 'authoritative_snapshot_missing'],
    [{ subjectId: 'subject-b' }, 'authoritative_snapshot_missing'],
    [{ unit: 'other-unit' }, 'authoritative_snapshot_missing'],
    [{ observedAt: '2026-09-20T12:00:00.001Z' }, 'authoritative_snapshot_stale'],
    [{ expiresAt: '2026-09-20T12:00:00.000Z' }, 'authoritative_snapshot_stale'],
    [{ allowedGates: ['other-gate'] }, 'gate_entitlement_missing'],
  ]) {
    const registry = utilityRegistry();
    Object.assign(registry.snapshots[0], mutation);
    assert.equal(evaluateUtility(utilityInput(), registry, NOW).status, expected);
  }
  assert.equal(evaluateUtility({ ...utilityInput(), resource: 'other-resource' }, utilityRegistry(), NOW).status, 'no_active_gate');
  assert.equal(evaluateUtility({ ...utilityInput(), tenantId: 'tenant-b' }, utilityRegistry(), NOW).status, 'no_active_gate');
  assert.equal(evaluateUtility(utilityInput(), utilityRegistry(), Date.parse(END)).status, 'no_active_gate');
});

test('utility quantities use exact integer arithmetic and reject numeric coercion/bypass', () => {
  const registry = utilityRegistry();
  registry.gates[0].maxResourceUnits = '9007199254740993';
  registry.snapshots[0].availableUnits = '18014398509481986';
  const result = evaluateUtility({ ...utilityInput(), resourceUnits: '9007199254740993' }, registry, NOW);
  assert.equal(result.gate.requiredUnits, '18014398509481986');
  assert.equal(result.eligible, true);
  for (const resourceUnits of [0, 3, '0', '-1', '1.5', '1e2', '01', '9'.repeat(39)]) {
    assert.throws(() => evaluateUtility({ ...utilityInput(), resourceUnits }, registry, NOW));
  }
  assert.throws(() => evaluateUtility({ ...utilityInput(), availableUnits: '999' }, registry, NOW));
  registry.snapshots.push(structuredClone(registry.snapshots[0]));
  assert.throws(() => validateUtilityRegistry(registry));
});

test('local commitments use random salts, deterministic JSON hashing and isolated public projections', () => {
  const evidence = { confidential: 'private-material', nested: { b: 2, a: 1 } };
  const context = { tenantId: 'tenant-a', purpose: 'rights-evidence' };
  const first = createLocalCommitment(evidence, context);
  const second = createLocalCommitment(evidence, context);
  assert.notEqual(first.publicCommitment.commitment, second.publicCommitment.commitment);
  assert.equal(first.privateOpening.evidenceDigest, second.privateOpening.evidenceDigest);
  assert.equal(hashPrivateEvidenceLocally({ a: 1, b: 2 }), hashPrivateEvidenceLocally({ b: 2, a: 1 }));
  assert.doesNotMatch(JSON.stringify(first.publicCommitment), /private-material|tenant-a|"salt"|evidenceDigest/);
  assert.equal(verifyDigestCommitment({ publicCommitment: first.publicCommitment, privateOpening: first.privateOpening }).valid, true);
  assert.equal(first.zeroKnowledgeProof, false);
  assert.equal(first.onChain, false);
  assert.throws(() => hashPrivateEvidenceLocally({ missing: undefined }));
  assert.throws(() => hashPrivateEvidenceLocally({ n: Number.NaN }));
  assert.throws(() => hashPrivateEvidenceLocally(new Array(2)));
  assert.throws(() => hashPrivateEvidenceLocally('x'.repeat(70000)));
});

test('proof interoperability vector binds domain, context, salt and evidence digest', () => {
  const input = { evidenceDigest: 'a'.repeat(64), contextDigest: 'b'.repeat(64), salt: Buffer.alloc(32, 7).toString('base64url') };
  const commitment = createDigestCommitment(input);
  const expected = createHash('sha256').update(Buffer.concat([
    Buffer.from('CHLOM:salted-evidence-commitment:v1'), Buffer.from([0]),
    Buffer.from(input.contextDigest, 'hex'), Buffer.alloc(32, 7), Buffer.from(input.evidenceDigest, 'hex'),
  ])).digest('hex');
  assert.equal(commitment.publicCommitment.commitment, expected);
  for (const changed of [
    { publicCommitment: { ...commitment.publicCommitment, contextDigest: 'c'.repeat(64) }, privateOpening: commitment.privateOpening },
    { publicCommitment: commitment.publicCommitment, privateOpening: { ...commitment.privateOpening, evidenceDigest: 'c'.repeat(64) } },
    { publicCommitment: commitment.publicCommitment, privateOpening: { ...commitment.privateOpening, salt: Buffer.alloc(32, 8).toString('base64url') } },
  ]) assert.equal(verifyDigestCommitment(changed).valid, false);
  assert.throws(() => createDigestCommitment({ ...input, salt: 'short' }));
  assert.throws(() => createDigestCommitment({ ...input, evidence: { private: true } }));
  assert.throws(() => verifyDigestCommitment({ publicCommitment: { ...commitment.publicCommitment, algorithm: 'ZK' }, privateOpening: commitment.privateOpening }));
});

test('protocol API fails closed on auth/config; public capabilities disclose no private registry contents', async () => {
  await environment({ CHLOM_API_TOKEN: undefined, CHLOM_PROTOCOL_POLICY_JSON: undefined, CHLOM_PROTOCOL_UTILITY_JSON: undefined }, async () => {
    const result = response();
    await handler({ method: 'POST', headers: {}, body: { operation: 'policy.evaluate', input: policyInput() } }, result);
    assert.equal(result.statusCode, 503);
    const caps = protocolCapabilities();
    assert.equal(caps.policyRegistry, 'unconfigured');
    assert.equal(caps.boundaries.accessGranting, false);
    assert.equal(caps.boundaries.rawPrivateEvidenceAccepted, false);
  });
  await environment({ CHLOM_API_TOKEN: 'test-secret', CHLOM_PROTOCOL_POLICY_JSON: JSON.stringify(policyRegistry()), CHLOM_PROTOCOL_UTILITY_JSON: '{bad-private-secret' }, async () => {
    const publicResponse = response();
    await handler({ method: 'GET', headers: {} }, publicResponse);
    assert.equal(publicResponse.statusCode, 200);
    assert.equal(publicResponse.payload.utilityRegistry, 'invalid');
    assert.doesNotMatch(JSON.stringify(publicResponse.payload), /tenant-a|review-1|bad-private-secret|test-secret/);
    const denied = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: { operation: 'proof.commit', input: {} } }, denied);
    assert.equal(denied.statusCode, 401);
    const badConfig = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: { operation: 'utility.evaluate', input: utilityInput() } }, badConfig);
    assert.equal(badConfig.statusCode, 503);
    assert.doesNotMatch(JSON.stringify(badConfig.payload), /bad-private-secret/);
  });
});

test('protocol API rejects raw evidence, policy injection, invalid origin and oversized body without content-length', async () => {
  await environment({ CHLOM_API_TOKEN: 'test-secret', CHLOM_PROTOCOL_POLICY_JSON: undefined, CHLOM_ALLOWED_ORIGINS: '' }, async () => {
    const headers = { authorization: 'Bearer test-secret', host: 'chlom.test' };
    for (const body of [
      { operation: 'proof.commit', input: { evidence: 'private' } },
      { operation: 'policy.evaluate', input: { ...policyInput(), policies: [] } },
      { operation: 'policy.evaluate', input: policyInput(), registry: policyRegistry() },
      { operation: 'token.mint', input: {} },
    ]) {
      const result = response();
      await handler({ method: 'POST', headers, body }, result);
      assert.equal(result.statusCode, 400);
    }
    const oversized = response();
    await handler({ method: 'POST', headers, body: { operation: 'proof.commit', input: 'x'.repeat(70000) } }, oversized);
    assert.equal(oversized.statusCode, 413);
    const origin = response();
    await handler({ method: 'POST', headers: { ...headers, origin: 'https://attacker.test' }, body: { operation: 'policy.evaluate', input: policyInput() } }, origin);
    assert.equal(origin.statusCode, 403);
    const proof = response();
    await handler({ method: 'POST', headers, body: { operation: 'proof.commit', input: { evidenceDigest: 'a'.repeat(64), contextDigest: 'b'.repeat(64) } } }, proof);
    assert.equal(proof.statusCode, 200);
    assert.equal(proof.headers['cache-control'], 'no-store, max-age=0');
    const verify = response();
    await handler({ method: 'POST', headers, body: { operation: 'proof.verify', input: { publicCommitment: proof.payload.result.publicCommitment, privateOpening: proof.payload.result.privateOpening } } }, verify);
    assert.equal(verify.statusCode, 200);
    assert.equal(verify.payload.result.valid, true);
    const unconfigured = response();
    await handler({ method: 'POST', headers, body: { operation: 'policy.evaluate', input: policyInput() } }, unconfigured);
    assert.equal(unconfigured.payload.result.status, 'unconfigured');
  });
});
