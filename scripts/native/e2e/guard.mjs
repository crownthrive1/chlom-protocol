import assert from 'node:assert/strict';

/** The acceptance harness never signs toward a DNS name or a non-loopback IP. */
export function loopbackEndpoint(input) {
  const url = new URL(input);
  assert.equal(url.protocol, 'ws:', 'Use an explicit ws:// loopback endpoint');
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'RPC must use a literal loopback address');
  assert.ok(url.port && Number(url.port) > 0, 'Specify the local RPC port');
  assert.ok(!url.username && !url.password && !url.search && !url.hash, 'Credentials and URL parameters are forbidden');
  assert.equal(url.pathname, '/', 'RPC must use the root endpoint');
  return url.href;
}

export function options(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    assert.ok(allowed.includes(name), `Unsupported argument ${name}`);
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${name}`);
    assert.ok(!(name in result), `Repeated argument ${name}`);
    result[name] = args[i + 1];
  }
  return result;
}
