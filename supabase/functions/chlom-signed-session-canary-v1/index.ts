import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")??"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")??"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const CONTRACT="ct.chlom.signed-session-http-canary.v1";
const GATEWAY=`${URL}/functions/v1/chlom-control-plane-v1`;
const FOUNDER_EMAIL="contact@crownthrive.com";
const FOUNDER_SUBJECT="ct.subject.founder.kavonte-jones-sr";
const GATEWAY_CONTRACT="ct.chlom.authenticated-control-plane-gateway.v1";
const GATEWAY_VERSION="1.1.0";
const DISPATCHER="ct.chlom.authenticated-control-plane-dispatch.v3";
const FUNCTION_ID="9e5785d8-3ae6-49d3-8626-4ecc690784fa";
const FUNCTION_VERSION=4;
const FUNCTION_SHA="b1426595021a29106b7f10e344527a390af1f1ed36becb645ed5c1dcddaad540";

const rec=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; frame-ancestors 'none'","x-chlom-canary-contract":CONTRACT}});
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const shaText=async(v:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));
const hash=async(v:unknown)=>shaText(JSON.stringify(v));

async function gateway(method:"GET"|"POST",path:string,jwt:string,body?:Record<string,unknown>,key?:string){
 const headers:Record<string,string>={authorization:`Bearer ${jwt}`,origin:"https://crownthrive.com",accept:"application/json","x-correlation-id":`ctcorr:chlom-session:${crypto.randomUUID()}`};
 if(body)headers["content-type"]="application/json"; if(key)headers["idempotency-key"]=key;
 const r=await fetch(`${GATEWAY}${path}`,{method,headers,body:body?JSON.stringify(body):undefined});
 const text=await r.text(); let data:unknown=null; try{data=text?JSON.parse(text):null}catch{data={code:"NON_JSON",sha256:await shaText(text)}}
 return {status:r.status,data,sha256:await hash(data)};
}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return out({ok:false,code:"METHOD_NOT_ALLOWED"},405);
 if(!URL||!ANON||!SERVICE)return out({ok:false,code:"RUNTIME_NOT_CONFIGURED"},500);
 const invokeJwt=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
 const oneUse=req.headers.get("x-chlom-canary-token")?.trim()??"";
 if(!/^[0-9a-f]{64}$/.test(oneUse))return out({ok:false,code:"ONE_USE_TOKEN_REQUIRED"},401);
 let body:Record<string,unknown>;try{body=rec(await req.json())}catch{return out({ok:false,code:"INVALID_JSON"},400)}
 const run=String(body.run_key??""); if(!/^[A-Za-z0-9._:-]{16,160}$/.test(run))return out({ok:false,code:"RUN_KEY_INVALID"},400);
 const service=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const anon=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const tokenSha=await shaText(oneUse);
 const consumed=await service.rpc("chlom_consume_signed_session_canary_token_v1",{p_run_key:run,p_token_sha256:tokenSha,p_consumer_contract:CONTRACT});
 if(consumed.error)return out({ok:false,code:"ONE_USE_TOKEN_RPC_REJECTED",rpc_code:consumed.error.code??"UNKNOWN"},403);
 if(rec(consumed.data).ok!==true)return out({ok:false,code:"ONE_USE_TOKEN_REJECTED",state:rec(consumed.data).state??"UNKNOWN"},403);
 let founderJwt="";let founderSession=false;let revoked=false;
 try{
  const link=await service.auth.admin.generateLink({type:"magiclink",email:FOUNDER_EMAIL});
  if(link.error||!link.data?.properties?.hashed_token)throw new Error("FOUNDER_LINK_FAILED");
  const verified=await anon.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"email"});
  if(verified.error||!verified.data.session?.access_token||!verified.data.user?.id)throw new Error("FOUNDER_SESSION_FAILED");
  founderJwt=verified.data.session.access_token;founderSession=true;
  const founderUserId=verified.data.user.id;
  const capabilities=await gateway("GET","/capabilities",founderJwt);
  const asset=`ct.asset.chlom-signed-session-canary.${run}`;
  const payload={action:"register_asset_binding",payload:{canonical_asset_id:asset,asset_version_ref:"1.0.0",asset_class:"SIGNED_SESSION_HTTP_CANARY",fingerprint_sha256:await shaText(`${asset}|1.0.0|${FUNCTION_SHA}`),source_system:"CHLOM_SIGNED_SESSION_HTTP_CANARY",source_ref:run,binding_state:"VERIFIED_FOR_WORKFLOW",legal_effect:"SYNTHETIC_CANARY_NO_LEGAL_EFFECT",evidence:{synthetic:true,provider_http_session:true,money_movement:false,external_chain_transaction:false}}};
  const first=await gateway("POST","/dispatch",founderJwt,payload,`${run}.mutation`);
  const replay=await gateway("POST","/dispatch",founderJwt,payload,`${run}.mutation`);
  const unauthorized=await gateway("POST","/dispatch",invokeJwt,payload,`${run}.unauthorized`);
  const firstData=rec(rec(first.data).data);const firstResult=rec(firstData.result);const replayData=rec(rec(replay.data).data);
  const bindingId=String(firstResult.binding_id??"");const dispatchReceiptId=String(firstData.dispatch_receipt_id??"");const idemSha=String(firstData.idempotency_response_sha256??"");
  const replayOk=replayData.idempotent_replay===true&&String(replayData.dispatch_receipt_id??"")===dispatchReceiptId&&String(replayData.idempotency_response_sha256??"")===idemSha;
  const exact=await service.rpc("chlom_signed_session_canary_readback_v1",{p_run_key:run,p_canonical_asset_id:asset});
  if(exact.error)throw new Error("EXACT_READBACK_FAILED"); const readback=rec(exact.data);
  const signout=await service.auth.admin.signOut(founderJwt,"local");revoked=!signout.error;founderJwt="";
  const denied=unauthorized.status===401||unauthorized.status===403;const duplicates=Number(readback.duplicate_domain_mutations??-1);
  const pass=capabilities.status===200&&first.status===200&&replay.status===200&&replayOk&&readback.ok===true&&duplicates===0&&denied&&founderSession&&revoked;
  const sanitized={run_key:run,result:pass?"PASS":"FAIL",founder_subject_id:FOUNDER_SUBJECT,founder_user_id:founderUserId,gateway_contract:GATEWAY_CONTRACT,gateway_version:GATEWAY_VERSION,dispatcher_contract:DISPATCHER,provider_function_id:FUNCTION_ID,provider_function_version:FUNCTION_VERSION,provider_bundle_sha256:FUNCTION_SHA,founder_capabilities_http_status:capabilities.status,founder_capabilities_sha256:capabilities.sha256,founder_mutation_http_status:first.status,founder_mutation_sha256:first.sha256,founder_replay_http_status:replay.status,founder_replay_sha256:replay.sha256,binding_id:bindingId,dispatch_receipt_id:dispatchReceiptId,idempotency_response_sha256:idemSha,idempotent_replay_verified:replayOk,duplicate_domain_mutations:duplicates,unauthorized_user_created:false,unauthorized_dispatch_http_status:unauthorized.status,unauthorized_denial_verified:denied,unauthorized_user_deleted:true,founder_session_created:founderSession,founder_session_revocation_requested:revoked,raw_tokens_returned:false,external_execution_enabled:false,evidence:{canary_contract:CONTRACT,canary_token_consumed:readback.canary_token_consumed===true,binding_record_sha256:readback.binding_record_sha256,dispatch_result_sha256:readback.dispatch_result_sha256,provider_session_created_by:"GOTRUE_ADMIN_GENERATE_LINK_AND_VERIFY_OTP",raw_auth_material_persisted:false}};
  const receipt=await service.rpc("chlom_record_signed_session_canary_v1",{p_input:sanitized});if(receipt.error)throw new Error("RECEIPT_FAILED");
  return out({ok:pass,contract:CONTRACT,result:pass?"PASS":"FAIL",run_key:run,founder_session_created:founderSession,founder_session_revocation_requested:revoked,founder_capabilities_http_status:capabilities.status,founder_mutation_http_status:first.status,founder_replay_http_status:replay.status,unauthorized_dispatch_http_status:unauthorized.status,unauthorized_denial_verified:denied,idempotent_replay_verified:replayOk,duplicate_domain_mutations:duplicates,binding_id:bindingId,dispatch_receipt_id:dispatchReceiptId,receipt:receipt.data,raw_tokens_returned:false,external_execution_enabled:false},pass?200:409);
 }catch(e){if(founderJwt){try{const s=await service.auth.admin.signOut(founderJwt,"local");revoked=!s.error}catch{}}console.error("CHLOM signed-session canary",e instanceof Error?e.message:"FAILED");return out({ok:false,contract:CONTRACT,code:e instanceof Error?e.message:"CANARY_FAILED",run_key:run,founder_session_created:founderSession,founder_session_revocation_requested:revoked,raw_tokens_returned:false,external_execution_enabled:false},500)}
});
