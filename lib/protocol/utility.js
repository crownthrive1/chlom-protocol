import { sha256 } from '../runtime/crypto.js';
import {
  active, configuredJson, evaluationTime, integerString, invalid, label, labels,
  list, object, scope, scopeMatches, timestamp, uniqueVersions, versioned,
} from './validation.js';

export function validateUtilityRegistry(registry) {
  object(registry, ['schema', 'gates', 'snapshots']);
  if (registry.schema !== 'ct.chlom.protocol.utility-registry.v1') invalid();
  list(registry.gates).forEach(gate => {
    object(gate, ['id', 'version', 'effectiveAt', 'expiresAt', 'scope', 'resource', 'unit', 'unitsPerResource', 'maxResourceUnits', 'approvalReference']);
    versioned(gate); scope(gate.scope);
    ['resource', 'unit', 'approvalReference'].forEach(key => label(gate[key]));
    if (integerString(gate.unitsPerResource) < 1n || integerString(gate.maxResourceUnits) < 1n) invalid();
  });
  uniqueVersions(registry.gates);
  const keys = new Set();
  list(registry.snapshots, 300).forEach(snapshot => {
    object(snapshot, ['id', 'tenantId', 'subjectId', 'unit', 'availableUnits', 'observedAt', 'expiresAt', 'allowedGates', 'sourceReference']);
    ['id', 'tenantId', 'subjectId', 'unit', 'sourceReference'].forEach(key => label(snapshot[key]));
    integerString(snapshot.availableUnits);
    labels(snapshot.allowedGates);
    if (timestamp(snapshot.expiresAt) <= timestamp(snapshot.observedAt)) invalid();
    const key = JSON.stringify([snapshot.tenantId, snapshot.subjectId, snapshot.unit]);
    if (keys.has(key)) invalid('Multiple balance snapshots for one account are not permitted.');
    keys.add(key);
  });
  return registry;
}

export function loadUtilityRegistry() {
  return configuredJson('CHLOM_PROTOCOL_UTILITY_JSON', validateUtilityRegistry);
}

export function evaluateUtility(input, registry = loadUtilityRegistry(), now = Date.now()) {
  object(input, ['tenantId', 'subjectId', 'jurisdiction', 'action', 'gateId', 'resource', 'resourceUnits']);
  ['tenantId', 'subjectId', 'jurisdiction', 'action', 'gateId', 'resource'].forEach(key => label(input[key]));
  const quantity = integerString(input.resourceUnits);
  if (quantity < 1n) invalid();
  const evaluatedAt = evaluationTime(now);
  const base = {
    schema: 'ct.chlom.protocol.utility-eligibility.v1', evaluatedAt,
    mode: 'snapshot_evaluation_only', eligible: false, accessGranted: false,
    reservationCreated: false, debitPerformed: false, tokenIssued: false,
    reservationAdapterRequired: true,
  };
  if (!registry) return { ...base, status: 'unconfigured' };
  validateUtilityRegistry(registry);
  const gate = registry.gates.find(item => item.id === input.gateId &&
    item.resource === input.resource && scopeMatches(item.scope, input) && active(item, now));
  if (!gate) return { ...base, status: 'no_active_gate' };
  const snapshot = registry.snapshots.find(item => item.tenantId === input.tenantId &&
    item.subjectId === input.subjectId && item.unit === gate.unit);
  let status;
  if (quantity > integerString(gate.maxResourceUnits)) status = 'quantity_exceeds_gate_limit';
  else if (!snapshot) status = 'authoritative_snapshot_missing';
  else if (!(timestamp(snapshot.observedAt) <= now && now < timestamp(snapshot.expiresAt))) status = 'authoritative_snapshot_stale';
  else if (!snapshot.allowedGates.includes(gate.id)) status = 'gate_entitlement_missing';
  const requiredUnits = quantity * integerString(gate.unitsPerResource);
  if (!status) status = integerString(snapshot.availableUnits) < requiredUnits ? 'insufficient_units' : 'eligible_pending_reservation';
  const result = {
    ...base, status, eligible: status === 'eligible_pending_reservation',
    gate: { id: gate.id, version: gate.version, unit: gate.unit, requiredUnits: requiredUnits.toString(), digest: sha256(gate) },
    snapshot: snapshot ? { id: snapshot.id, observedAt: snapshot.observedAt, expiresAt: snapshot.expiresAt, digest: sha256(snapshot) } : null,
    inputDigest: sha256(input), registryDigest: sha256(registry),
  };
  return { ...result, evaluationDigest: sha256(result) };
}
