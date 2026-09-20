import { ChlomError } from '../runtime/errors.js';

export const MAX_PROTOCOL_BYTES = 64 * 1024;

export function invalid(message = 'Protocol input does not match the supported schema.') {
  throw new ChlomError('CHLOM_PROTOCOL_INVALID_INPUT', message, 400);
}

export function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  if (Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) invalid();
  return value;
}

export function label(value, { wildcard = false } = {}) {
  if (wildcard && value === '*') return value;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) invalid();
  return value;
}

export function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid('A lowercase SHA-256 digest is required.');
  return value;
}

export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid('Use a UTC timestamp with milliseconds.');
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value) invalid();
  return result;
}

export function windowOf(value) {
  if (timestamp(value.expiresAt) <= timestamp(value.effectiveAt)) invalid('The expiry must follow the effective date.');
}

export function active(value, now) {
  return timestamp(value.effectiveAt) <= now && now < timestamp(value.expiresAt);
}

export function list(value, max = 100, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid();
  return value;
}

export function labels(value, { wildcard = false, min = 1 } = {}) {
  list(value, 50, min).forEach(item => label(item, { wildcard }));
  if (new Set(value).size !== value.length) invalid('Duplicate values are not permitted.');
  return value;
}

export function integerString(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,37})$/.test(value)) invalid('Quantities must be unsigned decimal strings of at most 38 digits.');
  return BigInt(value);
}

export function versioned(value) {
  label(value.id);
  if (!Number.isSafeInteger(value.version) || value.version < 1) invalid();
  windowOf(value);
}

export function scope(value) {
  object(value, ['tenantId', 'jurisdictions', 'actions']);
  label(value.tenantId);
  labels(value.jurisdictions, { wildcard: true });
  labels(value.actions, { wildcard: true });
}

export function scopeMatches(value, input) {
  return value.tenantId === input.tenantId &&
    (value.jurisdictions.includes('*') || value.jurisdictions.includes(input.jurisdiction)) &&
    (value.actions.includes('*') || value.actions.includes(input.action));
}

export function uniqueVersions(values) {
  const keys = new Set();
  for (const value of values) {
    const key = JSON.stringify([value.scope.tenantId, value.id, value.version]);
    if (keys.has(key)) invalid('Duplicate configured versions are not permitted.');
    keys.add(key);
    // Version windows cannot overlap. A new version must explicitly retire the old one.
    for (const other of values) {
      if (value === other || value.id !== other.id || value.scope.tenantId !== other.scope.tenantId) continue;
      if (timestamp(value.effectiveAt) < timestamp(other.expiresAt) &&
          timestamp(other.effectiveAt) < timestamp(value.expiresAt)) invalid('Configured version windows overlap.');
    }
  }
}

export function configuredJson(name, validate) {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    if (Buffer.byteLength(raw) > MAX_PROTOCOL_BYTES) invalid();
    const result = JSON.parse(raw);
    validate(result);
    return result;
  } catch {
    throw new ChlomError('CHLOM_PROTOCOL_CONFIGURATION_INVALID', 'A configured protocol registry is invalid; evaluation is closed.', 503);
  }
}

export function evaluationTime(now) {
  if (!Number.isFinite(now) || !Number.isSafeInteger(now)) invalid();
  return new Date(now).toISOString();
}
