import { pathToFileURL } from 'node:url';

export function installationPreflight(env = process.env, { production = false, nodeVersion = process.versions.node } = {}) {
  const errors = [];
  const warnings = [];
  if (Number(nodeVersion.split('.')[0]) !== 24) errors.push('Use Node.js 24.x, as declared by this release.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be an integer from 1 through 65535.');
  for (const flag of ['CHLOM_TRUST_PROXY', 'CHLOM_CHAIN_WRITE_ENABLED']) {
    if (env[flag] && !['true', 'false'].includes(env[flag])) errors.push(`${flag} must be true or false.`);
  }

  const base = env.CHLOM_LEX_SUPABASE_URL;
  const key = env.CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY;
  if (Boolean(base) !== Boolean(key)) errors.push('Configure both CHLOM_LEX_SUPABASE_URL and CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY.');
  if (base) {
    try {
      const url = new URL(base);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    } catch { errors.push('CHLOM_LEX_SUPABASE_URL must be an HTTPS origin without credentials, a path, or a query.'); }
  }
  if (key) {
    let publishable = /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
    if (!publishable) {
      try {
        const parts = key.split('.');
        const claims = JSON.parse(Buffer.from(parts[1] || '', 'base64url').toString('utf8'));
        publishable = parts.length === 3 && claims.role === 'anon';
      } catch { /* The following error does not expose the supplied key. */ }
    }
    if (!publishable) errors.push('CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon JWT, never a service-role/secret key.');
  }
  if (!base && !key) {
    (production ? errors : warnings).push('LEX cloud workspace is unconfigured. The local server only exposes its health route until an explicit backend is configured.');
  }
  if (env.CHLOM_PUBLIC_ORIGIN) {
    try {
      const url = new URL(env.CHLOM_PUBLIC_ORIGIN);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    } catch { errors.push('CHLOM_PUBLIC_ORIGIN must be the HTTPS origin users will visit.'); }
  } else if (production) errors.push('Set CHLOM_PUBLIC_ORIGIN to the public HTTPS origin.');
  if (env.CHLOM_TRUST_PROXY === 'true') warnings.push('Proxy headers are trusted: restrict the application port to your reverse proxy and preserve the original Host header.');
  if (env.CHLOM_API_TOKEN && env.CHLOM_API_TOKEN.length < 32) errors.push('CHLOM_API_TOKEN must contain at least 32 characters.');
  else if (!env.CHLOM_API_TOKEN) (production ? errors : warnings).push('CHLOM_API_TOKEN is unset; protected protocol APIs remain unavailable.');
  if (env.CHLOM_WALLET_CHALLENGE_SECRET && Buffer.byteLength(env.CHLOM_WALLET_CHALLENGE_SECRET) < 32) errors.push('CHLOM_WALLET_CHALLENGE_SECRET must contain at least 32 bytes.');
  else if (!env.CHLOM_WALLET_CHALLENGE_SECRET) warnings.push('Wallet message proof is unconfigured; wallet discovery and connection remain available.');
  if (env.CHLOM_CHAIN_WRITE_ENABLED === 'true' && (env.CHLOM_GOVERNANCE_STATE !== 'promoted' || !env.CHLOM_ECAC_DIGEST)) {
    errors.push('Chain writes require a promoted governance state and the existing CHLOM_ECAC_DIGEST authority binding.');
  }
  const rpcConfigured = Object.keys(env).some(name => /^(CHLOM|QUICKNODE|ALCHEMY|INFURA|GOOGLE_BLOCKCHAIN)_RPC_/.test(name) && env[name]);
  if (!rpcConfigured) warnings.push('No chain RPC endpoint is configured; provider-backed chain calls remain unavailable.');
  if (env.GCP_PROJECT_ID && !env.VERCEL) warnings.push('Self-hosted BigQuery uses Google Application Default Credentials; a project ID alone does not configure identity.');
  return { schema: 'ct.chlom.installation-preflight.v1', ok: errors.length === 0, mode: production ? 'production' : 'local', errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = installationPreflight(process.env, { production: process.argv.includes('--production') });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
