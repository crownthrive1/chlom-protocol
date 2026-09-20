import test from 'node:test';
import assert from 'node:assert/strict';
import { ChlomCoreClient } from '../sdk/core-client.mjs';

test('public status never sends the user bearer token and rejects redirect responses', async () => {
  const client = new ChlomCoreClient({ baseUrl: 'https://core.example.test', accessToken: 'private-user-jwt', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://core.example.test/api/core?route=status');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    return Response.json({ ok: true, source: 'fixture' });
  } });
  assert.equal((await client.status()).source, 'fixture');
});

test('mutation requires a stable idempotency key and forwards the exact user identity', async () => {
  let calls = 0;
  const client = new ChlomCoreClient({ baseUrl: 'https://core.example.test', accessToken: 'private-user-jwt', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer private-user-jwt');
    assert.equal(options.headers['Idempotency-Key'], 'fixture-operation-001');
    assert.deepEqual(JSON.parse(options.body), { action: 'report_oracle_signal', payload: { source: 'fixture' } });
    return Response.json({ ok: true, data: { receipt: 'fixture' } });
  } });
  assert.throws(() => client.dispatch('report_oracle_signal', {}), /idempotency/);
  assert.throws(() => client.dispatch('external_money_movement', {}, { idempotencyKey: 'fixture-operation-001' }), /outside/);
  assert.equal(calls, 0);
  await client.dispatch('report_oracle_signal', { source: 'fixture' }, { idempotencyKey: 'fixture-operation-001' });
  assert.equal(calls, 1);
});

test('authorization failures do not echo upstream secrets or become successful results', async () => {
  const client = new ChlomCoreClient({ baseUrl: 'https://core.example.test', accessToken: 'private-user-jwt', fetchImpl: async () => Response.json({ ok: false, code: 'OPERATOR_DENIED', error: 'private-user-jwt' }, { status: 403 }) });
  await assert.rejects(client.capabilities(), error => error.status === 403 && !error.message.includes('private-user-jwt'));
  const anonymous = new ChlomCoreClient({ baseUrl: 'https://core.example.test' });
  await assert.rejects(anonymous.capabilities(), /user access token/);
});

test('a partial public status remains inspectable without promoting unavailable components', async () => {
  const client = new ChlomCoreClient({ baseUrl: 'https://core.test', fetchImpl: async () => Response.json({ ok: false, availability: { protocol: 'available', wallet: 'unavailable' } }) });
  const result = await client.status();
  assert.equal(result.ok, false);
  assert.equal(result.availability.wallet, 'unavailable');
});

test('client rejects unsafe origin configuration and oversized replies', async () => {
  for (const baseUrl of ['http://remote.test', 'https://u:p@core.test', 'https://core.test/path', 'https://core.test/?token=bad']) assert.throws(() => new ChlomCoreClient({ baseUrl }));
  const client = new ChlomCoreClient({ baseUrl: 'https://core.test', fetchImpl: async () => new Response(' '.repeat(2 * 1024 * 1024 + 1)) });
  await assert.rejects(client.status(), /exceeded/);
});
