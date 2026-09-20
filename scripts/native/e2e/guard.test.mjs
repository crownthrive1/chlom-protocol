import assert from 'node:assert/strict';
import test from 'node:test';
import { loopbackEndpoint } from './guard.mjs';

test('only explicit loopback WebSocket endpoints can receive development signatures', () => {
  assert.equal(loopbackEndpoint('ws://127.0.0.1:9944'), 'ws://127.0.0.1:9944/');
  assert.equal(loopbackEndpoint('ws://[::1]:9944'), 'ws://[::1]:9944/');
  for (const endpoint of [
    'wss://rpc.polkadot.io:443', 'ws://192.168.1.2:9944', 'ws://0.0.0.0:9944',
    'ws://localhost:9944', 'ws://127.0.0.1.nip.io:9944', 'http://127.0.0.1:9944',
    'ws://127.0.0.1:9944/proxy', 'ws://user:password@127.0.0.1:9944',
    'ws://127.0.0.1:9944?target=remote', 'ws://127.0.0.1:9944#fragment', 'ws://127.0.0.1',
  ]) assert.throws(() => loopbackEndpoint(endpoint), endpoint);
});
