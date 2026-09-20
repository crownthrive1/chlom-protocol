import {CHALLENGE_COOKIE,CHALLENGE_SECONDS,createChallenge,proofConfigured,verifyChallenge} from '../lib/wallet-proof.js';

const LIMIT=4096;
const buckets=new Map();
function failure(message,status=400){return Object.assign(new Error(message),{status});}
function originOf(req){
  try {const origin=new URL(req.headers.origin);if(origin.protocol==='https:' && origin.origin===req.headers.origin && origin.host===req.headers.host)return origin.origin;}catch{/* Reject missing or malformed origin. */}
  throw failure('A same-origin HTTPS request is required.',403);
}
function cookieOf(req){
  const parts=String(req.headers.cookie||'').split(';');
  for(const part of parts){const [name,...value]=part.trim().split('=');if(name===CHALLENGE_COOKIE)return value.join('=');}
  return '';
}
function setCookie(res,value,age){res.setHeader('Set-Cookie',`${CHALLENGE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`);}
function limitRequest(req){
  const key=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,100),now=Date.now();
  if(buckets.size>1000)for(const [ip,row] of buckets)if(row.until<=now)buckets.delete(ip);
  let row=buckets.get(key);
  if(!row||row.until<=now){row={count:0,until:now+60000};if(buckets.size>=5000)throw failure('Wallet verification is busy. Retry shortly.',429);buckets.set(key,row);}
  if(++row.count>30)throw failure('Too many wallet requests. Retry in one minute.',429);
}
async function bodyOf(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw failure('Use an application/json request.',415);
  if(Number(req.headers['content-length']||0)>LIMIT)throw failure('Wallet request is too large.',413);
  let raw;
  if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else {const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>LIMIT)throw failure('Wallet request is too large.',413);chunks.push(Buffer.from(chunk));}raw=Buffer.concat(chunks).toString('utf8');}
  if(Buffer.byteLength(raw||'')>LIMIT)throw failure('Wallet request is too large.',413);
  let data;try{data=JSON.parse(raw||'{}');}catch{throw failure('Malformed JSON.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw failure('A JSON object is required.');
  return data;
}
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie, Origin');
  const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try {
    const route=new URL(req.url,'https://wallet.invalid').searchParams.get('route')||'status';
    if(req.method==='GET' && route==='status')return send(200,{ok:true,version:'1.0.0',connection:'injected_evm_wallet',discovery:['EIP-6963','EIP-1193'],proof_verification:proofConfigured(),proof_scope:'browser_observation_only',challenge_ttl_seconds:CHALLENGE_SECONDS,account_authentication:false,contract_wallet_verification:false,walletconnect_relay:false,embedded_wallet:false,payment_execution:false,token_issuance:false,one_time_nonce:false});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{ok:false,error:'Method not allowed.'});}
    const origin=originOf(req);limitRequest(req);
    if(!['challenge','verify','disconnect'].includes(route))return send(404,{ok:false,error:'Wallet route not found.'});
    if(route==='disconnect'){setCookie(res,'',0);return send(200,{ok:true});}
    const body=await bodyOf(req);
    if(route==='challenge'){
      const result=createChallenge({origin,address:body.address,chain_id:body.chain_id});
      setCookie(res,result.cookie,CHALLENGE_SECONDS);
      return send(200,{ok:true,message:result.message,address:result.challenge.address,chain_id:result.challenge.chain_id,expires_at:new Date(result.challenge.expires_at).toISOString()});
    }
    const observation=verifyChallenge(cookieOf(req),origin,body.signature);
    setCookie(res,'',0);
    return send(200,{ok:true,observation});
  }catch(error){return send(error.status||500,{ok:false,error:error.status?error.message:'Wallet verification is temporarily unavailable.'});}
}
