import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChlomServer } from '../scripts/serve-local.mjs';
import { installationPreflight } from '../scripts/install-preflight.mjs';

async function fixture(t, env = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chlom-install-'));
  await mkdir(join(root, 'public'));
  await mkdir(join(root, 'api'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'public', 'index.html'), '<h1>CHLOM</h1>');
  await writeFile(join(root, 'public', 'protocol.html'), '<h1>Protocol</h1>');
  await writeFile(join(root, 'private.txt'), 'private material');
  await symlink(join(root, 'private.txt'), join(root, 'public', 'outside.txt'));
  await writeFile(join(root, 'vercel.json'), JSON.stringify({ rewrites: [{ source: '/api/v1/echo', destination: '/api/echo' }], headers: [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }] }));
  const echo = `export default function(req,res){let body;try{body=req.body===undefined?null:JSON.parse(req.body);}catch{return res.status(400).json({ok:false});}return res.status(200).json({body,url:req.url,ip:req.headers['x-forwarded-for'],host:req.headers['x-forwarded-host'],proto:req.headers['x-forwarded-proto']});}`;
  await writeFile(join(root, 'api', 'echo.js'), echo);
  await writeFile(join(root, 'api', 'lex.js'), echo);
  const server = await createChlomServer({ root, env });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  t.after(async () => { await new Promise(accept => server.close(accept)); await rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, server };
}

function raw(origin, path, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((accept, reject) => {
    const req = httpRequest(origin + '/', { path, method, headers }, response => {
      const body = [];
      response.on('data', part => body.push(part));
      response.on('end', () => accept({ status: response.statusCode, headers: response.headers, body: Buffer.concat(body).toString('utf8') }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('installation serves clean HTML routes and HEAD, with security headers', async t => {
  const { origin } = await fixture(t);
  const page = await fetch(origin + '/protocol');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Protocol/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(origin + '/protocol', { method: 'HEAD' })).headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await fetch(origin + '/readyz')).status, 200);
  assert.equal((await fetch(origin + '/missing')).status, 404);
});

test('installation adapts status/json, preserves query strings, and rewrites API aliases', async t => {
  const { origin } = await fixture(t);
  const response = await fetch(origin + '/api/v1/echo?route=test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"test":42}' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.body, { test: 42 });
  assert.equal(data.url, '/api/v1/echo?route=test');
  assert.equal((await fetch(origin + '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(origin + '/api/echo', { method: 'POST', body: '{}' })).status, 415);
});

test('installation rejects traversal, encoded separators, dotfiles, and escaping symlinks', async t => {
  const { origin } = await fixture(t);
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/%2eenv', '/api%2fecho', '/%5cprivate.txt', '/%00', '/%FF']) assert.equal((await raw(origin, path)).status, 400, path);
  assert.equal((await raw(origin, '/outside.txt')).status, 403);
  assert.equal((await raw(origin, '/api/unknown')).status, 404);
});

test('installation bounds streamed bodies without trusting content-length', async t => {
  const { origin } = await fixture(t);
  const oversized = await raw(origin, '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, chunks: ['{"data":"', 'x'.repeat(70 * 1024), 'x'.repeat(70 * 1024), '"}'] });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.connection, 'close');
});

test('installation never forwards unconfigured LEX calls to the canonical tenant', async t => {
  const { origin } = await fixture(t);
  assert.equal((await fetch(origin + '/api/lex?route=health')).status, 200);
  for (const route of ['catalog', 'session', 'drafts']) assert.equal((await fetch(origin + '/api/lex?route=' + route)).status, 503);
});

test('installation ignores spoofed proxy headers unless explicitly trusted', async t => {
  const { origin } = await fixture(t);
  const response = await fetch(origin + '/api/echo', { headers: { 'x-forwarded-for': '203.0.113.8', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'attacker.invalid' } });
  const data = await response.json();
  assert.equal(data.ip, '127.0.0.1');
  assert.equal(data.proto, 'http');
  assert.equal(data.host, new URL(origin).host);
});

test('installation honors the configured public origin and restricted proxy mode', async t => {
  const { origin } = await fixture(t, { CHLOM_TRUST_PROXY: 'true', CHLOM_PUBLIC_ORIGIN: 'https://lex.example.test' });
  const response = await fetch(origin + '/api/echo', { headers: { origin: 'https://lex.example.test', 'x-forwarded-for': '203.0.113.8', 'x-forwarded-proto': 'https' } });
  const data = await response.json();
  assert.equal(data.ip, '203.0.113.8');
  assert.equal(data.proto, 'https');
  assert.equal((await fetch(origin + '/api/echo', { headers: { origin: 'https://evil.test' } })).status, 403);
});

test('installation preflight distinguishes local tools from a configured production installation', () => {
  assert.equal(installationPreflight({}, { nodeVersion: '24.1.0' }).ok, true);
  assert.equal(installationPreflight({}, { nodeVersion: '22.1.0' }).ok, false);
  assert.equal(installationPreflight({}, { production: true, nodeVersion: '24.1.0' }).ok, false);
  const config = { CHLOM_CORE_SUPABASE_URL: 'https://tenant.supabase.co', CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_only_1234567890', CHLOM_PUBLIC_ORIGIN: 'https://core.example.test' };
  assert.equal(installationPreflight(config, { production: true, nodeVersion: '24.1.0' }).ok, true);
  assert.equal(installationPreflight({ ...config, CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private_key' }).ok, false);
  assert.equal(installationPreflight({ ...config, CHLOM_CORE_SUPABASE_URL: 'https://user:secret@example.test' }).ok, false);
  assert.equal(installationPreflight({ ...config, CHLOM_LEX_SUPABASE_URL: 'https://other.supabase.co' }).ok, false);
  assert.equal(installationPreflight({ ...config, CHLOM_CHAIN_WRITE_ENABLED: 'true' }).ok, false);
  const onlyLex = { CHLOM_LEX_SUPABASE_URL: config.CHLOM_CORE_SUPABASE_URL, CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY: config.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY, CHLOM_PUBLIC_ORIGIN: config.CHLOM_PUBLIC_ORIGIN };
  assert.equal(installationPreflight(onlyLex, { production: true, nodeVersion: '24.1.0' }).ok, false);
});
