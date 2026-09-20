import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import handler, { protocolCapabilities } from '../api/protocol.js';
import { BN254_FP, BN254_FR, loadZkRegistry, validateZkRegistry, verifyZkProof, zkDigest } from '../lib/protocol/zk.js';

const directory = new URL('./fixtures/zk/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, directory), 'utf8'));
const key = await read('verification_key.json');
const proof = await read('proof.json');
const signals = await read('public.json');
const circuitDigest = createHash('sha256').update(await readFile(new URL('product.circom', directory))).digest('hex');
const NOW = Date.parse('2026-09-20T12:00:00.000Z');
function registry() { return { schema: 'ct.chlom.protocol.zk-registry.v1', circuits: [{
  circuitId: 'fixture.private-product', version: 1, circuitDigest,
  verificationKey: structuredClone(key), verificationKeyDigest: zkDigest(key),
  approvalReference: 'test-only:approval', auditReference: 'test-only:unaudited', setupReference: 'test-only:unsafe-ceremony',
  effectiveAt: '2026-09-20T00:00:00.000Z', expiresAt: '2026-09-21T00:00:00.000Z',
  publicSignals: [{ name: 'statement', min: '0', max: '1000' }, { name: 'context', min: '0', max: '1000' }],
}] }; }
function input() { return { circuitId: 'fixture.private-product', version: 1, proof: structuredClone(proof), publicSignals: [...signals] }; }
const invalid = error => error.code === 'CHLOM_PROTOCOL_INVALID_INPUT';

async function environment(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(values)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    return await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return this; } }; }

test('real generated Groth16 proof verifies against the approved circuit without receiving witness', async () => {
  const result = await verifyZkProof(input(), registry(), NOW);
  assert.equal(result.valid, true);
  assert.equal(result.zeroKnowledgeProof, true);
  assert.equal(result.verificationKeyDigest, zkDigest(key));
  assert.equal(result.circuitDigest, circuitDigest);
  assert.equal(result.publicSignalsDigest, zkDigest(signals));
  for (const name of ['ownershipVerified', 'legalDetermination', 'accessGranted', 'onChain', 'persisted']) assert.equal(result[name], false);
  assert.doesNotMatch(JSON.stringify(result), /"left"|"right"|"witness"|vk_alpha_1|pi_a/);
});

test('legitimate zero public scalars verify; modified public statement or context fails', async () => {
  const zero = { ...input(), proof: await read('proof-zero.json'), publicSignals: await read('public-zero.json') };
  assert.deepEqual(zero.publicSignals, ['0', '0']);
  assert.equal((await verifyZkProof(zero, registry(), NOW)).valid, true);
  for (const index of [0, 1]) {
    const changed = input(); changed.publicSignals[index] = String(BigInt(changed.publicSignals[index]) + 1n);
    assert.equal((await verifyZkProof(changed, registry(), NOW)).valid, false);
  }
});

test('off-curve and wrong-subgroup proof points fail; malformed field encodings never reach pairings', async () => {
  const offCurve = input(); offCurve.proof.pi_a[0] = '1'; offCurve.proof.pi_a[1] = '1';
  assert.equal((await verifyZkProof(offCurve, registry(), NOW)).valid, false);
  const nonSubgroup = input(); nonSubgroup.proof.pi_b = await read('non-subgroup-g2.json');
  assert.equal((await verifyZkProof(nonSubgroup, registry(), NOW)).valid, false);
  const mutations = [
    v => { v.proof.pi_a[0] = BN254_FP.toString(); },
    v => { v.proof.pi_a = ['0', '0', '1']; },
    v => { v.proof.pi_b[2] = ['0', '1']; },
    v => { v.proof.pi_c = ['1', '2']; },
    v => { v.proof.curve = 'bls12381'; },
    v => { v.proof.protocol = 'plonk'; },
    v => { v.publicSignals[0] = BN254_FR.toString(); },
    v => { v.publicSignals[0] = '042'; },
    v => { v.publicSignals[0] = '-1'; },
    v => { v.publicSignals[0] = 42; },
    v => { v.publicSignals[0] = '0x2a'; },
    v => { v.publicSignals = Array(17).fill('1'); },
  ];
  for (const change of mutations) { const value = input(); change(value); await assert.rejects(verifyZkProof(value, registry(), NOW), invalid); }
});

