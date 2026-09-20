import {escapeHTML as H} from './lex-core.js';

export const BASE_CHAIN='0x2105';
const NAMES={'0x1':'Ethereum Mainnet','0x2105':'Base Mainnet','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum One','0xaa36a7':'Sepolia testnet','0x14a34':'Base Sepolia testnet'};
const UNITS={'0x1':'ETH','0x2105':'ETH','0x89':'POL','0xa':'ETH','0xa4b1':'ETH','0xaa36a7':'test ETH','0x14a34':'test ETH'};
const addressOf=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value)?value:null;
export function normalizeChain(value){if(typeof value!=='string'||!/^0x[0-9a-fA-F]{1,13}$/.test(value))throw Error('The wallet returned an invalid network.');const n=Number(BigInt(value));if(!Number.isSafeInteger(n)||n<1)throw Error('The wallet returned an invalid network.');return '0x'+n.toString(16);}
export function nativeBalance(value){if(typeof value!=='string'||!/^0x[0-9a-fA-F]{1,64}$/.test(value))throw Error('Balance is unavailable.');const n=BigInt(value),whole=n/1000000000000000000n,decimals=(n%1000000000000000000n).toString().padStart(18,'0').slice(0,6).replace(/0+$/,'');return `${whole}${decimals?'.'+decimals:''}`;}
export function walletError(error){if(error?.code===4001||error?.code==='ACTION_REJECTED')return 'You declined the wallet request. Nothing was signed or sent by this workspace.';if(error?.code===-32002)return 'A wallet request is already open. Review it in your wallet.';if(error?.code===4902)return 'Base is not configured in this wallet. Add Base in your wallet settings, then retry.';if(error?.code===4100)return 'The wallet has not authorized this account. Connect again.';return String(error?.message||'The wallet could not complete this request.').slice(0,350);}
async function walletAPI(route,body){const response=await fetch('/api/wallet?route='+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok||data.ok===false)throw Error(data.error||'Wallet verification is unavailable.');return data;}

