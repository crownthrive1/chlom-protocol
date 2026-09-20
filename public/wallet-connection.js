export const BASE_CHAIN='0x2105';
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

