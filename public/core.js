import { WalletConnection, BASE_CHAIN, walletError } from './wallet-connection.js';

const $ = selector => document.querySelector(selector);
const H = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const endpoints = [
  ['coreHealth', 'Core runtime', '/api/core?route=health'],
  ['core', 'Core status', '/api/core?route=status'],
  ['protocol', 'Policy, utility & evidence', '/api/protocol'],
  ['wallet', 'Wallet verifier', '/api/wallet?route=status'],
  ['chain', 'Chain adapters', '/api/health'],
];
let observedResponses = null;
let refreshing = false;

async function jsonRequest(url, body) {
  const response = await fetch(url, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : {'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000)});
  let data;
  try { data = await response.json(); } catch { throw Error(`The service returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok || data.ok === false) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message || `The request returned HTTP ${response.status}.`;
    const error = new Error(String(message).slice(0,500)); error.code = data.code || data.error?.code; error.status = response.status; throw error;
  }
  return data;
}
function label(selector, text, good = false) {
  const element = $(selector); element.textContent = text; element.classList.toggle('available', good);
}
function field(labelText, value) {
  const line = document.createElement('div'); const label = document.createElement('span'); const strong = document.createElement('strong');
  label.textContent = labelText; strong.textContent = value; line.append(label,strong); return line;
}
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function refreshStatus() {
  if (refreshing) return;
  refreshing = true; $('#refresh-status').disabled = true;
  const results = await Promise.all(endpoints.map(async ([key,title,url]) => {
    try {
      const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      return {key,title,url,http_status:response.status,responded:true,ok:response.ok && data.ok !== false,data};
    } catch(error) { return {key,title,url,responded:false,ok:false,error:'The endpoint did not return a readable response.'}; }
  }));
  const byKey = Object.fromEntries(results.map(result => [result.key,result]));
  observedResponses = {schema:'ct.chlom.browser-capability-readback.v1',observed_at:new Date().toISOString(),origin:location.origin,responses:results};
  const health = byKey.coreHealth.ok ? byKey.coreHealth.data : null;
  const core = byKey.core.responded && byKey.core.data?.source === 'canonical_chlom_core' ? byKey.core.data : null;
  const protocol = byKey.protocol.ok ? byKey.protocol.data : null;
  const chain = byKey.chain.responded ? byKey.chain.data : null;
  const configured = health?.backend_configured === true;
  $('#overall-status').textContent = health ? 'CHLOM core endpoint responded' : 'Core runtime response unavailable';
  $('#observed-at').textContent = 'Observed '+new Date(observedResponses.observed_at).toLocaleString();
  $('#core-state').textContent = health ? (configured ? 'Backend configured' : 'Configuration needed') : 'Unavailable';
  $('#policy-state').textContent = protocol ? protocol.policyRegistry === 'configured' ? 'Configured' : protocol.policyRegistry === 'invalid' ? 'Invalid configuration' : 'Not configured' : 'Unavailable';
  const providers = chain?.readiness?.configuredRpcChains;
  const chainCount = Array.isArray(providers) ? providers.length : null;
  $('#chain-state').textContent = chainCount === null ? 'Unavailable' : `${chainCount} configured`;
  label('#identity-badge', core?.protocol ? 'Core status available' : configured ? 'Backend configured' : 'Core not verified', Boolean(core?.protocol));
  const dail = core?.protocol?.dail || core?.control_plane?.dail;
  label('#ledger-badge', dail?.integrity_state ? dail.integrity_state.replaceAll('_',' ') : 'Core not verified', dail?.verified_prefix_ok === true && dail?.sequence_span_lag === 0);
  label('#policy-badge', protocol?.policyRegistry === 'configured' ? 'Registry configured' : protocol?.policyRegistry === 'invalid' ? 'Configuration invalid' : 'Registry not configured', protocol?.policyRegistry === 'configured');
  label('#utility-badge', protocol?.utilityRegistry === 'configured' ? 'Registry configured' : protocol?.utilityRegistry === 'invalid' ? 'Configuration invalid' : 'Registry not configured', protocol?.utilityRegistry === 'configured');
  const zk = protocol?.zeroKnowledge;
  label('#proof-badge', zk?.verifierAvailable ? zk.configuredCircuitActive ? 'Circuit registry configured' : 'Verifier installed · no circuit' : 'Verifier not observed', Boolean(zk?.verifierAvailable));
  label('#chain-badge', chainCount ? `${chainCount} RPC providers configured` : chain?.readiness?.googleAnalyticsConfigured ? 'Analytics configured' : 'Providers not verified', Boolean(chainCount || chain?.readiness?.googleAnalyticsConfigured));
  $('#core-description').textContent = core ? core.ok ? 'This installation returned CHLOM core status. Inspect the exact response below for authority, ledger, and service states.' : 'Some core status sources responded; others are unavailable. The exact response identifies each source. Available observations are shown below.' : configured ? 'The core backend is configured, but its status response is unavailable. Configuration alone does not prove that records or operations are ready.' : 'The core interface is installed. Configure and verify its CHLOM backend to expose governed records and authorized operations.';
  const coreFields = $('#core-detail'); coreFields.replaceChildren();
  coreFields.append(field('Interface','CHLOM core'),field('Backend configuration',health ? configured ? 'Configured' : 'Not configured' : 'Unknown'),field('Core status',core ? 'Response received' : 'Not verified'));
  if (health?.version) coreFields.append(field('Runtime version',health.version));
  if (core?.source) coreFields.append(field('Status source',core.source));
  if (core?.observed_at) coreFields.append(field('Source observation',core.observed_at));
  for(const [key,title] of [['ownership_interest_count','Ownership-interest records'],['rights_instrument_count','Rights instruments'],['dla_version_count','DLA versions'],['policy_pack_count','Core policy packs'],['production_zk_circuit_count','Production ZK circuits'],['tokenomics_issuance_executed_count','Executed token issuance']]) {
    const value = core?.protocol?.[key]; if(Number.isSafeInteger(value) && value >= 0) coreFields.append(field(title,value.toLocaleString()));
  }
  if(dail?.integrity_state) coreFields.append(field('DAIL integrity state',dail.integrity_state.replaceAll('_',' ')));
  if(Number.isSafeInteger(dail?.sequence_span_lag)) coreFields.append(field('DAIL sequence lag',dail.sequence_span_lag.toLocaleString()));
  if(core?.control_plane?.release_state) coreFields.append(field('Control-plane release',core.control_plane.release_state.replaceAll('_',' ')));
  const operations = $('#core-operations'); operations.replaceChildren();
  const note = document.createElement('p'); note.textContent = 'Core identities, rights, ledger records, and operator permissions are separate from the LEX workspace.'; operations.append(note);
  const receipts = $('#receipt-list'); receipts.replaceChildren();
  for (const result of results) {
    const details = document.createElement('details'); const summary = document.createElement('summary'); const span = document.createElement('span'); const pre = document.createElement('pre');
    summary.append(document.createTextNode(result.title)); span.textContent = result.responded ? `HTTP ${result.http_status}` : 'Unavailable'; summary.append(span);
    pre.textContent = JSON.stringify(result.data || {error:result.error},null,2); details.append(summary,pre); receipts.append(details);
  }
  $('#download-readback').disabled = false; $('#refresh-status').disabled = false; refreshing = false;
}
$('#refresh-status').addEventListener('click', refreshStatus);
$('#download-readback').addEventListener('click',() => { if(observedResponses) download('chlom-core-observed-capabilities.json',observedResponses); });

const wallet = new WalletConnection({onChange:drawWallet});
const NETWORKS = {'0x1':'Ethereum','0x2105':'Base','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum One','0xaa36a7':'Sepolia testnet','0x14a34':'Base Sepolia testnet'};
const UNITS = {'0x1':'ETH','0x2105':'ETH','0x89':'POL','0xa':'ETH','0xa4b1':'ETH','0xaa36a7':'test ETH','0x14a34':'test ETH'};
function walletButton(text, action, disabled = false, primary = false) { return `<button type="button" class="button ${primary ? '' : 'secondary'}" data-wallet-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`; }
function drawWallet() {
  const s = wallet.state; const active = Boolean(s.address); const expired = s.observation && Date.parse(s.observation.expires_at) <= Date.now();
  $('#core-wallet').innerHTML = `<article class="panel"><p class="eyebrow">${active ? 'CONNECTED TO CHLOM' : 'CONNECT AN EXISTING WALLET'}</p><h3>${active ? H(s.name) : 'Choose your wallet.'}</h3>${active ? `<p class="hash">${H(s.address)}</p><p>${H(NETWORKS[s.chain] || 'EVM network')} · Chain ${H(s.chain ? Number(BigInt(s.chain)) : 'unknown')}</p><div class="notice">Native balance: ${s.balance === null ? 'Unavailable' : H(s.balance)} ${H(UNITS[s.chain] || 'native units')}<br><small>Read through your wallet’s provider.</small></div><div class="actions">${walletButton('Refresh','refresh',s.pending)}${s.chain !== BASE_CHAIN ? walletButton('Switch to Base','switch',s.pending) : ''}${walletButton('Disconnect','disconnect')}</div><p class="small-note">Disconnect clears this page’s state. Revoke the site permission in your wallet to remove access there.</p>` : `<label class="field">Available wallets<select id="core-wallet-provider" ${s.pending ? 'disabled' : ''}>${wallet.providers.length ? wallet.providers.map(p => `<option value="${H(p.id)}">${H(p.name)}</option>`).join('') : '<option value="">No wallet detected</option>'}</select></label><div class="actions">${walletButton(s.pending ? 'Check your wallet…' : 'Connect wallet','connect',s.pending || !wallet.providers.length,true)}${walletButton('Find wallets','discover',s.pending)}</div><p class="small-note">On mobile, open this page in your wallet’s browser. On desktop, unlock an installed EVM wallet extension. Wallet names are supplied by extensions; verify the account and domain in your wallet.</p>`}${s.pending ? '<p role="status">Waiting for the wallet or verifier…</p>' : ''}${s.error ? `<p class="error" role="alert">${H(s.error)}</p>` : ''}</article><article class="panel"><p class="eyebrow">SCOPED SIGNATURE OBSERVATION</p><h3>Confirm control. Keep your keys.</h3><p>Review a short-lived message, sign it in your wallet, and let CHLOM recover the signer’s public address.</p>${s.observation ? `<div class="${expired ? 'notice' : 'success'}"><strong>${expired ? 'Observation expired.' : 'Signature verified.'}</strong><p class="hash">${H(s.observation.address)}</p><small>Expires ${H(new Date(s.observation.expires_at).toLocaleString())}.</small></div>` : ''}${s.challenge ? `<details open><summary>Exact message to sign</summary><pre>${H(s.challenge.message)}</pre></details><div class="actions">${walletButton('Sign reviewed message','sign',s.pending,true)}${walletButton('New message','prepare',s.pending)}</div>` : `<div class="actions">${walletButton(s.observation ? 'Verify again' : 'Prepare verification','prepare',s.pending || !active || s.status?.proof_verification !== true)}</div>`}${s.status?.proof_verification === false ? '<p class="notice">Signature verification needs server configuration. Wallet connection remains available.</p>' : ''}<p class="small-note">This observation does not sign you in, link a core account, grant rights, approve spending, or execute a transaction. Contract-wallet signatures and WalletConnect QR pairing require separate support.</p></article>`;
}
$('#core-wallet').addEventListener('click',async event => {
  const button = event.target.closest('[data-wallet-action]'); if(!button) return;
  const action = button.dataset.walletAction;
  if(action === 'disconnect') {wallet.disconnect();return;}
  if(action === 'discover') {wallet.discover();return;}
  if(wallet.state.pending) return;
  if(action === 'connect') {try {await wallet.connect($('#core-wallet-provider')?.value);} catch {} return;}
  wallet.state.pending = true; wallet.state.error = ''; drawWallet();
  try {
    if(action === 'refresh') await wallet.refresh();
    else if(action === 'switch') await wallet.switchToBase();
    else if(action === 'prepare') await wallet.prepareProof();
    else if(action === 'sign') await wallet.signProof();
  } catch(error) {wallet.state.error = walletError(error);}
  finally {wallet.state.pending = false;drawWallet();}
});

function updateNavigation() {
  const hash = location.hash || '#overview';
  for(const link of document.querySelectorAll('.rail nav a')) {
    const active = link.getAttribute('href') === hash; link.classList.toggle('active',active); if(active) link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
  }
}
addEventListener('hashchange',updateNavigation); updateNavigation();
wallet.discover(); wallet.loadStatus(); refreshStatus();

// Operator and resolver requests use the dedicated CHLOM core session, never LEX.
export {jsonRequest};