test('proof substitution and reordered Fp2 coordinates do not verify', async () => {
  const swapped = input(); [swapped.proof.pi_a, swapped.proof.pi_c] = [swapped.proof.pi_c, swapped.proof.pi_a];
  assert.equal((await verifyZkProof(swapped, registry(), NOW)).valid, false);
  const evmOrder = input(); evmOrder.proof.pi_b[0].reverse(); evmOrder.proof.pi_b[1].reverse();
  assert.equal((await verifyZkProof(evmOrder, registry(), NOW)).valid, false);
});

test('circuit keys and activation authority cannot be injected by callers', async () => {
  for (const extra of [{ verificationKey: key }, { registry: registry() }, { witness: { left: '3' } }, { now: NOW }, { approvalReference: 'fake' }]) {
    await assert.rejects(verifyZkProof({ ...input(), ...extra }, registry(), NOW), invalid);
  }
  const nested = input(); nested.proof.witness = {};
  await assert.rejects(verifyZkProof(nested, registry(), NOW), invalid);
  await assert.rejects(verifyZkProof(input(), null, NOW), { code: 'CHLOM_ZK_UNCONFIGURED' });
  await assert.rejects(verifyZkProof({ ...input(), version: 2 }, registry(), NOW), { code: 'CHLOM_ZK_CIRCUIT_UNAVAILABLE' });
  await assert.rejects(verifyZkProof({ ...input(), circuitId: 'attacker-circuit' }, registry(), NOW), { code: 'CHLOM_ZK_CIRCUIT_UNAVAILABLE' });
});

test('approved public signal count and business range are exact', async () => {
  await assert.rejects(verifyZkProof({ ...input(), publicSignals: ['42'] }, registry(), NOW), invalid);
  const config = registry(); config.circuits[0].publicSignals[0].max = '40';
  await assert.rejects(verifyZkProof(input(), config, NOW), invalid);
  config.circuits[0].publicSignals[0].max = '1000'; config.circuits[0].publicSignals[1].min = '22';
  await assert.rejects(verifyZkProof(input(), config, NOW), invalid);
});

test('circuit approvals are time bounded and may expire while verification runs', async () => {
  const config = registry();
  await assert.rejects(verifyZkProof(input(), config, Date.parse(config.circuits[0].effectiveAt) - 1), { code: 'CHLOM_ZK_CIRCUIT_UNAVAILABLE' });
  await assert.rejects(verifyZkProof(input(), config, Date.parse(config.circuits[0].expiresAt)), { code: 'CHLOM_ZK_CIRCUIT_UNAVAILABLE' });
  assert.equal((await verifyZkProof(input(), config, Date.parse(config.circuits[0].effectiveAt))).valid, true);
  config.circuits[0].expiresAt = new Date(NOW + 1).toISOString();
  await assert.rejects(verifyZkProof(input(), config, NOW), { code: 'CHLOM_ZK_CIRCUIT_UNAVAILABLE' });
});

test('tampered configuration, duplicate circuit versions and malformed keys fail closed', async () => {
  for (const change of [
    c => { c.circuits[0].verificationKey.vk_alpha_1[0] = '1'; },
    c => { c.circuits.push(structuredClone(c.circuits[0])); },
    c => { c.circuits[0].approvalReference = ''; },
    c => { c.circuits[0].verificationKey.nPublic = 99; },
    c => { c.circuits[0].publicSignals[1].name = 'statement'; },
    c => { c.circuits[0].publicSignals[0].max = BN254_FR.toString(); },
  ]) { const config = registry(); change(config); assert.throws(() => validateZkRegistry(config), invalid); }
  const invalidCurveKey = registry(); invalidCurveKey.circuits[0].verificationKey.vk_alpha_1 = ['1', '1', '1'];
  invalidCurveKey.circuits[0].verificationKeyDigest = zkDigest(invalidCurveKey.circuits[0].verificationKey);
  await assert.rejects(verifyZkProof(input(), invalidCurveKey, NOW), { code: 'CHLOM_PROTOCOL_CONFIGURATION_INVALID' });
  await environment({ CHLOM_PROTOCOL_ZK_JSON: '{private-malformed-config' }, () => {
    assert.throws(loadZkRegistry, { code: 'CHLOM_PROTOCOL_CONFIGURATION_INVALID' });
    const capability = protocolCapabilities();
    assert.equal(capability.zeroKnowledge.registryState, 'invalid');
    assert.equal(capability.zeroKnowledge.configuredCircuitActive, false);
    assert.doesNotMatch(JSON.stringify(capability), /private-malformed/);
  });
});

