import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { MAX_REQUEST_BYTES } from '../lib/runtime/constants.js';
import { installationPreflight } from './install-preflight.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
const fail = (status, message) => Object.assign(new Error(message), { status });

function safePath(rawUrl) {
  const raw = (rawUrl || '/').split('?')[0];
  if (!raw.startsWith('/') || raw.startsWith('//') || /%2f|%5c/i.test(raw)) throw fail(400, 'Invalid request path.');
  let path;
  try { path = decodeURIComponent(raw); } catch { throw fail(400, 'Invalid path encoding.'); }
  if (/[\\\0-\x1f]/.test(path) || path.split('/').some(part => part.startsWith('.'))) throw fail(400, 'Invalid request path.');
  return path;
}

function json(response, status, payload) {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.end(JSON.stringify(payload));
}

function readBody(request, limit) {
  return new Promise((accept, reject) => {
    let size = 0;
    const chunks = [];
    function cleanup() { request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted); }
    function error(cause) { cleanup(); reject(cause); }
    function aborted() { error(fail(400, 'Request body was interrupted.')); }
    function data(chunk) {
      size += chunk.length;
      if (size > limit) { cleanup(); request.resume(); reject(fail(413, 'Request body exceeds the governed payload limit.')); return; }
      chunks.push(chunk);
    }
    function end() { cleanup(); accept(size ? Buffer.concat(chunks).toString('utf8') : undefined); }
    if (Number(request.headers['content-length'] || 0) > limit) { request.resume(); reject(fail(413, 'Request body exceeds the governed payload limit.')); return; }
    request.on('data', data); request.on('end', end); request.on('error', error); request.on('aborted', aborted);
  });
}

function normalizeProxyHeaders(request, trustProxy) {
  const forwardedIp = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const forwardedProto = request.headers['x-forwarded-proto'];
  for (const name of Object.keys(request.headers)) if (name.startsWith('x-forwarded-') || name === 'forwarded') delete request.headers[name];
  request.headers['x-forwarded-for'] = trustProxy && isIP(forwardedIp) ? forwardedIp : request.socket.remoteAddress || 'unknown';
  request.headers['x-forwarded-host'] = request.headers.host;
  request.headers['x-forwarded-proto'] = request.socket.encrypted || (trustProxy && forwardedProto === 'https') ? 'https' : 'http';
}

async function publicFile(publicRoot, path) {
  const candidates = path === '/' ? ['index.html'] : [path.slice(1), ...(extname(path) ? [] : [path.slice(1) + '.html', path.slice(1).replace(/\/$/, '') + '/index.html'])];
  for (const name of candidates) {
    let target;
    try { target = await realpath(resolve(publicRoot, name)); } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue; throw error; }
    const fromRoot = relative(publicRoot, target);
    if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep)) throw fail(403, 'File is outside the public directory.');
    const info = await stat(target);
    if (info.isFile()) return { target, info };
  }
  return null;
}

export async function createChlomServer({ root = ROOT, env = process.env } = {}) {
  const publicRoot = await realpath(resolve(root, 'public'));
  const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
  const handlers = new Map();
  for (const file of await readdir(resolve(root, 'api'))) {
    if (!/^[a-z][a-z0-9-]*\.js$/.test(file)) continue;
    const module = await import(pathToFileURL(resolve(root, 'api', file)).href);
    if (typeof module.default === 'function') handlers.set('/api/' + file.slice(0, -3), module.default);
  }
  const rewrites = new Map((config.rewrites || []).filter(row => !row.source.includes(':') && handlers.has(row.destination)).map(row => [row.source, row.destination]));
  const securityHeaders = (config.headers || []).find(row => row.source === '/(.*)')?.headers || [];
  const lexConfigured = Boolean(env.CHLOM_LEX_SUPABASE_URL && env.CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY);
  const server = createServer({ maxHeaderSize: 16384 }, async (request, response) => {
    for (const { key, value } of securityHeaders) response.setHeader(key, value);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status = code => { response.statusCode = code; return response; };
    response.json = payload => { json(response, response.statusCode || 200, payload); return response; };
    try {
      normalizeProxyHeaders(request, env.CHLOM_TRUST_PROXY === 'true');
      const path = safePath(request.url);
      if (path === '/readyz') {
        request.resume();
        if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); return json(response, 405, { ok: false, error: 'Method not allowed.' }); }
        return json(response, 200, { ok: true, service: 'chlom-installation', process: 'listening', provider_readiness: '/api/health' });
      }
      const route = rewrites.get(path) || path.replace(/\.js$/, '');
      const handler = handlers.get(route);
      if (handler) {
        if (env.CHLOM_PUBLIC_ORIGIN && request.headers.origin && request.headers.origin !== new URL(env.CHLOM_PUBLIC_ORIGIN).origin) throw fail(403, 'Request Origin is not the configured public origin.');
        if (route === '/api/lex' && !lexConfigured && !(request.method === 'GET' && (new URL(request.url, 'http://local.invalid').searchParams.get('route') || 'health') === 'health')) {
          throw fail(503, 'LEX cloud workspace is unconfigured. Configure CHLOM_LEX_SUPABASE_URL and CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY for this installation.');
        }
        if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') throw fail(415, 'Compressed request bodies are not supported.');
        const limit = { '/api/core': 64 * 1024, '/api/lex': 80 * 1024, '/api/wallet': 4096, '/api/protocol': 64 * 1024 }[route] || MAX_REQUEST_BYTES;
        request.body = await readBody(request, limit);
        if (request.body !== undefined && !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw fail(415, 'Use an application/json request.');
        return await handler(request, response);
      }
      if (path.startsWith('/api/')) throw fail(404, 'API route not found.');
      request.resume();
      if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); throw fail(405, 'Method not allowed.'); }
      const file = await publicFile(publicRoot, path);
      if (!file) throw fail(404, 'Page not found.');
      response.setHeader('Content-Type', MIME[extname(file.target).toLowerCase()] || 'application/octet-stream');
      response.setHeader('Content-Length', file.info.size);
      response.setHeader('Cache-Control', 'no-cache');
      if (request.method === 'HEAD') return response.end();
      await pipeline(createReadStream(file.target), response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      request.resume();
      if ([413, 415].includes(error.status)) response.setHeader('Connection', 'close');
      json(response, error.status || 500, { ok: false, error: error.status ? error.message : 'The local runtime could not complete this request.' });
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.timeout = 35000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = installationPreflight();
  if (!report.ok) { console.error(JSON.stringify(report, null, 2)); process.exitCode = 1; }
  else {
    for (const warning of report.warnings) console.warn(warning);
    const server = await createChlomServer();
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT || 3000);
    server.listen(port, host, () => console.log(`CHLOM listening at http://${host}:${port}. Liveness: /readyz; provider diagnostics: /api/health.`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      server.close(() => { process.exitCode = 0; });
      const timer = setTimeout(() => server.closeAllConnections(), 10000);
      timer.unref();
    });
  }
}