/** Browser-only connection state; never stores a key, signature, or address in localStorage. */
export class WalletConnection {
  constructor({host=globalThis.window,onChange=()=>{},api=walletAPI}={}){
    this.host=host;this.onChange=onChange;this.api=api;this.providers=[];this.provider=null;this.listeners=[];this.epoch=0;this.discovering=false;this.expirationTimer=null;
    this.state={address:null,chain:null,balance:null,name:null,pending:false,error:'',challenge:null,observation:null,status:null};
  }
  emit(){this.onChange(this.state);}
  addProvider(detail){
    if(!detail?.provider||typeof detail.provider.request!=='function'||this.providers.some(p=>p.provider===detail.provider))return;
    if(this.providers.length>=20)return;
    const name=typeof detail.info?.name==='string'?detail.info.name.slice(0,80):'Browser wallet';
    this.providers.push({id:'wallet-'+this.providers.length,name,provider:detail.provider});this.emit();
  }
  discover(){
    if(!this.discovering){this.discovering=true;this.host.addEventListener('eip6963:announceProvider',event=>this.addProvider(event.detail));}
    this.host.dispatchEvent(new Event('eip6963:requestProvider'));
    if(this.host.ethereum)this.addProvider({provider:this.host.ethereum,info:{name:'Browser wallet (legacy provider)'}});
    this.emit();
  }
  async loadStatus(){try{this.state.status=await this.api('status');}catch{this.state.status={proof_verification:false};}this.emit();}
  unbind(){for(const [name,handler]of this.listeners)this.provider?.removeListener?.(name,handler);this.listeners=[];}
  attach(provider){
    this.provider=provider;
    const accountChanged=accounts=>{this.epoch++;this.state.address=Array.isArray(accounts)?addressOf(accounts[0]):null;this.state.challenge=null;this.state.observation=null;this.state.balance=null;this.state.error='';this.emit();if(this.state.address)this.refresh().catch(error=>{this.state.error=walletError(error);this.emit();});};
    const chainChanged=chain=>{this.epoch++;this.state.challenge=null;this.state.observation=null;this.state.balance=null;try{this.state.chain=normalizeChain(chain);this.state.error='';}catch(error){this.state.chain=null;this.state.error=walletError(error);}this.emit();if(this.state.address)this.refresh().catch(error=>{this.state.error=walletError(error);this.emit();});};
    const disconnected=()=>this.disconnect();
    for(const [name,handler]of [['accountsChanged',accountChanged],['chainChanged',chainChanged],['disconnect',disconnected]]){if(typeof provider.on==='function'){provider.on(name,handler);this.listeners.push([name,handler]);}}
  }
  async connect(id){
    if(this.state.pending)return;
    const selected=this.providers.find(p=>p.id===id);if(!selected)throw Error('Choose an available wallet.');
    this.unbind();this.provider=null;const epoch=++this.epoch;
    Object.assign(this.state,{pending:true,error:'',address:null,chain:null,balance:null,name:selected.name,challenge:null,observation:null});this.emit();
    try{
      const accounts=await selected.provider.request({method:'eth_requestAccounts'});
      if(epoch!==this.epoch)return;
      const address=Array.isArray(accounts)?addressOf(accounts[0]):null;if(!address)throw Error('The wallet did not share an account.');
      const chain=normalizeChain(await selected.provider.request({method:'eth_chainId'}));
      if(epoch!==this.epoch)return;
      this.attach(selected.provider);Object.assign(this.state,{address,chain});await this.refresh();
    }catch(error){if(epoch===this.epoch){this.state.error=walletError(error);throw error;}}
    finally{this.state.pending=false;this.emit();}
  }
  disconnect(){
    this.epoch++;this.unbind();this.provider=null;clearTimeout(this.expirationTimer);
    Object.assign(this.state,{address:null,chain:null,balance:null,name:null,pending:false,error:'',challenge:null,observation:null});
    this.emit();this.api('disconnect',{}).catch(()=>{});
  }
  async refresh(){
    if(!this.provider||!this.state.address)return;
    const epoch=this.epoch,provider=this.provider;
    const [accounts,rawChain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
    if(epoch!==this.epoch)return;
    const address=Array.isArray(accounts)?addressOf(accounts[0]):null,chain=normalizeChain(rawChain);
    if(address?.toLowerCase()!==this.state.address?.toLowerCase()||chain!==this.state.chain){this.epoch++;this.state.challenge=null;this.state.observation=null;}
    Object.assign(this.state,{address,chain,balance:null});
    const balanceEpoch=this.epoch;
    if(address){try{const balance=await provider.request({method:'eth_getBalance',params:[address,'latest']});if(balanceEpoch===this.epoch)this.state.balance=nativeBalance(balance);}catch{/* A read error must not undo a working wallet connection. */}}
    this.emit();
  }
  async switchToBase(){
    if(!this.provider||!this.state.address)throw Error('Connect a wallet first.');
    await this.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE_CHAIN}]});
    await this.refresh();
  }
  async prepareProof(){
    if(!this.provider||!this.state.address)throw Error('Connect a wallet first.');
    await this.refresh();if(!this.state.address)throw Error('The wallet is disconnected.');
    const epoch=this.epoch;
    const result=await this.api('challenge',{address:this.state.address,chain_id:this.state.chain});
    if(epoch!==this.epoch)throw Error('The wallet changed. Prepare a new verification.');
    if(result.address?.toLowerCase()!==this.state.address.toLowerCase()||result.chain_id!==this.state.chain||typeof result.message!=='string'||result.message.length>2000)throw Error('The verifier returned an unexpected challenge.');
    this.state.challenge=result;this.state.observation=null;this.emit();
  }
  async signProof(){
    const challenge=this.state.challenge;if(!challenge||!this.provider)throw Error('Prepare a verification message first.');
    if(Date.parse(challenge.expires_at)<=Date.now())throw Error('This message expired. Prepare a new verification.');
    await this.refresh();if(this.state.challenge!==challenge)throw Error('The wallet changed. Prepare a new verification.');
    const epoch=this.epoch,provider=this.provider,address=this.state.address;
    const hex='0x'+Array.from(new TextEncoder().encode(challenge.message),byte=>byte.toString(16).padStart(2,'0')).join('');
    const signature=await provider.request({method:'personal_sign',params:[hex,address]});
    if(epoch!==this.epoch)throw Error('The wallet changed while signing. Prepare a new verification.');
    await this.refresh();if(epoch!==this.epoch||this.state.challenge!==challenge)throw Error('The wallet changed while signing. Prepare a new verification.');
    const result=await this.api('verify',{signature});
    if(epoch!==this.epoch)throw Error('The wallet changed. Prepare a new verification.');
    if(result.observation?.address?.toLowerCase()!==address.toLowerCase()||result.observation.chain_id!==this.state.chain||result.observation.scope!=='browser_observation_only')throw Error('The verifier returned an unexpected observation.');
    this.state.observation=result.observation;this.state.challenge=null;this.emit();
    clearTimeout(this.expirationTimer);
    const remaining=Date.parse(result.observation.expires_at)-Date.now();
    if(Number.isFinite(remaining)&&remaining>0){this.expirationTimer=setTimeout(()=>this.emit(),Math.min(remaining+10,300010));this.expirationTimer.unref?.();}
  }
}

