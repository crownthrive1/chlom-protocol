import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { options } from './guard.mjs';

const args = options(process.argv.slice(2), ['--binary', '--output']);
assert.ok(args['--binary'] && args['--output'], 'Usage: npm run node -- --binary /path/chlom-node --output /path/receipt.json');
const binary = resolve(args['--binary']);
const output = resolve(args['--output']);
assert.ok((await stat(binary)).isFile(), 'Node binary must be a regular file');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schema: 'chlom.native.rpc-acceptance.v1', status: 'RUNNING', fixture: 'synthetic-development-only' }, null, 2)}\n`, { mode: 0o600 });
const log = await open(`${output}.node.log`, 'w', 0o600);
const hash = createHash('sha256');
for await (const chunk of createReadStream(binary)) hash.update(chunk);
const binarySha256 = hash.digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const rpcPort = await freePort();
const p2pPort = await freePort();
const nodeArgs = [
  '--dev', '--tmp', '--rpc-port', String(rpcPort), '--rpc-methods', 'safe',
  '--listen-addr', `/ip4/127.0.0.1/tcp/${p2pPort}`, '--reserved-only', '--no-mdns',
  '--no-telemetry', '--no-prometheus', '--name', 'chlom-synthetic-rpc-acceptance',
];
const node = spawn(binary, nodeArgs, { stdio: ['ignore', log.fd, log.fd] });
const nodeExited = new Promise((resolve) => node.once('exit', resolve));
let nodeError;
node.once('error', (error) => { nodeError = error; });
let acceptance;
const cleanup = async () => {
  if (acceptance && acceptance.exitCode === null) acceptance.kill('SIGTERM');
  if (node.exitCode === null) {
    node.kill('SIGINT');
    await Promise.race([nodeExited, sleep(10_000)]);
    if (node.exitCode === null) node.kill('SIGKILL');
  }
  await log.close();
};
try {
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (nodeError) throw nodeError;
    assert.equal(node.exitCode, null, `Node exited early; inspect ${output}.node.log`);
    try {
      const response = await fetch(`http://127.0.0.1:${rpcPort}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system_chain', params: [] }),
        signal: AbortSignal.timeout(2_000), redirect: 'error',
      });
      const body = await response.json();
      if (response.ok && body.result === 'CHLOM Development') { ready = true; break; }
    } catch { /* Runtime compilation can precede the RPC listener. */ }
    await sleep(500);
  }
  assert.ok(ready, `Development node did not become ready; inspect ${output}.node.log`);
  const acceptancePath = fileURLToPath(new URL('./acceptance.mjs', import.meta.url));
  acceptance = spawn(process.execPath, [acceptancePath, '--rpc', `ws://127.0.0.1:${rpcPort}`, '--output', output], { stdio: 'inherit' });
  const exitCode = await new Promise((resolve, reject) => {
    acceptance.once('error', reject);
    acceptance.once('exit', resolve);
  });
  assert.equal(exitCode, 0, 'Signed RPC acceptance failed');
  const report = JSON.parse(await readFile(output, 'utf8'));
  Object.assign(report, { binarySha256, nodeArguments: nodeArgs, isolatedNodeLaunched: true, nodeLog: `${output}.node.log` });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.error(`PASS isolated signed RPC acceptance; receipt ${output}; node SHA-256 ${binarySha256}`);
} finally {
  await cleanup();
}
