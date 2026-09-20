import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import handler from '../api/wallet.js';
import {CHALLENGE_COOKIE,createChallenge,readChallenge,verifyChallenge,proofConfigured} from '../lib/wallet-proof.js';

const env={CHLOM_WALLET_CHALLENGE_SECRET:'test-only-wallet-secret-not-a-production-credential'};
const signer=Wallet.createRandom();
const origin='https://lex.test';
const input={origin,address:signer.address,chain_id:'0x2105'};

test('wallet proof cryptographically recovers the signer without creating account or payment authority',async()=>{
  const now=Date.now(),c=createChallenge(input,env,now);
  const proof=verifyChallenge(c.cookie,origin,await signer.signMessage(c.message),env,now+1000);
  assert.equal(proof.address,signer.address);assert.equal(proof.scope,'browser_observation_only');
  assert.equal(proof.account_authenticated,false);assert.equal(proof.account_binding_created,false);
  assert.equal(proof.payment_authorized,false);assert.equal(proof.rights_granted,false);assert.equal(proof.one_time_nonce,false);
  assert.match(c.message,/does not sign in, transfer funds, approve spending/);
});
test('wallet proof rejects wrong signers and signatures of a modified message',async()=>{
  const c=createChallenge(input,env);
  assert.throws(()=>verifyChallenge(c.cookie,origin,'0x'+'00'.repeat(65),env),/could not be verified/);
  const wrong=await Wallet.createRandom().signMessage(c.message);
  assert.throws(()=>verifyChallenge(c.cookie,origin,wrong,env),/does not match/);
  const modified=await signer.signMessage(c.message+' changed');
  assert.throws(()=>verifyChallenge(c.cookie,origin,modified,env),/does not match/);
});
test('wallet challenge rejects wrong origin, altered cookie, expiry, future issue time and signing-key change',()=>{
  const now=Date.now(),c=createChallenge(input,env,now);
  assert.throws(()=>readChallenge(c.cookie,'https://other.test',env,now),/different origin/);
  assert.throws(()=>readChallenge(c.cookie+'x',origin,env,now),/new wallet challenge/);
  assert.throws(()=>readChallenge(c.cookie,origin,env,now+300000),/expired/);
  assert.throws(()=>readChallenge(c.cookie,origin,env,now-1),/expired/);
  assert.throws(()=>readChallenge(c.cookie,origin,{CHLOM_WALLET_CHALLENGE_SECRET:'changed-test-signing-secret-1234567890'},now),/new wallet challenge/);
});
test('wallet challenge has bounded inputs and fails closed without its server secret',()=>{
  assert.equal(proofConfigured({}),false);assert.equal(proofConfigured(env),true);
  assert.throws(()=>createChallenge(input,{}),/not configured/);
  assert.throws(()=>createChallenge({...input,address:'not-an-address'},env),/valid EVM/);
  assert.throws(()=>createChallenge({...input,chain_id:'0x0'},env),/unsupported chain/);
  assert.throws(()=>createChallenge({...input,origin:'http://lex.test'},env),/secure origin/);
  assert.throws(()=>createChallenge({...input,origin:'https://lex.test/path'},env),/secure origin/);
});
test('challenge replay only returns the same bounded observation and is not advertised as one-time authentication',async()=>{
  const now=Date.now(),c=createChallenge(input,env,now),sig=await signer.signMessage(c.message);
  const first=verifyChallenge(c.cookie,origin,sig,env,now+1),again=verifyChallenge(c.cookie,origin,sig,env,now+2);
  assert.equal(first.address,again.address);assert.equal(again.account_authenticated,false);assert.equal(again.one_time_nonce,false);
});
const req=(method,route,body,headers={})=>({method,url:'/api/wallet?route='+route,headers:{host:'lex.test',origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body})});
async function invoke(request){const headers={};let value;const response={setHeader(k,v){headers[k]=v;},end(raw){value=JSON.parse(raw);}};await handler(request,response);return {status:response.statusCode,headers,value};}
test('wallet API binds challenge to secure cookie and verifies only that exact server-issued message',async()=>{
  const previous=process.env.CHLOM_WALLET_CHALLENGE_SECRET;process.env.CHLOM_WALLET_CHALLENGE_SECRET=env.CHLOM_WALLET_CHALLENGE_SECRET;
  try {
    const created=await invoke(req('POST','challenge',{address:signer.address,chain_id:'0x2105'}));
    assert.equal(created.status,200);assert.match(created.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict; Max-Age=300/);
    assert.equal(created.value.cookie,undefined);
    const cookie=created.headers['Set-Cookie'].split(';')[0];assert.ok(cookie.startsWith(CHALLENGE_COOKIE+'='));
    const signed=await signer.signMessage(created.value.message);
    const verified=await invoke(req('POST','verify',{signature:signed},{cookie}));
    assert.equal(verified.status,200);assert.equal(verified.value.observation.address,signer.address);
    assert.match(verified.headers['Set-Cookie'],/Max-Age=0/);
    assert.equal((await invoke(req('POST','verify',{signature:signed}))).status,401);
    assert.equal((await invoke(req('POST','verify',{signature:signed},{cookie,origin:'https://hostile.test'}))).status,403);
  }finally{if(previous===undefined)delete process.env.CHLOM_WALLET_CHALLENGE_SECRET;else process.env.CHLOM_WALLET_CHALLENGE_SECRET=previous;}
});
test('wallet API enforces origin, request size and JSON boundaries before cryptographic verification',async()=>{
  assert.equal((await invoke(req('POST','challenge',{}, {origin:''}))).status,403);
  assert.equal((await invoke(req('POST','challenge',{}, {'content-length':'5000'}))).status,413);
  assert.equal((await invoke(req('POST','challenge',{}, {'content-type':'text/plain'}))).status,415);
  assert.equal((await invoke(req('POST','challenge',[]))).status,400);
  assert.equal((await invoke(req('PUT','challenge',{}))).status,405);
  assert.equal((await invoke(req('POST','unknown',{}))).status,404);
});
test('wallet status states precise integration boundaries',async()=>{
  const result=await invoke(req('GET','status'));
  assert.equal(result.status,200);assert.equal(result.value.walletconnect_relay,false);assert.equal(result.value.embedded_wallet,false);
  assert.equal(result.value.payment_execution,false);assert.equal(result.value.token_issuance,false);assert.equal(result.value.account_authentication,false);
});