let connection;
function current(){if(!connection)connection=new WalletConnection({onChange:draw});return connection;}
export function walletPage(){return '<div class="pagehead"><div><h1>Your wallet. Your control.</h1><p>Connect your existing EVM wallet and verify its signature. Your wallet keeps the keys.</p></div></div><div id="wallet-body" aria-live="polite"></div>';}
function button(label,action,disabled=false){return `<button type="button" class="button ${action==='sign'?'dark':''}" data-wallet-action="${action}" ${disabled?'disabled':''}>${label}</button>`;}
function draw(){
  const target=document.querySelector('#wallet-body');if(!target||!connection)return;
  const s=connection.state,active=Boolean(s.address),expired=s.observation&&Date.parse(s.observation.expires_at)<=Date.now();
  const network=s.chain?(NAMES[s.chain]||'EVM network')+' · Chain '+Number(BigInt(s.chain)):'No network selected';
  target.innerHTML=`<div class="twocol"><section class="panel"><div class="eyebrow">${active?'CONNECTED WALLET':'WALLET CONNECTION'}</div><h2>${active?H(s.name):'Choose your wallet.'}</h2>${active?`<p class="hash">${H(s.address)}</p><p>${H(network)}</p><div class="notice">Native balance: ${s.balance===null?'Unavailable':H(s.balance)} ${H(UNITS[s.chain]||'native units')}<br><small>Read from your wallet’s provider. No value is transferred.</small></div><div class="pageactions">${button('Refresh','refresh',s.pending)}${s.chain!==BASE_CHAIN?button('Switch to Base','switch',s.pending):''}${button('Disconnect','disconnect')}</div><p class="supportline">Disconnect clears this page’s wallet state. Manage the site permission in your wallet to revoke access there.</p>`:`<label class="field">Available wallets<select id="wallet-provider" ${s.pending?'disabled':''}>${connection.providers.length?connection.providers.map(p=>`<option value="${H(p.id)}">${H(p.name)}</option>`).join(''):'<option value="">No wallet detected</option>'}</select></label><div class="pageactions">${button(s.pending?'Check your wallet…':'Connect wallet','connect',s.pending||!connection.providers.length)}${button('Find wallets','discover',s.pending)}</div><p>On mobile, open this page in your wallet’s browser. On desktop, unlock an installed EVM wallet extension.</p><p class="supportline">Wallet names are reported by your browser extension. Check the account and domain in your wallet before approving.</p>`}<div role="status">${s.pending?'<p>Waiting for the wallet or verifier…</p>':''}</div>${s.error?`<div class="error" role="alert">${H(s.error)}</div>`:''}</section><section class="panel"><div class="eyebrow">SIGNATURE VERIFICATION</div><h2>Confirm control. Keep your keys.</h2><p>Review a short message, approve it in your wallet, and have CHLOM independently recover the signer’s address.</p>${s.observation?`<div class="${expired?'notice':'success'}"><strong>${expired?'Verification window expired.':'Signature verified.'}</strong><p class="hash">${H(s.observation.address)}</p><p>Checked ${H(new Date(s.observation.verified_at).toLocaleString())}.</p><small>Valid until ${H(new Date(s.observation.expires_at).toLocaleTimeString())} for this browser observation.</small></div>`:''}${s.challenge?`<details open><summary>Exact message your wallet will sign</summary><pre>${H(s.challenge.message)}</pre></details><div class="pageactions">${button('Sign wallet-control message','sign',s.pending)}${button('New message','prepare',s.pending)}</div>`:`${button(s.observation?'Verify again':'Prepare verification','prepare',s.pending||!active||s.status?.proof_verification!==true)}`}${s.status?.proof_verification===false?'<p class="notice">Signature verification is unavailable on this installation. Wallet connection remains available.</p>':''}<p class="supportline">This observation does not sign you in, link an account, authorize a purchase, or grant a license. Smart-contract wallet signatures are not supported in this release.</p></section></div><section class="panel"><h2>Use the right payment path.</h2><p>Wallet connection is available independently of the licensing workspace. Purchases use the published offer’s checkout and fulfillment terms. Connecting a wallet does not issue CHM, move tokens, or approve spending.</p><div class="pageactions"><a class="button dark" href="#exchange">Browse the exchange ↗</a><a class="button" href="#workspace">Open your workspace ↗</a></div><p class="supportline">This interface supports browser-injected EVM wallets. WalletConnect QR pairing and embedded wallets require separate provider configuration.</p></section>`;
  target.onclick=async event=>{
    const el=event.target.closest('[data-wallet-action]');if(!el)return;
    const act=el.dataset.walletAction;
    if(act==='disconnect'){connection.disconnect();return;}
    if(act==='discover'){connection.discover();return;}
    if(s.pending)return;
    const selected=target.querySelector('#wallet-provider')?.value;
    if(act==='connect'){try{await connection.connect(selected);}catch{/* Connection records its own error. */}return;}
    s.pending=true;s.error='';draw();
    try{if(act==='refresh')await connection.refresh();else if(act==='switch')await connection.switchToBase();else if(act==='prepare')await connection.prepareProof();else if(act==='sign')await connection.signProof();}
    catch(error){s.error=walletError(error);}
    finally{s.pending=false;draw();}
  };
}
export function mountWallet(){const wallet=current();wallet.discover();draw();wallet.loadStatus();}
