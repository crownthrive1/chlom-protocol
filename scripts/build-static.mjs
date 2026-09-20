import { access, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';

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
for (const [source, destination] of [
 ['docs/INSTALLATION.md','installation.md'],
 ['docs/DATABASE_INSTALLATION.md','database-installation.md'],
 ['installation/database/workspace-bootstrap-v1.sql','workspace-bootstrap-v1.sql'],
 ['installation/database/workspace-verification-v1.sql','workspace-verification-v1.sql'],
 ['docs/CHLOM-CHAIN-EVIDENCE-FABRIC.md','architecture.md'],
 ['docs/CHLOM_RELEASE_1_2.md','release-notes.md'],
 ['docs/PROTOCOL_API_1_2.md','protocol-api.md'],
 ['LICENSE','license.txt'],
]) await copyFile(source, `public/documentation/${destination}`);
