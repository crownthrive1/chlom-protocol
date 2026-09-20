import { sha256 } from '../runtime/crypto.js';
import {
  active, configuredJson, digest, evaluationTime, invalid, label, labels, list,
  object, scope, scopeMatches, timestamp, uniqueVersions, versioned,
} from './validation.js';

const SCHEMA = 'ct.chlom.protocol.policy-registry.v1';

export function validatePolicyRegistry(registry) {
  object(registry, ['schema', 'policies', 'evidence']);
  if (registry.schema !== SCHEMA) invalid();
  list(registry.policies).forEach(policy => {
    object(policy, ['id', 'version', 'effectiveAt', 'expiresAt', 'scope', 'effect', 'requiredEvidence', 'approvalReference', 'sourceReference']);
    versioned(policy);
    scope(policy.scope);
    label(policy.approvalReference);
    label(policy.sourceReference);
    if (!['requirements', 'deny'].includes(policy.effect)) invalid();
    const kinds = new Set();
    list(policy.requiredEvidence, 30).forEach(requirement => {
      object(requirement, ['kind', 'issuer']);
      label(requirement.kind); label(requirement.issuer);
      const key = JSON.stringify([requirement.kind, requirement.issuer]);
      if (kinds.has(key)) invalid();
      kinds.add(key);
    });
  });
  uniqueVersions(registry.policies);
  const ids = new Set();
  list(registry.evidence, 300).forEach(evidence => {
    object(evidence, ['id', 'tenantId', 'subjectId', 'kind', 'issuer', 'digest', 'verifiedAt', 'expiresAt', 'revoked']);
    ['id', 'tenantId', 'subjectId', 'kind', 'issuer'].forEach(key => label(evidence[key]));
    digest(evidence.digest);
    if (timestamp(evidence.expiresAt) <= timestamp(evidence.verifiedAt) || typeof evidence.revoked !== 'boolean') invalid();
    const key = JSON.stringify([evidence.tenantId, evidence.id]);
    if (ids.has(key)) invalid();
    ids.add(key);
  });
  return registry;
}

export function loadPolicyRegistry() {
  return configuredJson('CHLOM_PROTOCOL_POLICY_JSON', validatePolicyRegistry);
}

export function evaluatePolicy(input, registry = loadPolicyRegistry(), now = Date.now()) {
  object(input, ['tenantId', 'subjectId', 'jurisdiction', 'action', 'evidenceIds']);
  ['tenantId', 'subjectId', 'jurisdiction', 'action'].forEach(key => label(input[key]));
  labels(input.evidenceIds, { min: 0 });
  const evaluatedAt = evaluationTime(now);
  const base = {
    schema: 'ct.chlom.protocol.policy-evaluation.v1', evaluatedAt,
    legalDetermination: false, enforcementPerformed: false,
    humanReviewRequired: true, policySource: 'server_configured_registry',
  };
  if (!registry) return { ...base, status: 'unconfigured', eligibleForReview: false, policies: [] };
  validatePolicyRegistry(registry);
  const scoped = registry.policies.filter(policy => scopeMatches(policy.scope, input));
  const policies = scoped.filter(policy => active(policy, now));
  const evidence = registry.evidence.filter(item => input.evidenceIds.includes(item.id) &&
    item.tenantId === input.tenantId && item.subjectId === input.subjectId && !item.revoked &&
    timestamp(item.verifiedAt) <= now && now < timestamp(item.expiresAt));
  const results = policies.map(policy => ({
    id: policy.id, version: policy.version, effectiveAt: policy.effectiveAt, expiresAt: policy.expiresAt,
    policyDigest: sha256(policy), effect: policy.effect,
    missingEvidence: policy.requiredEvidence.filter(requirement =>
      !evidence.some(item => item.kind === requirement.kind && item.issuer === requirement.issuer)),
  }));
  const denied = results.some(policy => policy.effect === 'deny');
  const missing = results.some(policy => policy.missingEvidence.length > 0);
  const status = !results.length ? (scoped.length ? 'no_active_policy' : 'no_matching_policy') :
    denied ? 'denied_by_configured_policy' : missing ? 'evidence_required' : 'requirements_satisfied';
  const result = {
    ...base, status, eligibleForReview: results.length > 0 && !denied && !missing,
    policies: results,
    inputDigest: sha256(input), registryDigest: sha256(registry),
  };
  return { ...result, evaluationDigest: sha256(result) };
}
