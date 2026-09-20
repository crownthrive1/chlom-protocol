import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WalletConnection,nativeBalance,normalizeChain,walletError} from '../public/lex-wallet.js';

const ADDRESS='0x1234567890123456789012345678901234567890';
const OTHER='0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
class Provider extends EventEmitter {
  accounts=[ADDRESS];chain='0x2105';calls=[];signHook=null;
  async request(request){this.calls.push(request);switch(request.method){
    case 'eth_requestAccounts':case 'eth_accounts':return this.accounts;
    case 'eth_chainId':return this.chain;
    case 'eth_getBalance':return '0xde0b6b3a7640000';
    case 'wallet_switchEthereumChain':this.chain=request.params[0].chainId;this.emit('chainChanged',this.chain);return null;
    case 'personal_sign':if(this.signHook)await this.signHook();return '0x'+'11'.repeat(65);
    default:throw Error('Unexpected provider mutation '+request.method);
  }}
}
function fixture(){const provider=new Provider(),host=new EventTarget(),apiCalls=[];host.ethereum=provider;
  const api=async(route,body)=>{apiCalls.push({route,body});if(route==='challenge')return {message:'CHLOM test observation',address:body.address,chain_id:body.chain_id,expires_at:new Date(Date.now()+300000).toISOString()};if(route==='verify')return {observation:{address:ADDRESS,chain_id:'0x2105',scope:'browser_observation_only'}};return {proof_verification:true};};
  const connection=new WalletConnection({host,api});connection.discover();return {provider,host,connection,apiCalls};
}
test('wallet discovery is passive, deduplicates providers and never auto-requests account access',()=>{
  const {provider,connection}=fixture();connection.discover();connection.addProvider({provider,info:{name:'Repeated'}});
  assert.equal(connection.providers.length,1);assert.equal(provider.calls.length,0);
  connection.addProvider({provider:{request:null}});assert.equal(connection.providers.length,1);
});
test('wallet connect reads address/network/balance and signs only after a second explicit action',async()=>{
  const {provider,connection,apiCalls}=fixture();await connection.connect('wallet-0');
  assert.equal(connection.state.address,ADDRESS);assert.equal(connection.state.chain,'0x2105');assert.equal(connection.state.balance,'1');
  await connection.prepareProof();assert.equal(provider.calls.some(x=>x.method==='personal_sign'),false);
  await connection.signProof();assert.equal(connection.state.observation.address,ADDRESS);
  assert.equal(apiCalls.find(x=>x.route==='verify').body.signature,'0x'+'11'.repeat(65));
  assert.deepEqual([...new Set(provider.calls.map(x=>x.method))].sort(),['eth_accounts','eth_chainId','eth_getBalance','eth_requestAccounts','personal_sign']);
});
test('wallet account and chain changes discard previous proof, and disconnect detaches listeners',async()=>{
  const {provider,connection}=fixture();await connection.connect('wallet-0');await connection.prepareProof();await connection.signProof();
  provider.accounts=[OTHER];provider.emit('accountsChanged',[OTHER]);assert.equal(connection.state.observation,null);assert.equal(connection.state.address,OTHER);
  provider.chain='0x1';provider.emit('chainChanged','0x1');assert.equal(connection.state.challenge,null);assert.equal(connection.state.chain,'0x1');
  connection.disconnect();assert.equal(connection.state.address,null);assert.equal(provider.listenerCount('accountsChanged'),0);
});
test('wallet account changes during signing never send the stale signature for verification',async()=>{
  const {provider,connection,apiCalls}=fixture();await connection.connect('wallet-0');await connection.prepareProof();
  provider.signHook=async()=>{provider.accounts=[OTHER];provider.emit('accountsChanged',[OTHER]);};
  await assert.rejects(connection.signProof(),/wallet changed/i);
  assert.equal(apiCalls.some(x=>x.route==='verify'),false);assert.equal(connection.state.observation,null);
});
test('wallet account changes without an event are detected before verification',async()=>{
  const {provider,connection,apiCalls}=fixture();await connection.connect('wallet-0');await connection.prepareProof();provider.accounts=[OTHER];
  await assert.rejects(connection.signProof(),/wallet changed/i);assert.equal(apiCalls.some(x=>x.route==='verify'),false);
});
test('wallet rejection and invalid provider data do not produce a connected or verified state',async()=>{
  const {provider,connection}=fixture();provider.request=async()=>{throw Object.assign(Error('Rejected'),{code:4001});};
  await assert.rejects(connection.connect('wallet-0'));assert.equal(connection.state.address,null);assert.equal(connection.state.pending,false);assert.match(connection.state.error,/declined/);
  assert.throws(()=>normalizeChain('javascript:bad'));assert.throws(()=>normalizeChain('0x0'));assert.throws(()=>nativeBalance('-1'));
  assert.equal(nativeBalance('0xde0b6b3a7640000'),'1');assert.equal(walletError({code:4902}),'Base is not configured in this wallet. Add Base in your wallet settings, then retry.');
});
