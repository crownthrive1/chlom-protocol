/** CHLOM core adapter. Supabase verifies sessions; its dispatcher owns authority. */
import {sanitizeProtocol,sanitizeControlPlane,sanitizeWallet,sanitizeMesh,sanitizeIdentity} from '../lib/core-status.js';

export const CORE_ACTIONS = Object.freeze(['status','capabilities','register_asset_binding','record_ownership_interest',
  'record_rights_instrument','record_dla','record_lex_offer','record_agreement_entitlement','record_obligation',
  'record_revenue_policy','preview_settlement','register_token_candidate','report_oracle_signal','bind_dail_proof']);
const READ_ACTIONS = new Set(['status','capabilities']);
const ACCESS = '__Host-chlom-core-access', REFRESH = '__Host-chlom-core-refresh';
const BODY_LIMIT = 64 * 1024, RESPONSE_LIMIT = 2 * 1024 * 1024;
const ROUTES = new Map([['health',['GET']],['status',['GET']],['resolve',['GET']],['session',['GET']],
  ['signin',['POST']],['refresh',['POST']],['logout',['POST']],['operator',['GET','POST']]]);
const failure = (code,message,status=400) => Object.assign(new Error(message),{code,status});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function coreBackend(env=process.env) {
  const firstParty=env.VERCEL_PROJECT_ID==='prj_HewLgMjUiVBNCl0FADFbSggSp2QN';
  const explicit=env.CHLOM_CORE_SUPABASE_URL!==undefined || env.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY!==undefined;
  let base=explicit ? env.CHLOM_CORE_SUPABASE_URL : firstParty ? 'https://tzajnzshmtzjenqulehq.supabase.co' : '';
  const key=explicit ? env.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY : firstParty ? 'sb_publishable_gMCE_lzPrynYgAEDs_xxyw_vWqR9irE' : '';
  if (typeof base!=='string' || typeof key!=='string' || !base || !key || /[\r\n]/.test(key) || key.startsWith('sb_secret_')) return null;
  let publishable=/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
  // Only a legacy anon JWT is compatible; never accept a service-role key.
  if (key.split('.').length===3) {
    try {publishable=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)&&JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role==='anon';} catch {return null;}
  }
  if(!publishable)return null;
  try {const url=new URL(base);if(url.protocol!=='https:' || ![url.origin,url.origin+'/'].includes(base) || url.username || url.password) return null;base=url.origin;} catch {return null;}
  return {base,key};
}
export function coreSameOrigin(req) {
  try {const origin=new URL(req.headers.origin);return origin.protocol==='https:' && origin.origin===req.headers.origin && origin.origin===`https://${req.headers.host}`;} catch {return false;}
}
function parseCookies(req) {
  const jar=Object.create(null);
  for (const pair of String(req.headers.cookie||'').split(';')) {
    const index=pair.indexOf('='),name=pair.slice(0,index).trim();
    if(index<0 || ![ACCESS,REFRESH].includes(name))continue;
    try {const value=decodeURIComponent(pair.slice(index+1));if(value.length<=8192)jar[name]=value;} catch { /* malformed cookies are unauthenticated */ }
  }
  return jar;
}
function bearer(req) {
  const header=req.headers.authorization;
  if(header===undefined)return null;
  if(typeof header!=='string' || !/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(header))throw failure('INVALID_BEARER','Use a valid access token.',401);
  return header.slice(7);
}
function clearSession(res) {
  res.setHeader('Set-Cookie',[ACCESS,REFRESH].map(name=>`${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`));
}
function setSession(res,data) {
  if (typeof data.access_token!=='string' || typeof data.refresh_token!=='string' || !data.access_token || !data.refresh_token ||
      data.access_token.length>8192 || data.refresh_token.length>8192 || !data.user?.id) throw failure('INVALID_AUTH_RESPONSE','The identity provider returned an incomplete session.',502);
  const age=Number.isFinite(data.expires_in) ? Math.max(1,Math.min(3600,Math.floor(data.expires_in))) : 3600;
  res.setHeader('Set-Cookie',[
    `${ACCESS}=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`,
    `${REFRESH}=${encodeURIComponent(data.refresh_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
  ]);
}
function publicUser(user) {return {id:String(user.id),email:typeof user.email==='string'?user.email:null};}
function onlyFields(body,allowed) {
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw failure('UNKNOWN_REQUEST_FIELD','Remove unsupported request fields.');
}
async function bodyOf(req) {
  if(Number(req.headers['content-length']||0)>BODY_LIMIT)throw failure('REQUEST_TOO_LARGE','Request exceeds 64 KiB.',413);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))throw failure('JSON_REQUIRED','Use application/json.',415);
  let raw;
  if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>BODY_LIMIT)throw failure('REQUEST_TOO_LARGE','Request exceeds 64 KiB.',413);chunks.push(Buffer.from(chunk));}
    raw=Buffer.concat(chunks).toString('utf8');
  }
  if(Buffer.byteLength(raw||'')>BODY_LIMIT)throw failure('REQUEST_TOO_LARGE','Request exceeds 64 KiB.',413);
  let value;try{value=JSON.parse(raw||'{}');}catch{throw failure('INVALID_JSON','Provide valid JSON.');}
  if(!record(value))throw failure('JSON_OBJECT_REQUIRED','Provide a JSON object.');
  return value;
}
async function readResponse(response) {
  if(Number(response.headers.get('content-length')||0)>RESPONSE_LIMIT)throw failure('UPSTREAM_RESPONSE_TOO_LARGE','The connected service returned too much data.',502);
  const chunks=[];let size=0;
  if(response.body)for await(const chunk of response.body){size+=chunk.byteLength;if(size>RESPONSE_LIMIT)throw failure('UPSTREAM_RESPONSE_TOO_LARGE','The connected service returned too much data.',502);chunks.push(Buffer.from(chunk));}
  const text=Buffer.concat(chunks).toString('utf8');
  try{return text?JSON.parse(text):{};}catch{throw failure('UPSTREAM_INVALID_RESPONSE','The connected service returned an unreadable response.',502);}
}
function providerError(result) {
  const value=String(result.data?.message||result.data?.msg||result.data?.error_description||result.data?.error||'');
  const rules=[
    [/IDEMPOTENCY_CONFLICT/,'IDEMPOTENCY_CONFLICT','This key already belongs to a different request. Keep the original key only for an exact retry.',409],
    [/REQUEST_IN_PROGRESS/,'REQUEST_IN_PROGRESS','This request is in progress. Retry with the same key and payload.',409],
    [/RATE_LIMIT|rate.limit|over_request_rate_limit/i,'RATE_LIMITED','Request limit reached. Retry after one minute.',429],
    [/OPERATOR_NOT_ACTIVE/,'OPERATOR_NOT_ACTIVE','Your account has no active CHLOM operator assignment.',403],
    [/SCOPE_DENIED/,'SCOPE_DENIED','Your CHLOM operator scopes do not allow this operation.',403],
    [/AUTHORITY_DENIED/,'AUTHORITY_DENIED','Your CHLOM operator authority does not allow this operation.',403],
    [/invalid login|invalid_credentials/i,'INVALID_CREDENTIALS','The email or password was not accepted.',401],
    [/Email not confirmed/i,'EMAIL_NOT_CONFIRMED','Confirm your email before signing in.',403],
    [/AUTHENTICATION_REQUIRED|JWT|token.*expired/i,'AUTHENTICATION_REQUIRED','Your session has expired. Sign in again.',401],
  ];
  for(const [pattern,code,message,status] of rules)if(pattern.test(value))return failure(code,message,status);
  const status=[400,401,403,404,409,422,429].includes(result.status)?result.status:502;
  return failure('UPSTREAM_REJECTED',status===400||status===422?'The core rejected this input. Check the operation schema and references.':'The connected core could not complete this request.',status);
}

export function createCoreHandler({env=process.env,fetchImpl=(...args)=>fetch(...args),now=()=>Date.now()}={}) {
  const buckets=new Map();
  function rateLimit(req,route) {
    const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,128);
    const key=`${ip}:${route}`,time=now();let bucket=buckets.get(key);
    if(!bucket||bucket.until<=time){bucket={count:0,until:time+60000};buckets.set(key,bucket);}
    if(buckets.size>4096)for(const [name,row] of buckets)if(row.until<=time)buckets.delete(name);
    if(buckets.size>8192)buckets.delete(buckets.keys().next().value);
    if(++bucket.count>(route==='signin'?8:120))throw failure('RATE_LIMITED','Request limit reached. Retry after one minute.',429);
  }
  async function upstream(path,{method='GET',token,body}={}) {
    const backend=coreBackend(env);
    if(!backend)throw failure('CORE_NOT_CONFIGURED','The CHLOM core backend is not configured for this installation.',503);
    let response;
    try {response=await fetchImpl(`${backend.base}${path}`,{method,redirect:'error',headers:{apikey:backend.key,
      ...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},
      ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}catch(error){
      throw failure(error.name==='TimeoutError'?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE','The connected CHLOM core is temporarily unavailable.',503);
    }
    return {ok:response.ok,status:response.status,data:await readResponse(response)};
  }
  async function session(req,res,required=true,forceRefresh=false) {
    const direct=bearer(req),jar=parseCookies(req);
    if(direct){
      const result=await upstream('/auth/v1/user',{token:direct});
      if(!result.ok)throw providerError(result);
      if(!result.data?.id)throw failure('AUTHENTICATION_REQUIRED','A valid user session is required.',401);
      return {token:direct,user:result.data};
    }
    if(jar[ACCESS]&&!forceRefresh){
      const result=await upstream('/auth/v1/user',{token:jar[ACCESS]});
      if(result.ok&&result.data?.id)return {token:jar[ACCESS],user:result.data};
      if(![401,403].includes(result.status))throw providerError(result);
    }
    if(jar[REFRESH]){
      const result=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar[REFRESH]}});
      if(result.ok){setSession(res,result.data);return {token:result.data.access_token,user:result.data.user};}
      if(![400,401,403].includes(result.status))throw providerError(result);
      clearSession(res);
    }else if(jar[ACCESS])clearSession(res);
    if(required)throw failure('AUTHENTICATION_REQUIRED','Sign in with your CHLOM operator account.',401);
    return null;
  }
  async function publicStatus() {
    if(!coreBackend(env))throw failure('CORE_NOT_CONFIGURED','The CHLOM core backend is not configured for this installation.',503);
    const sources=[
      ['protocol','/rest/v1/rpc/chlom_protocol_status_v2',sanitizeProtocol,true],
      ['control_plane','/functions/v1/chlom-control-plane-status-public-v1',sanitizeControlPlane,false],
      ['wallet','/rest/v1/rpc/chlom_wallet_production_status_v3',sanitizeWallet,true],
      ['mesh','/functions/v1/chlom-mesh-status',sanitizeMesh,false],
    ];
    const results=await Promise.allSettled(sources.map(async([,path,sanitize,rpc])=>{
      const result=await upstream(path,rpc?{method:'POST',body:{}}:{});
      if(!result.ok)throw providerError(result);
      const data=sanitize(result.data);if(!data)throw failure('INVALID_STATUS_CONTRACT','Core status contract mismatch.',502);
      return data;
    }));
    const data={ok:results.every(result=>result.status==='fulfilled'),source:'canonical_chlom_core',
      observed_at:new Date(now()).toISOString(),availability:{}};
    results.forEach((result,index)=>{const name=sources[index][0];data[name]=result.status==='fulfilled'?result.value:null;
      data.availability[name]=result.status==='fulfilled'?'available':'unavailable';});
    return data;
  }
  return async function handler(req,res) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Vary','Cookie, Authorization');
    const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'https://core.invalid'),route=url.searchParams.get('route')||'health';
      if(!ROUTES.has(route))return send(404,{ok:false,code:'ROUTE_NOT_FOUND',error:'Route not found.'});
      if(!ROUTES.get(route).includes(req.method)){res.setHeader('Allow',ROUTES.get(route).join(', '));return send(405,{ok:false,code:'METHOD_NOT_ALLOWED',error:'Method not allowed.'});}
      // Browser requests are same-origin. Non-browser clients may supply a Bearer token for operator calls only.
      if(req.method==='POST'&&!coreSameOrigin(req)){
        if(!(route==='operator'&&!req.headers.origin&&bearer(req)))throw failure('SAME_ORIGIN_REQUIRED','Same-origin request required.',403);
      }
      rateLimit(req,route);
      if(route==='health')return send(200,{ok:true,brand:'CHLOM',version:'1.3.0',backend_configured:Boolean(coreBackend(env)),
        dispatcher:'chlom_api_dispatch_v3',mode:'core_control_plane',payment_execution:false,token_issuance:false});
      if(route==='status'){const data=await publicStatus();return send(Object.values(data.availability).some(value=>value==='available')?200:503,data);}
      if(route==='resolve'){
        const id=url.searchParams.get('id')||'';
        if(!/^ctid_[0-9a-f]{32}$/.test(id))throw failure('INVALID_PUBLIC_ID','Use ctid_ followed by 32 hexadecimal characters.');
        const result=await upstream(`/functions/v1/chlom-public-resolver?id=${id}`);
        if(!result.ok)throw providerError(result);
        const data=sanitizeIdentity(result.data,id);if(!data)throw failure('INVALID_RESOLVER_RESPONSE','The public identity could not be verified.',502);
        return send(200,{ok:true,...data});
      }
      if(route==='session'){const current=await session(req,res,false);return send(200,{ok:true,user:current?publicUser(current.user):null});}
      const body=req.method==='POST'?await bodyOf(req):{};
      if(route==='signin'){
        onlyFields(body,['email','password']);
        if(typeof body.email!=='string'||body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))throw failure('INVALID_EMAIL','Enter a valid email address.');
        if(typeof body.password!=='string'||body.password.length<1||body.password.length>128)throw failure('INVALID_PASSWORD','Enter your account password.');
        const result=await upstream('/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email.trim(),password:body.password}});
        if(!result.ok)throw providerError(result);setSession(res,result.data);
        return send(200,{ok:true,signed_in:true,user:publicUser(result.data.user)});
      }
      if(route==='refresh'){onlyFields(body,[]);const current=await session(req,res,true,true);return send(200,{ok:true,user:publicUser(current.user)});}
      if(route==='logout'){
        onlyFields(body,[]);
        try {
          const current=await session(req,res,false);
          if(current){const result=await upstream('/auth/v1/logout?scope=local',{method:'POST',token:current.token});if(!result.ok)throw providerError(result);}
        }finally{clearSession(res);}
        return send(200,{ok:true});
      }
      onlyFields(body,['action','payload','idempotency_key']);
      const action=req.method==='GET'?'capabilities':body.action;
      if(!CORE_ACTIONS.includes(action))throw failure('ACTION_NOT_ALLOWED','This action is not available through the CHLOM core dispatcher.');
      const payload=body.payload??{};if(!record(payload))throw failure('PAYLOAD_OBJECT_REQUIRED','The operation payload must be a JSON object.');
      const headerKey=req.headers['idempotency-key'];
      if(headerKey!==undefined&&body.idempotency_key!==undefined&&headerKey!==body.idempotency_key)throw failure('IDEMPOTENCY_KEY_CONFLICT','The body and Idempotency-Key header must use the same key.');
      const key=body.idempotency_key??headerKey??null;
      if(!READ_ACTIONS.has(action)&&(typeof key!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(key)))throw failure('IDEMPOTENCY_KEY_REQUIRED','Use a stable idempotency key of 16 to 128 letters, numbers, dots, underscores, colons or hyphens.');
      if(READ_ACTIONS.has(action)&&(Object.keys(payload).length||key!==null))throw failure('READ_PAYLOAD_NOT_ALLOWED','Status and capabilities do not accept a payload or idempotency key.');
      const current=await session(req,res);
      const result=await upstream('/rest/v1/rpc/chlom_api_dispatch_v3',{method:'POST',token:current.token,
        body:{p_action:action,p_payload:payload,p_idempotency_key:key}});
      if(!result.ok)throw providerError(result);
      return send(200,result.data);
    }catch(error){
      if(error.status===429)res.setHeader('Retry-After','60');
      return send(error.status||502,{ok:false,code:error.code||'CORE_REQUEST_FAILED',
        error:error.code?error.message:'The CHLOM core could not complete this request.'});
    }
  };
}
export default createCoreHandler();
