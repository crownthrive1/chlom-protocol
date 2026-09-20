import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { ChlomError } from '../runtime/errors.js';
import { active, configuredJson, digest, evaluationTime, invalid, label, list, object, timestamp, windowOf } from './validation.js';

// BN254 base/scalar fields are distinct. Never reduce noncanonical external values.
export const BN254_FP = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const BN254_FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const ZK_LIMITS = Object.freeze({ publicSignals: 16, circuits: 16, inputBytes: 8192,
  workerTimeoutMs: 5000, concurrentPerProcess: 1, verificationsPerMinutePerProcess: 20 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function zkDigest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }

function scalar(value, modulus = BN254_FR) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,76})$/.test(value) || BigInt(value) >= modulus) {
    invalid('ZK field values must be canonical unsigned decimal strings within the field.');
  }
  return BigInt(value);
}
function g1(value) {
  list(value, 3, 3);
  scalar(value[0], BN254_FP); scalar(value[1], BN254_FP);
  if (value[2] !== '1' || (value[0] === '0' && value[1] === '0')) invalid('Expected a finite affine G1 point.');
}
function fp2(value) { list(value, 2, 2).forEach(item => scalar(item, BN254_FP)); }
function g2(value) {
  list(value, 3, 3).forEach(fp2);
  if (value[2][0] !== '1' || value[2][1] !== '0' || value.slice(0, 2).flat().every(item => item === '0')) {
    invalid('Expected a finite affine G2 point.');
  }
}
function verificationKey(key, signalCount) {
  object(key, ['protocol', 'curve', 'nPublic', 'vk_alpha_1', 'vk_beta_2', 'vk_gamma_2', 'vk_delta_2', 'vk_alphabeta_12', 'IC'],
    ['protocol', 'curve', 'nPublic', 'vk_alpha_1', 'vk_beta_2', 'vk_gamma_2', 'vk_delta_2', 'IC']);
  if (key.protocol !== 'groth16' || key.curve !== 'bn128' || key.nPublic !== signalCount) invalid('Only Groth16 on BN254 with an exact public signal count is supported.');
  g1(key.vk_alpha_1);
  for (const point of [key.vk_beta_2, key.vk_gamma_2, key.vk_delta_2]) g2(point);
  list(key.IC, signalCount + 1, signalCount + 1).forEach(g1);
  // snarkjs exports this redundant precomputed pairing. It is never trusted or used.
  if (key.vk_alphabeta_12 !== undefined) list(key.vk_alphabeta_12, 2, 2).forEach(part => list(part, 3, 3).forEach(fp2));
}
export function validateZkRegistry(registry) {
  object(registry, ['schema', 'circuits']);
  if (registry.schema !== 'ct.chlom.protocol.zk-registry.v1') invalid();
  const seen = new Set();
  for (const circuit of list(registry.circuits, ZK_LIMITS.circuits)) {
    object(circuit, ['circuitId', 'version', 'circuitDigest', 'verificationKey', 'verificationKeyDigest',
      'approvalReference', 'auditReference', 'setupReference', 'effectiveAt', 'expiresAt', 'publicSignals']);
    for (const name of ['circuitId', 'approvalReference', 'auditReference', 'setupReference']) label(circuit[name]);
    if (!Number.isSafeInteger(circuit.version) || circuit.version < 1) invalid();
    digest(circuit.circuitDigest); digest(circuit.verificationKeyDigest); windowOf(circuit);
    const key = `${circuit.circuitId}:${circuit.version}`;
    if (seen.has(key)) invalid('Duplicate ZK circuit versions are not permitted.');
    seen.add(key);
    const names = new Set();
    for (const signal of list(circuit.publicSignals, ZK_LIMITS.publicSignals, 1)) {
      object(signal, ['name', 'min', 'max']); label(signal.name);
      if (names.has(signal.name)) invalid('Public signal names must be unique.');
      names.add(signal.name);
      if (scalar(signal.min) > scalar(signal.max)) invalid('Public signal range is invalid.');
    }
    verificationKey(circuit.verificationKey, circuit.publicSignals.length);
    if (zkDigest(circuit.verificationKey) !== circuit.verificationKeyDigest) invalid('Configured verification key digest does not match.');
  }
  return registry;
}
export function loadZkRegistry() { return configuredJson('CHLOM_PROTOCOL_ZK_JSON', validateZkRegistry); }

export function zkCapabilities(now = Date.now()) {
  let registryState = 'unconfigured', configuredActiveCircuitCount = 0;
  try {
    const registry = loadZkRegistry();
    if (registry) { registryState = 'configured'; configuredActiveCircuitCount = registry.circuits.filter(circuit => active(circuit, now)).length; }
  } catch { registryState = 'invalid'; }
  return { verifier: 'groth16_bn254', verifierAvailable: true, registryState, configuredActiveCircuitCount,
    configuredCircuitActive: configuredActiveCircuitCount > 0, proofGenerationAvailable: false,
    keyValidation: 'deferred_until_verification',
    productionActivationVerified: false,
    moduleAudit: 'not_independently_audited', curveLibrary: '@noble/curves@2.4.0',
    rawPrivateWitnessAccepted: false, trustedSetupPerformed: false, limits: ZK_LIMITS };
}

