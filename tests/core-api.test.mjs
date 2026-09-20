import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreHandler,coreBackend,coreSameOrigin,CORE_ACTIONS} from '../api/core.js';
import {sanitizeProtocol,sanitizeControlPlane,sanitizeWallet,sanitizeMesh,sanitizeIdentity} from '../lib/core-status.js';

const env={CHLOM_CORE_SUPABASE_URL:'https://tenant.test',CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture_public_123'};
const access='signed-user-access-token-for-test',refresh='private-refresh-token-for-test';
const user={id:'00000000-0000-4000-8000-000000000001',email:'operator@example.test'};
const cookie=`__Host-chlom-core-access=${access}; __Host-chlom-core-refresh=${refresh}`;
const request=(route,{method='GET',headers={},body}={})=>({method,url:`/api/core?route=${route}`,
  headers:{host:'core.test',...(method==='POST'?{origin:'https://core.test','content-type':'application/json'}:{}),...headers},
  ...(body===undefined?{}:{body})});
async function invoke(handler,req){const headers={};let raw='';const res={statusCode:0,setHeader(name,value){headers[name]=value;},end(value){raw=value;}};
  await handler(req,res);return {status:res.statusCode,headers,data:JSON.parse(raw)};}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function setup(route){const calls=[];return {calls,handler:createCoreHandler({env,fetchImpl:async(url,options)=>{
  calls.push({url,options,body:options.body?JSON.parse(options.body):undefined});return route(url,options,calls.length);
}})};}
const sessionResponse=()=>({access_token:access,refresh_token:refresh,expires_in:3600,user});

test('core backend isolates custom installations and rejects secret-role settings',()=>{
  assert.equal(coreBackend({}),null);assert.equal(coreBackend({VERCEL_PROJECT_ID:'a-fork'}),null);
  assert.ok(coreBackend({VERCEL_PROJECT_ID:'prj_HewLgMjUiVBNCl0FADFbSggSp2QN'}));
  assert.deepEqual(coreBackend(env),{base:'https://tenant.test',key:env.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY});
  assert.deepEqual(coreBackend({...env,CHLOM_CORE_SUPABASE_URL:'https://tenant.test/'}),{base:'https://tenant.test',key:env.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY});
  for(const base of ['http://tenant.test','https://tenant.test/path','https://name:password@tenant.test','https://tenant.test/?extra=1','https://tenant.test//#extra'])assert.equal(coreBackend({...env,CHLOM_CORE_SUPABASE_URL:base}),null);
  assert.equal(coreBackend({...env,CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_do-not-use'}),null);
  assert.equal(coreBackend({...env,CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY:'arbitrary-key-string'}),null);
  const service=`a.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.c`;
  assert.equal(coreBackend({...env,CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY:service}),null);
  assert.equal(coreBackend({VERCEL_PROJECT_ID:'prj_HewLgMjUiVBNCl0FADFbSggSp2QN',CHLOM_CORE_SUPABASE_URL:''}),null);
  assert.equal(coreBackend({CHLOM_LEX_SUPABASE_URL:env.CHLOM_CORE_SUPABASE_URL,CHLOM_LEX_SUPABASE_PUBLISHABLE_KEY:'public'}),null);
});
test('core CSRF boundary requires exact HTTPS origin, including port',()=>{
  for(const origin of [undefined,'null','https://evil.test','http://core.test','https://core.test:444','https://core.test/path'])assert.equal(coreSameOrigin(request('operator',{headers:{origin}})),false);
  assert.equal(coreSameOrigin(request('operator',{headers:{origin:'https://core.test'}})),true);
});
test('core anonymous session returns no user or credential and never touches provider',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});const result=await invoke(handler,request('session'));
  assert.equal(result.status,200);assert.deepEqual(result.data,{ok:true,user:null});assert.equal(calls.length,0);
});
test('core rejects unauthenticated operator requests without a provider call',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});const result=await invoke(handler,request('operator'));
  assert.equal(result.status,401);assert.equal(result.data.code,'AUTHENTICATION_REQUIRED');assert.equal(calls.length,0);
});
test('core does not borrow LEX sessions',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});
  const result=await invoke(handler,request('operator',{headers:{cookie:`__Host-chlomlex-access=${access}`}}));
  assert.equal(result.status,401);assert.equal(calls.length,0);
});
test('core browser mutations reject missing and cross-site origins even with cookie or bearer',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});
  for(const headers of [{origin:undefined,cookie},{origin:'https://evil.test',cookie},{origin:'https://evil.test',authorization:`Bearer ${access}`}]){
    const result=await invoke(handler,request('operator',{method:'POST',headers,body:{action:'status'}}));assert.equal(result.status,403);
  }
  assert.equal(calls.length,0);
});
test('core sign-in uses private HttpOnly cookies and never returns provider tokens',async()=>{
  const {handler,calls}=setup(()=>json({...sessionResponse(),provider_token:'secret',user:{...user,app_metadata:{sensitive:'private'}}}));
  const result=await invoke(handler,request('signin',{method:'POST',body:{email:user.email,password:'sensitive-password'}}));
  assert.equal(result.status,200);assert.deepEqual(result.data,{ok:true,signed_in:true,user});
  assert.equal(calls[0].url,'https://tenant.test/auth/v1/token?grant_type=password');
  assert.deepEqual(calls[0].body,{email:user.email,password:'sensitive-password'});
  assert.equal(calls[0].options.headers.apikey,env.CHLOM_CORE_SUPABASE_PUBLISHABLE_KEY);
  for(const value of result.headers['Set-Cookie'])assert.match(value,/Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=/);
  assert.equal(result.headers['Set-Cookie'].length,2);assert.doesNotMatch(JSON.stringify(result.data),/token|password|metadata/);
});
test('core password errors are sanitized without echoing provider data',async()=>{
  const {handler}=setup(()=>json({error:'invalid_credentials',message:'invalid login credentials',debug:'sensitive-password'},400));
  const result=await invoke(handler,request('signin',{method:'POST',body:{email:user.email,password:'sensitive-password'}}));
  assert.equal(result.status,401);assert.equal(result.data.code,'INVALID_CREDENTIALS');assert.doesNotMatch(JSON.stringify(result),/sensitive-password/);
});
test('core rejects malformed, oversized and unknown authentication fields before provider access',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});
  for(const body of ['{',[],{email:123,password:'x'},{email:user.email,password:'x',authority:'D3'}]){
    assert.equal((await invoke(handler,request('signin',{method:'POST',body}))).status,400);
  }
  assert.equal((await invoke(handler,request('signin',{method:'POST',headers:{'content-length':'100000'},body:{}}))).status,413);
  assert.equal((await invoke(handler,request('signin',{method:'POST',headers:{'content-type':'text/plain'},body:{}}))).status,415);
  assert.equal(calls.length,0);
});
test('core refresh rotates isolated cookies and strips auth response metadata',async()=>{
  const {handler,calls}=setup(()=>json({...sessionResponse(),access_token:'new-access-token',refresh_token:'new-refresh-token'}));
  const result=await invoke(handler,request('refresh',{method:'POST',headers:{cookie},body:{}}));
  assert.equal(result.status,200);assert.deepEqual(result.data,{ok:true,user});
  assert.match(calls[0].url,/grant_type=refresh_token/);assert.deepEqual(calls[0].body,{refresh_token:refresh});
  assert.match(result.headers['Set-Cookie'][0],/new-access-token/);assert.match(result.headers['Set-Cookie'][1],/new-refresh-token/);
});
test('core session revalidates current user then refreshes only an expired access token',async()=>{
  const {handler,calls}=setup((url)=>url.endsWith('/auth/v1/user')?json({message:'JWT expired'},401):json(sessionResponse()));
  const result=await invoke(handler,request('session',{headers:{cookie}}));
  assert.equal(result.status,200);assert.deepEqual(result.data.user,user);assert.equal(calls.length,2);
});
test('core revokes current session on logout and clears cookies even when provider fails',async()=>{
  const {handler}=setup((url)=>url.endsWith('/auth/v1/user')?json(user):json({message:'provider error includes secret'},500));
  const result=await invoke(handler,request('logout',{method:'POST',headers:{cookie},body:{}}));
  assert.equal(result.status,502);assert.ok(result.headers['Set-Cookie'].every(value=>value.endsWith('Max-Age=0')));
  assert.doesNotMatch(JSON.stringify(result.data),/secret/);
});
test('core passes only genuine user bearer identity to canonical dispatcher',async()=>{
  const {handler,calls}=setup((url)=>url.endsWith('/auth/v1/user')?json(user):json({ok:true,authority_class:'D3',scopes:['chlom:*']}));
  const result=await invoke(handler,request('operator',{headers:{authorization:`Bearer ${access}`}}));
  assert.equal(result.status,200);assert.equal(calls[1].url,'https://tenant.test/rest/v1/rpc/chlom_api_dispatch_v3');
  assert.deepEqual(calls[1].body,{p_action:'capabilities',p_payload:{},p_idempotency_key:null});
  assert.equal(calls[1].options.headers.Authorization,`Bearer ${access}`);
});
test('core invalid external bearer never falls back to browser cookies',async()=>{
  const {handler,calls}=setup(()=>json({message:'JWT expired'},401));
  const result=await invoke(handler,request('operator',{headers:{authorization:`Bearer ${access}`,cookie}}));
  assert.equal(result.status,401);assert.equal(calls.length,1);
});
test('core exact mutation retries preserve idempotency and payload without inventing authority',async()=>{
  const receipt={ok:true,dispatch_receipt_id:'test-receipt',result:{authority_created:false},external_execution_enabled:false};
  const {handler,calls}=setup(url=>url.endsWith('/auth/v1/user')?json(user):json(receipt));
  const body={action:'register_asset_binding',payload:{canonical_asset_id:'ct.asset.example',source_ref:'private-evidence-reference'},idempotency_key:'ct.core.request.00001'};
  for(let i=0;i<2;i++){
    const result=await invoke(handler,request('operator',{method:'POST',headers:{origin:undefined,authorization:`Bearer ${access}`},body}));
    assert.equal(result.status,200);assert.deepEqual(result.data,receipt);
  }
  const dispatched=calls.filter(call=>call.url.endsWith('/chlom_api_dispatch_v3'));
  assert.equal(dispatched.length,2);assert.deepEqual(dispatched[0].body,dispatched[1].body);
  assert.deepEqual(dispatched[0].body,{p_action:body.action,p_payload:body.payload,p_idempotency_key:body.idempotency_key});
  assert.equal(dispatched[0].body.p_payload.authority_class,undefined);
});
test('core rejects unsupported execution, malformed idempotency, arrays and read payloads before dispatch',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});
  for(const body of [{action:'production_token_mint_confirmation'},{action:'register_asset_binding',payload:{}},
    {action:'register_asset_binding',idempotency_key:'spaces are disallowed',payload:{}},
    {action:'register_asset_binding',idempotency_key:'ct.core.request.1',payload:[]},
    {action:'status',payload:{authority_class:'D3'}},{action:'status',idempotency_key:'ct.core.request.1'}]){
    const result=await invoke(handler,request('operator',{method:'POST',headers:{cookie},body}));assert.equal(result.status,400);
  }
  assert.equal(calls.length,0);assert.equal(CORE_ACTIONS.length,14);
});
test('core accepts Idempotency-Key header for SDK clients and rejects a conflicting body key',async()=>{
  const {handler,calls}=setup(url=>url.endsWith('/auth/v1/user')?json(user):json({ok:true}));
  const headers={origin:undefined,authorization:`Bearer ${access}`,'idempotency-key':'ct.core.sdk.request.001'};
  const result=await invoke(handler,request('operator',{method:'POST',headers,body:{action:'register_asset_binding',payload:{}}}));
  assert.equal(result.status,200);assert.equal(calls[1].body.p_idempotency_key,headers['idempotency-key']);
  const conflict=await invoke(handler,request('operator',{method:'POST',headers,body:{action:'register_asset_binding',payload:{},idempotency_key:'ct.core.sdk.request.002'}}));
  assert.equal(conflict.status,400);assert.equal(conflict.data.code,'IDEMPOTENCY_KEY_CONFLICT');assert.equal(calls.length,2);
});
test('core maps canonical authority and idempotency rejection without exposing SQL details',async()=>{
  for(const [message,status,code] of [['CHLOM_API_OPERATOR_NOT_ACTIVE',403,'OPERATOR_NOT_ACTIVE'],['CHLOM_API_SCOPE_DENIED',403,'SCOPE_DENIED'],
    ['CHLOM_API_AUTHORITY_DENIED',403,'AUTHORITY_DENIED'],['CHLOM_API_IDEMPOTENCY_CONFLICT',409,'IDEMPOTENCY_CONFLICT'],['CHLOM_API_RATE_LIMIT_EXCEEDED',429,'RATE_LIMITED']]){
    const {handler}=setup(url=>url.endsWith('/auth/v1/user')?json(user):json({message,details:'raw-private-sql-detail'},400));
    const result=await invoke(handler,request('operator',{headers:{cookie}}));assert.equal(result.status,status);assert.equal(result.data.code,code);
    assert.doesNotMatch(JSON.stringify(result),/raw-private-sql-detail/);
  }
});
test('core status projects only known aggregates and explicitly reports partial failures',async()=>{
  const {handler}=setup(url=>{
    if(url.endsWith('chlom_protocol_status_v2'))return json({contract:'ct.chlom.protocol-status.v2',production_control_plane:true,
      rights_instrument_count:26,production_zk_circuit_count:0,private_key:'private-value',dail:{verified_prefix_ok:true,payload:'private-value'}});
    if(url.endsWith('chlom_wallet_production_status_v3'))return json({contract:'ct.wallet.production-status.v3',production_state:'PRODUCTION_RESTRICTED_EXTERNAL_RAILS',inventory:{active_wallets:6,raw_customer:'private-value'}});
    return json({secret:'private-value'},503);
  });
  const result=await invoke(handler,request('status'));assert.equal(result.status,200);assert.equal(result.data.ok,false);
  assert.deepEqual(result.data.availability,{protocol:'available',control_plane:'unavailable',wallet:'available',mesh:'unavailable'});
  assert.equal(result.data.protocol.rights_instrument_count,26);assert.equal(result.data.protocol.production_zk_circuit_count,0);
  assert.equal(result.data.control_plane,null);assert.doesNotMatch(JSON.stringify(result.data),/private-value|private_key|raw_customer/);
});
test('core status never turns unavailable sources into fabricated zeros',async()=>{
  const {handler}=setup(()=>json({error:'unavailable'},503));const result=await invoke(handler,request('status'));
  assert.equal(result.status,503);assert.equal(result.data.protocol,null);assert.equal(result.data.wallet,null);
  assert.equal(sanitizeProtocol({contract:'ct.chlom.protocol-status.v2',rights_instrument_count:-1}).rights_instrument_count,null);
  assert.equal(sanitizeProtocol({contract:'wrong'}),null);assert.equal(sanitizeWallet({contract:'wrong'}),null);
});
test('core public serializers reject unrecognized contracts and drop nested evidence',()=>{
  const control=sanitizeControlPlane({contract:'ct.chlom.public-control-plane-status.v1',ok:true,release_state:'OPERATIONAL',
    boundaries:{internal_control_plane:'OPERATIONAL',private_key:'sensitive'},drive_evidence:{private:'sensitive'},authenticated_gateway:{slug:'chlom-control-plane-v1',secret:'sensitive'}});
  const mesh=sanitizeMesh({contract:'ct.chlom.mesh.status.v2',status:'operational',binding_summary:{total:4,evidence:'sensitive'}});
  assert.equal(control.ok,true);assert.equal(mesh.binding_summary.total,4);assert.doesNotMatch(JSON.stringify([control,mesh]),/sensitive/);
  assert.equal(sanitizeControlPlane({contract:'wrong'}),null);assert.equal(sanitizeMesh({contract:'wrong'}),null);
});
test('core identity projection filters private JWK parameters and wrong lineage subjects',()=>{
  const id='ctid_'+'a'.repeat(32);const result=sanitizeIdentity({identity:{public_id:id,did:'did:chlom:example',private_key:'secret',
    public_keys:[{public_jwk:{kty:'EC',x:'public',d:'secret'}}]},public_lineage:[{entity_type:'private_identity',entity_id:id,payload:'secret'},
    {entity_type:'public_identity',entity_id:id,event_hash:'public',payload:'secret'}]},id);
  assert.equal(result.public_lineage.length,1);assert.equal(result.identity.public_keys[0].public_jwk.x,'public');
  assert.doesNotMatch(JSON.stringify(result),/secret/);assert.equal(sanitizeIdentity({identity:{public_id:'other'}},id),null);
});
test('core routes reject unknown methods, route names and malformed identity inputs',async()=>{
  const {handler,calls}=setup(()=>{throw new Error('must not fetch');});
  assert.equal((await invoke(handler,request('unknown'))).status,404);
  assert.equal((await invoke(handler,request('health',{method:'DELETE'}))).status,405);
  assert.equal((await invoke(handler,request('resolve&id=private'))).status,400);assert.equal(calls.length,0);
});
test('core provider transport errors remain generic and unconfigured instances fail closed',async()=>{
  const {handler}=setup(()=>{throw new Error('secret-provider-config');});
  const result=await invoke(handler,request('operator',{headers:{cookie}}));assert.equal(result.status,503);
  assert.doesNotMatch(JSON.stringify(result.data),/secret-provider-config/);
  const unconfigured=createCoreHandler({env:{},fetchImpl:()=>{throw new Error('must not fetch');}});
  assert.equal((await invoke(unconfigured,request('status'))).status,503);
  assert.equal((await invoke(unconfigured,request('health'))).data.backend_configured,false);
});
