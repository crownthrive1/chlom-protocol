import { access, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { posix } from 'node:path';

const required = [
  'public/index.html',
  'public/release.html',
  'public/release.js',
  'public/proof-core.js',
  'api/wallet.js',
  'api/protocol.js',
  'public/styles.css',
  'public/app.js',
  'api/health.js',
  'api/rpc.js',
  'api/analytics.js',
  'api/attest.js',
  'api/mcp.js',
];

for (const file of required) {
  await access(file, constants.R_OK);
}

const index = await readFile('public/index.html', 'utf8');
if (!index.includes('CHLOM Chain Evidence Fabric')) {
  throw new Error('Static control surface identity validation failed.');
}

await writeFile(
  'public/build.json',
  JSON.stringify(
    {
      schema: 'ct.chlom.static-build.v1',
      service: 'chlom-chain-evidence-fabric',
      version: '1.2.0',
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || 'local',
    },
    null,
    2,
  ) + '\n',
);

console.log('CHLOM_STATIC_FUNCTION_RUNTIME_BUILD_PASS');

await mkdir('public/documentation', { recursive: true });
const documentation = [
 ['docs/INSTALLATION.md','installation.md'],
 ['docs/DATABASE_INSTALLATION.md','database-installation.md'],
 ['installation/database/workspace-bootstrap-v1.sql','workspace-bootstrap-v1.sql'],
 ['installation/database/workspace-verification-v1.sql','workspace-verification-v1.sql'],
 ['docs/CHLOM-CHAIN-EVIDENCE-FABRIC.md','architecture.md'],
 ['docs/CHLOM_RELEASE_1_2.md','release-notes.md'],
 ['docs/PROTOCOL_API_1_2.md','protocol-api.md'],
 ['LICENSE','license.txt'],
];
const publishedPaths = new Map(documentation);
const sourceRef = process.env.VERCEL_GIT_COMMIT_SHA || 'main';
for (const [source, destination] of documentation) {
  if (!source.endsWith('.md')) {
    await copyFile(source, `public/documentation/${destination}`);
    continue;
  }
  const contents = (await readFile(source, 'utf8')).replace(/(\[[^\]]+\]\()([^\s)]+)(\))/g, (link, open, target, close) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) return link;
    const [path, fragment] = target.split('#');
    const resolved = posix.normalize(posix.join(posix.dirname(source), path));
    const href = publishedPaths.get(resolved) || `https://github.com/crownthrive1/chlom-protocol/blob/${sourceRef}/${resolved}`;
    return `${open}${href}${fragment ? '#' + fragment : ''}${close}`;
  });
  await writeFile(`public/documentation/${destination}`, contents);
}
