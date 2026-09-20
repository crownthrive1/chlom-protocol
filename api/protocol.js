import { requireApiAuthorization } from '../lib/runtime/auth.js';
import { normalizeError } from '../lib/runtime/errors.js';
import { readJsonBody, sendJson, validateOrigin } from '../lib/runtime/http.js';
import { evaluatePolicy, loadPolicyRegistry } from '../lib/protocol/policy.js';
import { evaluateUtility, loadUtilityRegistry } from '../lib/protocol/utility.js';
import { createDigestCommitment, verifyDigestCommitment } from '../lib/protocol/proofs.js';
import { verifyZkProof, zkCapabilities } from '../lib/protocol/zk.js';
import { invalid, MAX_PROTOCOL_BYTES, object } from '../lib/protocol/validation.js';

function configurationState(loader) {
  try { return loader() ? 'configured' : 'unconfigured'; }
  catch { return 'invalid'; }
}

export function protocolCapabilities() {
  return {
    schema: 'ct.chlom.protocol.capabilities.v1', version: '1.0.0',
    operations: ['policy.evaluate', 'utility.evaluate', 'proof.commit', 'proof.verify', 'proof.zk.verify'],
    authentication: 'CHLOM bearer token required for POST',
    policyRegistry: configurationState(loadPolicyRegistry),
    utilityRegistry: configurationState(loadUtilityRegistry),
    policyMode: 'configured_rules_and_evidence_review',
    utilityMode: 'snapshot_eligibility_without_reservation',
    proofMode: 'salted_digest_commitments_and_registered_groth16_verification',
    zeroKnowledge: zkCapabilities(),
    boundaries: {
      rawPrivateEvidenceAccepted: false, zeroKnowledgeImplemented: true,
      zeroKnowledgeProofGeneration: false,
      legalDeterminations: false, automatedPolicyAdoption: false,
      tokenIssuance: false, tokenTransfers: false, atomicDebits: false,
      accessGranting: false, publicChainAnchoring: false,
    },
    confidentiality: 'Generate commitments locally for confidential work. API proof operations disclose the evidence digest and salt to this server. Publish only publicCommitment.',
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } });
  }
  if (request.method === 'GET') return sendJson(response, 200, { ok: true, ...protocolCapabilities() });
  try {
    validateOrigin(request);
    requireApiAuthorization(request);
    const raw = request.body;
    const serialized = typeof raw === 'string' || Buffer.isBuffer(raw) ? raw : JSON.stringify(raw);
    if (serialized && Buffer.byteLength(serialized) > MAX_PROTOCOL_BYTES) {
      return sendJson(response, 413, { ok: false, error: { code: 'CHLOM_REQUEST_TOO_LARGE' } });
    }
    const body = readJsonBody(request);
    object(body, ['operation', 'input']);
    let result;
    switch (body.operation) {
      case 'policy.evaluate': result = evaluatePolicy(body.input); break;
      case 'utility.evaluate': result = evaluateUtility(body.input); break;
      case 'proof.commit': result = createDigestCommitment(body.input); break;
      case 'proof.verify': result = verifyDigestCommitment(body.input); break;
      case 'proof.zk.verify': result = await verifyZkProof(body.input); break;
      default: invalid('The protocol operation is not supported.');
    }
    return sendJson(response, 200, { ok: true, result });
  } catch (error) {
    const normalized = normalizeError(error);
    return sendJson(response, normalized.status, { ok: false, error: {
      code: normalized.code,
      message: normalized.status === 500 ? 'Protocol processing failed.' : normalized.message,
    } });
  }
}
