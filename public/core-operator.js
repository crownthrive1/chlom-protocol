import { jsonRequest } from './core.js';

const $ = selector => document.querySelector(selector);
const SUPPORTED_ACTIONS = [
  'register_asset_binding', 'record_ownership_interest', 'record_rights_instrument',
  'record_dla', 'record_lex_offer', 'record_agreement_entitlement', 'record_obligation',
  'record_revenue_policy', 'preview_settlement', 'register_token_candidate',
  'report_oracle_signal', 'bind_dail_proof',
];
const coreRequest = (route,body) => jsonRequest('/api/core?route='+route,body);
let actions = [];
let sessionUser = null;
let lastReceipt = null;
let requestBusy = false;
let sessionBusy = false;
function setOperationEnabled(enabled) {
  for(const selector of ['#operator-action','#operator-payload','#operator-key','#operator-reviewed','#operator-submit','#operator-new-key']) $(selector).disabled = !enabled;
}
function newKey() { $('#operator-key').value = 'chlom-core-ui-'+crypto.randomUUID(); $('#operator-reviewed').checked = false; }
function showSessionError(error) {
  $('#operator-session-error').textContent = [error.code,error.message].filter(Boolean).join(' — ');
  $('#operator-session-error').className = 'error';
}
function resetPermissions() {
  actions = []; setOperationEnabled(false); $('#operator-capabilities').hidden = true;
  $('#operator-capability-json').textContent = '';
  const option = document.createElement('option'); option.value = ''; option.textContent = 'No verified allowed operations';
  $('#operator-action').replaceChildren(option);
}
async function loadPermissions() {
  resetPermissions();
  const capabilities = await coreRequest('operator');
  const supplied = Array.isArray(capabilities.allowed_actions) ? capabilities.allowed_actions : [];
  actions = SUPPORTED_ACTIONS.filter(action => supplied.includes(action));
  $('#operator-capability-json').textContent = JSON.stringify(capabilities,null,2);
  $('#operator-capabilities').hidden = false;
  $('#operator-action').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = actions.length ? 'Choose an authorized operation' : 'No supported actions granted';
  $('#operator-action').append(placeholder);
  for(const action of actions) { const option = document.createElement('option'); option.value = action; option.textContent = action.replaceAll('_',' '); $('#operator-action').append(option); }
  setOperationEnabled(actions.length > 0);
  if(!$('#operator-key').value) newKey();
  $('#operator-request-status').textContent = actions.length ? `${actions.length} supported operations are allowed for this session. Final authorization is checked by CHLOM on every request.` : 'This account has no supported core operator actions. Account access alone does not grant authority.';
}
async function refreshSession() {
  if(sessionBusy || requestBusy) return;
  sessionBusy = true; $('#operator-session-error').textContent = ''; $('#operator-session-error').className = '';
  resetPermissions(); $('#operator-refresh').disabled = true;
  try {
    const session = await coreRequest('session'); sessionUser = session.user || null;
    $('#core-signin').hidden = Boolean(sessionUser); $('#operator-session-actions').hidden = !sessionUser;
    $('#operator-session').textContent = sessionUser ? `Signed in as ${sessionUser.email || sessionUser.id}.` : 'No CHLOM core session is active.';
    if(sessionUser) await loadPermissions();
  } catch(error) {
    sessionUser = null; $('#core-signin').hidden = false; $('#operator-session-actions').hidden = true;
    $('#operator-session').textContent = 'Core session or permission verification is unavailable.'; showSessionError(error);
  } finally {sessionBusy = false; $('#operator-refresh').disabled = false;}
}
$('#core-signin').addEventListener('submit',async event => {
  event.preventDefault(); if(sessionBusy || requestBusy) return;
  sessionBusy = true; const form = event.target; const button = form.querySelector('button'); button.disabled = true;
  $('#operator-session-error').textContent = '';
  const email = form.elements.email.value.trim(); const password = form.elements.password.value;
  form.elements.password.value = '';
  try {await coreRequest('signin',{email,password}); sessionBusy = false; await refreshSession();}
  catch(error) {showSessionError(error);}
  finally {sessionBusy = false; button.disabled = false;}
});
$('#core-signout').addEventListener('click',async () => {
  if(sessionBusy || requestBusy) return;
  sessionBusy = true; $('#core-signout').disabled = true;
  try {
    await coreRequest('logout',{}); sessionUser = null; lastReceipt = null;
    $('#operator-result').textContent = ''; $('#operator-result').hidden = true; $('#operator-download').hidden = true;
    $('#operator-payload').value = ''; $('#operator-key').value = ''; $('#operator-reviewed').checked = false;
    sessionBusy = false; await refreshSession();
  } catch(error) {showSessionError(error);}
  finally {sessionBusy = false; $('#core-signout').disabled = false;}
});
$('#operator-refresh').addEventListener('click',refreshSession);
$('#operator-new-key').addEventListener('click',newKey);
$('#operator-payload').addEventListener('input',() => {$('#operator-reviewed').checked = false;});
$('#operator-key').addEventListener('input',() => {$('#operator-reviewed').checked = false;});
$('#operator-action').addEventListener('change',() => {$('#operator-reviewed').checked = false;});
$('#operator-form').addEventListener('submit',async event => {
  event.preventDefault(); if(requestBusy || sessionBusy || !sessionUser) return;
  const action = $('#operator-action').value;
  if(!actions.includes(action) || !$('#operator-reviewed').checked) return;
  let payload;
  try {
    const raw = $('#operator-payload').value;
    if(new TextEncoder().encode(raw).length > 55000) throw Error('Keep the payload below 55,000 bytes.');
    try {payload = JSON.parse(raw);} catch {throw Error('Enter valid payload JSON.');}
    if(!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('The operation payload must be a JSON object.');
    const key = $('#operator-key').value.trim();
    if(!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) throw Error('Enter an idempotency key of 16–128 letters, numbers, dots, underscores, colons or hyphens.');
    requestBusy = true; setOperationEnabled(false); $('#operator-request-status').textContent = 'Submitting the reviewed request…';
    $('#operator-result').hidden = true; $('#operator-download').hidden = true; lastReceipt = null;
    const result = await coreRequest('operator',{action,payload,idempotency_key:key});
    lastReceipt = {schema:'ct.chlom.core.browser-operation-receipt.v1',observed_at:new Date().toISOString(),origin:location.origin,action,idempotency_key:key,response:result};
    $('#operator-result').textContent = JSON.stringify(result,null,2); $('#operator-result').hidden = false; $('#operator-download').hidden = false;
    $('#operator-request-status').textContent = 'CHLOM returned a response. Inspect its operation state and evidence; this receipt alone does not establish external execution.';
    $('#operator-reviewed').checked = false;
  } catch(error) {$('#operator-request-status').textContent = [error.code,error.message].filter(Boolean).join(' — ');}
  finally {requestBusy = false; setOperationEnabled(actions.length > 0 && Boolean(sessionUser));}
});
$('#operator-download').addEventListener('click',() => {
  if(!lastReceipt) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReceipt,null,2)+'\n'],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'chlom-core-operation-receipt.json'; link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#resolve-form').addEventListener('submit',async event => {
  event.preventDefault(); const form = event.target; const id = form.elements.public_id.value.trim();
  if(!/^ctid_[a-f0-9]{32}$/.test(id)) return;
  const button = form.querySelector('button'); button.disabled = true; $('#resolve-result').hidden = false; $('#resolve-result').textContent = 'Resolving public identity…';
  try {const result = await jsonRequest('/api/core?route=resolve&id='+encodeURIComponent(id)); $('#resolve-result').textContent = JSON.stringify(result,null,2);}
  catch(error) {$('#resolve-result').textContent = [error.code,error.message].filter(Boolean).join(' — ');}
  finally {button.disabled = false;}
});
refreshSession();
