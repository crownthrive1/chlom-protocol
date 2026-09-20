#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { verifyZkProof, ZK_LIMITS } from '../lib/protocol/zk.js';

async function boundedJson(path, maxBytes) {
  if ((await stat(path)).size > maxBytes) throw new Error('File exceeds its size limit.');
  const value = await readFile(path);
  if (value.byteLength > maxBytes) throw new Error('File exceeds its size limit.');
  return JSON.parse(value.toString('utf8'));
}
try {
  const [registryPath, requestPath, extra] = process.argv.slice(2);
  if (!registryPath || !requestPath || extra) throw new Error('Usage: node scripts/verify-zk.mjs approved-registry.json proof-request.json');
  const registry = await boundedJson(registryPath, 64 * 1024);
  const request = await boundedJson(requestPath, ZK_LIMITS.inputBytes);
  const result = await verifyZkProof(request, registry);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || 'CHLOM_ZK_LOCAL_ERROR', message: error.message })}\n`);
  process.exitCode = 2;
}