function validateInput(input) {
  object(input, ['circuitId', 'version', 'proof', 'publicSignals']);
  if (Buffer.byteLength(JSON.stringify(input)) > ZK_LIMITS.inputBytes) invalid('The ZK request exceeds its size limit.');
  label(input.circuitId);
  if (!Number.isSafeInteger(input.version) || input.version < 1) invalid();
  object(input.proof, ['protocol', 'curve', 'pi_a', 'pi_b', 'pi_c']);
  if (input.proof.protocol !== 'groth16' || input.proof.curve !== 'bn128') invalid('Only Groth16 on BN254 is supported.');
  g1(input.proof.pi_a); g2(input.proof.pi_b); g1(input.proof.pi_c);
  list(input.publicSignals, ZK_LIMITS.publicSignals, 1).forEach(value => scalar(value));
}

let inflight = false;
let starts = [];
async function boundedVerify(verificationKeyValue, publicSignals, proof) {
  const now = Date.now();
  starts = starts.filter(start => start > now - 60_000);
  if (inflight || starts.length >= ZK_LIMITS.verificationsPerMinutePerProcess) {
    throw new ChlomError('CHLOM_ZK_BUSY', 'ZK verification capacity is occupied. Retry later.', 429);
  }
  inflight = true; starts.push(now);
  try {
    return await new Promise((resolve, reject) => {
      let finished = false;
      const worker = new Worker(new URL('./zk-worker.js', import.meta.url), {
        workerData: { verificationKey: verificationKeyValue, publicSignals, proof },
        env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 },
      });
      const finish = async (error, result) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        await worker.terminate();
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => finish(new ChlomError('CHLOM_ZK_TIMEOUT', 'ZK verification exceeded its execution limit.', 503)), ZK_LIMITS.workerTimeoutMs);
      worker.once('message', message => {
        if (message?.kind === 'result' && typeof message.valid === 'boolean') finish(null, message.valid);
        else if (message?.kind === 'invalid-key') finish(new ChlomError('CHLOM_PROTOCOL_CONFIGURATION_INVALID', 'The configured verification key is invalid.', 503));
        else if (message?.kind === 'invalid-proof') finish(null, false);
        else finish(new ChlomError('CHLOM_ZK_WORKER_FAILED', 'ZK verification could not complete.', 503));
      });
      worker.once('error', () => finish(new ChlomError('CHLOM_ZK_WORKER_FAILED', 'ZK verification could not complete.', 503)));
      worker.once('exit', () => { if (!finished) finish(new ChlomError('CHLOM_ZK_WORKER_FAILED', 'ZK verification could not complete.', 503)); });
    });
  } finally { inflight = false; }
}

/** registry/now are trusted server options; the HTTP handler never accepts them from callers. */
export async function verifyZkProof(input, registry = loadZkRegistry(), now = Date.now()) {
  const startedAt = Date.now();
  validateInput(input);
  const evaluatedAt = evaluationTime(now);
  if (!registry) throw new ChlomError('CHLOM_ZK_UNCONFIGURED', 'No approved ZK circuit registry is configured.', 503);
  validateZkRegistry(registry);
  const circuit = registry.circuits.find(item => item.circuitId === input.circuitId && item.version === input.version);
  if (!circuit || !active(circuit, now)) throw new ChlomError('CHLOM_ZK_CIRCUIT_UNAVAILABLE', 'The requested circuit version is not active.', 503);
  if (input.publicSignals.length !== circuit.publicSignals.length) invalid('The public signal count does not match the approved circuit.');
  input.publicSignals.forEach((value, index) => {
    const signal = circuit.publicSignals[index];
    if (BigInt(value) < BigInt(signal.min) || BigInt(value) > BigInt(signal.max)) invalid('A public signal is outside its approved range.');
  });
  const valid = await boundedVerify(circuit.verificationKey, input.publicSignals, input.proof);
  // A circuit can expire during expensive verification. No result survives expiry.
  if (now + (Date.now() - startedAt) >= timestamp(circuit.expiresAt)) {
    throw new ChlomError('CHLOM_ZK_CIRCUIT_UNAVAILABLE', 'The circuit expired during verification.', 503);
  }
  return { schema: 'ct.chlom.protocol.zk-verification.v1', valid, verificationType: 'groth16_bn254',
    circuitId: circuit.circuitId, version: circuit.version, circuitDigest: circuit.circuitDigest,
    verificationKeyDigest: circuit.verificationKeyDigest, approvalReference: circuit.approvalReference,
    publicSignalsDigest: zkDigest(input.publicSignals), proofDigest: zkDigest(input.proof), evaluatedAt,
    zeroKnowledgeProof: true, ownershipVerified: false, legalDetermination: false,
    accessGranted: false, onChain: false, persisted: false };
}
