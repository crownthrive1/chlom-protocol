/** CHLOM LEX web adapter. Existing CHLOM authority stays in the canonical dispatcher. */
const BASE = 'https://tzajnzshmtzjenqulehq.supabase.co';
// Publishable key, not an administrative credential. All private calls retain the caller JWT.
const KEY = 'sb_publishable_gMCE_lzPrynYgAEDs_xxyw_vWqR9irE';
const ACCESS = '__Host-chlomlex-access';
const REFRESH = '__Host-chlomlex-refresh';
const LIMIT = 80 * 1024;
const ACTIONS = new Set(['status','capabilities','register_asset_binding','record_ownership_interest','record_rights_instrument','record_dla','record_lex_offer','record_agreement_entitlement','record_obligation','record_revenue_policy','preview_settlement','register_token_candidate','report_oracle_signal','bind_dail_proof']);
const buckets = new Map();
function rateLimit(req, route) {
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = `${ip}:${route}`;
  const now = Date.now();
  let row = buckets.get(key);
  if (!row || row.until < now) { row = {count:0,until:now+60000}; buckets.set(key,row); }
  row.count++;
  if (buckets.size > 2000) for (const [k,v] of buckets) if (v.until < now) buckets.delete(k);
  const max = ['signin','signup','recover'].includes(route) ? 8 : 90;
  if (row.count > max) throw Object.assign(new Error('Too many requests. Please retry in one minute.'), {status:429});
}
export function cookies(req) {
  const result = {};
  for (const pair of String(req.headers.cookie || '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    try { result[pair.slice(0,index).trim()] = decodeURIComponent(pair.slice(index+1)); } catch { /* Ignore malformed cookies. */ }
  }
  return result;
}
function setSession(res, data) {
  if (!data.access_token || !data.refresh_token) return;
  const accessAge = Math.min(3600, Number(data.expires_in)||3600);
  res.setHeader('Set-Cookie', [
    `${ACCESS}=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${accessAge}`,
    `${REFRESH}=${encodeURIComponent(data.refresh_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
  ]);
}
function clearSession(res) {
  res.setHeader('Set-Cookie',[ACCESS,REFRESH].map(k=>`${k}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`));
}
export function allowedOrigin(req) {
  const raw = req.headers.origin;
  if (!raw) return false;
  try {
    const origin = new URL(raw);
    const host = String(req.headers.host || '');
    return origin.host === host && (origin.protocol === 'https:' || (process.env.NODE_ENV === 'test' && origin.hostname === 'localhost'));
  } catch { return false; }
}
async function bodyOf(req) {
  if (Number(req.headers['content-length'] || 0) > LIMIT) throw Object.assign(new Error('Request is too large.'),{status:413});
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Use an application/json request.'),{status:415});
  let text;
  if (req.body !== undefined) text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    const chunks=[]; let size=0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size>LIMIT) throw Object.assign(new Error('Request is too large.'),{status:413}); chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)); }
    text=Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(text||'')>LIMIT) throw Object.assign(new Error('Request is too large.'),{status:413});
  let data;try{data=JSON.parse(text||'{}');}catch{throw Object.assign(new Error('Malformed JSON.'),{status:400});}
  if (!data || typeof data!=='object' || Array.isArray(data)) throw Object.assign(new Error('A JSON object is required.'),{status:400});
  return data;
}
async function upstream(path, {method='GET',token,body}={}) {
  const response=await fetch(`${BASE}${path}`,{method,headers:{apikey:KEY,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
  const text=await response.text();
  if (text.length>2200000) throw Object.assign(new Error('Provider response exceeded the safe limit.'),{status:502});
  let data; try {data=text?JSON.parse(text):{};} catch {throw Object.assign(new Error('The connected service returned an unreadable response.'),{status:502});}
  return {status:response.status,ok:response.ok,data};
}
function errorFor(result) {
  const value=String(result.data?.message || result.data?.msg || result.data?.error_description || result.data?.error || '');
  let message='The connected service could not complete this request.';
  let status=result.status;
  if (/invalid login|invalid_credentials/i.test(value)) message='The email or password was not accepted.';
  else if (/Email not confirmed/i.test(value)) message='Confirm your email before signing in.';
  else if (/signup.*disabled|signups not allowed/i.test(value)) message='New account registration is not enabled. Existing accounts can still sign in; local tools remain available.';
  else if (/email.*rate|rate.limit|over_email_send_rate_limit/i.test(value)) {message='The email service has reached its sending limit. Please retry later or use an existing account.'; status=429;}
  else if (/WORKSPACE_RATE_LIMIT|REVIEW_REQUEST_LIMIT|WORKSPACE_RECORD_LIMIT/i.test(value)) {message='Your workspace request limit has been reached. Export your work or retry later.';status=429;}
  else if (/DRAFT_REVISION_CONFLICT/i.test(value)) {message='This draft changed in another session. Refresh cloud records before saving again.';status=409;}
  else if (/OPERATOR_NOT_ACTIVE|SCOPE_DENIED|AUTHORITY_DENIED/i.test(value)) {message='Your account is signed in but does not have the required CHLOM operator authority.';status=403;}
  else if (/AUTHENTICATION_REQUIRED|JWT|token.*expired/i.test(value)) {message='Your session has expired. Please sign in again.';status=401;}
  else if (/DRAFT_NOT_ACCESSIBLE/i.test(value)) {message='This draft is not accessible to your account.';status=403;}
  else if (/invalid.*email|Email address.*invalid/i.test(value)) message='Enter a valid email address.';
  else if (/password.*(short|characters|weak)/i.test(value)) message='Use a stronger password with at least 12 characters.';
  else if (/INVALID_DRAFT|INVALID_NEW_DRAFT|MESSAGE_TOO_LONG/i.test(value)) {message='Check the required draft fields and text limits.';status=400;}
  return Object.assign(new Error(message),{status:status>=400&&status<500?status:502});
}
async function session(req,res,required=true) {
  const jar=cookies(req);
  let token=jar[ACCESS];
  if (token) {
    const user=await upstream('/auth/v1/user',{token});
    if (user.ok && user.data.id) return {token,user:user.data};
    if (![401,403].includes(user.status)) throw errorFor(user);
  }
  if (jar[REFRESH]) {
    const refresh=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar[REFRESH]}});
    if (refresh.ok && refresh.data.user?.id) {setSession(res,refresh.data);return {token:refresh.data.access_token,user:refresh.data.user};}
    if (![400,401,403].includes(refresh.status)) throw errorFor(refresh);
    clearSession(res);
  }
  if (required) throw Object.assign(new Error('Sign in to use your private cloud workspace.'),{status:401});
  return null;
}
function send(res,status,data) {res.statusCode=status;res.end(JSON.stringify(data));}
export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  try {
    const route=new URL(req.url,'https://chlomlex.invalid').searchParams.get('route')||'health';
    if (!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return send(res,405,{ok:false,error:'Method not allowed.'});}
    if (req.method==='POST' && !allowedOrigin(req)) return send(res,403,{ok:false,error:'Same-origin request required.'});
    rateLimit(req,route);
    if (req.method==='GET' && route==='health') return send(res,200,{ok:true,brand:'CHLOM LEX',version:'1.0.0',mode:'public_tools_and_authenticated_workspace',canonical_protocol:'chlom-protocol',review_registry:'chlom_protocol.review_cases_v1',payment_execution:false,legal_title_adjudication:false,checked_at:new Date().toISOString()});
    if (req.method==='GET' && route==='resolve') {
      const id=new URL(req.url,'https://chlomlex.invalid').searchParams.get('id')||'';
      if (!/^ctid_[0-9a-f]{32}$/.test(id)) return send(res,400,{ok:false,error:'Use a public CHLOM identity beginning ctid_ followed by 32 hexadecimal characters.'});
      const result=await upstream(`/functions/v1/chlom-public-resolver?id=${encodeURIComponent(id)}`);
      return send(res,result.status,result.data);
    }
    if (req.method==='GET' && route==='catalog') {
      const result=await upstream('/rest/v1/rpc/chlom_lex_public_offers_v1',{method:'POST',body:{}});
      if (!result.ok) throw errorFor(result);
      return send(res,200,{ok:true,offers:result.data,source:'canonical_chlom_protocol',checked_at:new Date().toISOString()});
    }
    if (req.method==='GET' && route==='session') {
      const current=await session(req,res,false);
      return send(res,200,{ok:true,user:current?{id:current.user.id,email:current.user.email}:null});
    }
    const body=req.method==='POST'?await bodyOf(req):{};
    if (req.method==='POST' && ['signin','signup','recover'].includes(route)) {
      const email=String(body.email||'').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return send(res,400,{ok:false,error:'Enter a valid email address.'});
      if (route==='recover') {
        const result=await upstream('/auth/v1/recover',{method:'POST',body:{email}});
        if (!result.ok) throw errorFor(result);
        return send(res,200,{ok:true,message:'If this email has an account, the provider will send recovery instructions.'});
      }
      const password=String(body.password||'');
      if (password.length>128 || password.length<(route==='signup'?12:1)) return send(res,400,{ok:false,error:'Use a password between 12 and 128 characters for a new account.'});
      const result=await upstream(route==='signin'?'/auth/v1/token?grant_type=password':'/auth/v1/signup',{method:'POST',body:{email,password,...(route==='signup'?{data:{workspace_origin:'CHLOM LEX'}}:{})}});
      if (!result.ok) throw errorFor(result);
      if (result.data.access_token) setSession(res,result.data);
      return send(res,200,{ok:true,signed_in:Boolean(result.data.access_token),message:result.data.access_token?'Your private cloud workspace is connected.':'Check your email for the confirmation link, then return here to sign in.'});
    }
    if (req.method==='POST' && route==='logout') {
      const jar=cookies(req);
      if (jar[ACCESS]) await upstream('/auth/v1/logout?scope=local',{method:'POST',token:jar[ACCESS]}).catch(()=>{});
      clearSession(res);return send(res,200,{ok:true});
    }
    const current=await session(req,res);
    if (req.method==='GET' && route==='drafts') {
      const result=await upstream('/rest/v1/chlom_lex_drafts_v1?select=*&order=updated_at.desc&limit=1000',{token:current.token});
      if (!result.ok) throw errorFor(result); return send(res,200,{ok:true,drafts:result.data});
    }
    if (req.method==='GET' && route==='activity') {
      const result=await upstream('/rest/v1/chlom_lex_events_v1?select=event_id,draft_id,event_type,revision,payload_sha256,review_case_id,created_at&order=created_at.desc&limit=100',{token:current.token});
      if (!result.ok) throw errorFor(result);return send(res,200,{ok:true,events:result.data});
    }
    if (req.method==='POST' && route==='save') {
      const result=await upstream('/rest/v1/rpc/chlom_lex_save_draft_v1',{method:'POST',token:current.token,body:{p_id:body.id||null,p_kind:body.kind,p_title:body.title,p_payload:body.payload,p_expected_revision:body.revision||0,p_archive:body.archive===true}});
      if (!result.ok) throw errorFor(result);return send(res,200,result.data);
    }
    if (req.method==='POST' && route==='review') {
      const result=await upstream('/rest/v1/rpc/chlom_lex_request_review_v1',{method:'POST',token:current.token,body:{p_id:body.id,p_expected_revision:body.revision,p_message:body.message||''}});
      if (!result.ok) throw errorFor(result);return send(res,200,result.data);
    }
    if (route==='operator') {
      const action=req.method==='GET'?'capabilities':String(body.action||'');
      if (!ACTIONS.has(action)) return send(res,400,{ok:false,error:'This action is not part of the CHLOM public control-plane contract.'});
      const key=body.idempotency_key||null;
      if (!['status','capabilities'].includes(action)&&!/^[A-Za-z0-9._:-]{16,128}$/.test(key||'')) return send(res,400,{ok:false,error:'A stable idempotency key is required for an operator write.'});
      const result=await upstream('/rest/v1/rpc/chlom_api_dispatch_v3',{method:'POST',token:current.token,body:{p_action:action,p_payload:body.payload||{},p_idempotency_key:key}});
      if (!result.ok) throw errorFor(result);return send(res,200,result.data);
    }
    return send(res,404,{ok:false,error:'Route not found.'});
  } catch (error) {
    const status=error.status||502;
    return send(res,status,{ok:false,error:error.name==='TimeoutError'?'The connected service timed out. Your local work is unchanged.':error.message||'The service is temporarily unavailable.'});
  }
}