test('capabilities describe configured windows without claiming key validity or production activation', async () => {
  const config = registry();
  config.circuits[0].effectiveAt = new Date(Date.now() - 60_000).toISOString();
  config.circuits[0].expiresAt = new Date(Date.now() + 60_000).toISOString();
  config.circuits[0].verificationKey.vk_alpha_1 = ['1', '1', '1'];
  config.circuits[0].verificationKeyDigest = zkDigest(config.circuits[0].verificationKey);
  await environment({ CHLOM_PROTOCOL_ZK_JSON: JSON.stringify(config) }, async () => {
    const status = protocolCapabilities().zeroKnowledge;
    assert.equal(status.registryState, 'configured');
    assert.equal(status.configuredActiveCircuitCount, 1);
    assert.equal(status.configuredCircuitActive, true);
    assert.equal(status.keyValidation, 'deferred_until_verification');
    assert.equal(status.productionActivationVerified, false);
    assert.equal(Object.hasOwn(status, 'productionCircuitActive'), false);
    await assert.rejects(verifyZkProof(input()), { code: 'CHLOM_PROTOCOL_CONFIGURATION_INVALID' });
  });
});

test('CPU concurrency is bounded and capacity is released after completion', async () => {
  const first = verifyZkProof(input(), registry(), NOW);
  await assert.rejects(verifyZkProof(input(), registry(), NOW), { code: 'CHLOM_ZK_BUSY' });
  assert.equal((await first).valid, true);
  assert.equal((await verifyZkProof(input(), registry(), NOW)).valid, true);
});

test('API requires authentication and distinguishes a verifier from activated production circuits', async () => {
  await environment({ CHLOM_API_TOKEN: 'test-zk-bearer', CHLOM_PROTOCOL_ZK_JSON: undefined }, async () => {
    const capabilities = protocolCapabilities();
    assert.equal(capabilities.boundaries.zeroKnowledgeImplemented, true);
    assert.equal(capabilities.zeroKnowledge.verifierAvailable, true);
    assert.equal(capabilities.zeroKnowledge.configuredActiveCircuitCount, 0);
    assert.equal(capabilities.zeroKnowledge.configuredCircuitActive, false);
    assert.equal(capabilities.zeroKnowledge.rawPrivateWitnessAccepted, false);
    const unauthorized = response();
    await handler({ method: 'POST', headers: {}, body: { operation: 'proof.zk.verify', input: input() } }, unauthorized);
    assert.equal(unauthorized.statusCode, 401);
    const unavailable = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-zk-bearer' }, body: { operation: 'proof.zk.verify', input: input() } }, unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.payload.error.code, 'CHLOM_ZK_UNCONFIGURED');
  });
});

test('authenticated API verifies a currently approved test circuit without exposing its registry', async () => {
  const config = registry();
  config.circuits[0].effectiveAt = new Date(Date.now() - 60_000).toISOString();
  config.circuits[0].expiresAt = new Date(Date.now() + 60_000).toISOString();
  await environment({ CHLOM_API_TOKEN: 'test-zk-bearer', CHLOM_PROTOCOL_ZK_JSON: JSON.stringify(config) }, async () => {
    const result = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-zk-bearer' }, body: { operation: 'proof.zk.verify', input: input() } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.result.valid, true);
    assert.doesNotMatch(JSON.stringify(protocolCapabilities()), /test-only|vk_alpha_1|fixture.private-product/);
  });
});
