/** CHLOM core operator client. Credentials remain in caller memory. */
export const CORE_ACTIONS = Object.freeze([
  'status', 'capabilities', 'register_asset_binding', 'record_ownership_interest',
  'record_rights_instrument', 'record_dla', 'record_lex_offer',
  'record_agreement_entitlement', 'record_obligation', 'record_revenue_policy',
  'preview_settlement', 'register_token_candidate', 'report_oracle_signal', 'bind_dail_proof',
]);
const READ_ACTIONS = new Set(['status', 'capabilities']);
const MAX_RESPONSE = 2 * 1024 * 1024;

export class ChlomCoreError extends Error {
  constructor(message, { status = 0, code = 'CHLOM_CORE_ERROR' } = {}) {
    super(message);
    this.name = 'ChlomCoreError';
    this.status = status;
    this.code = code;
  }
}

export class ChlomCoreClient {
  #origin;
  #token;
  #fetch;
  constructor({ baseUrl, accessToken, fetchImpl = globalThis.fetch }) {
    const url = new URL(baseUrl);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new ChlomCoreError('Use the CHLOM HTTPS origin; HTTP is allowed only for a local preview.');
    }
    if (accessToken !== undefined && (typeof accessToken !== 'string' || /[\s\r\n]/.test(accessToken) || accessToken.length > 8192)) throw new ChlomCoreError('Supply a valid user access token.');
    this.#origin = url.origin;
    this.#token = accessToken;
    this.#fetch = fetchImpl;
  }

  async #request(route, { action, payload, idempotencyKey } = {}) {
    const headers = { Accept: 'application/json' };
    const options = { method: action ? 'POST' : 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) };
    if (action) {
      if (!this.#token) throw new ChlomCoreError('A genuine CHLOM operator user access token is required.', { code: 'USER_TOKEN_REQUIRED' });
      headers.Authorization = `Bearer ${this.#token}`;
      headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      options.body = JSON.stringify({ action, payload });
      if (new TextEncoder().encode(options.body).length > 64 * 1024) throw new ChlomCoreError('The request exceeds 64 KiB.');
    }
    let response;
    try { response = await this.#fetch(`${this.#origin}/api/core?route=${route}`, options); }
    catch { throw new ChlomCoreError('The CHLOM core endpoint could not be reached.', { code: 'TRANSPORT_ERROR' }); }
    const reader = response.body?.getReader();
    if (!reader) throw new ChlomCoreError('The CHLOM response was empty.', { status: response.status });
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE) { await reader.cancel(); throw new ChlomCoreError('The CHLOM response exceeded its limit.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let result;
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ChlomCoreError('The CHLOM response was not valid JSON.', { status: response.status }); }
    if (!response.ok || (action && result?.ok === false)) {
      const code = typeof result?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(result.code) ? result.code : 'CHLOM_REQUEST_REJECTED';
      throw new ChlomCoreError(`CHLOM rejected the request (${response.status}, ${code}).`, { status: response.status, code });
    }
    return result;
  }

  status() { return this.#request('status'); }
  capabilities() { return this.dispatch('capabilities'); }
  dispatch(action, payload = {}, { idempotencyKey } = {}) {
    if (!CORE_ACTIONS.includes(action)) throw new ChlomCoreError('This action is outside the core dispatcher contract.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ChlomCoreError('Payload must be a JSON object.');
    if (!READ_ACTIONS.has(action) && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey))) throw new ChlomCoreError('Mutations require a stable 16–128 character idempotency key.');
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey))) throw new ChlomCoreError('Invalid idempotency key.');
    return this.#request('operator', { action, payload, idempotencyKey });
  }
}
