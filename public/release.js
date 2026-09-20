import { createFileCommitment, verifyFileCommitment } from './proof-core.js';
let currentOpening;
async function fileBytes(input) {
  const file=input.files?.[0];
  if (!file) throw new Error('Choose a file first.');
  if (file.size>25*1024*1024) throw new Error('Choose a file no larger than 25 MB.');
  return file.arrayBuffer();
}
function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelector('#commit-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  const result=document.querySelector('#commit-result');const downloads=document.querySelector('#downloads');downloads.hidden=true;currentOpening=undefined;
  try {currentOpening=await createFileCommitment(await fileBytes(document.querySelector('#evidence-file')));result.textContent='Commitment created on this device. Download both files; keep the private opening with your original evidence.';downloads.hidden=false;}
  catch(error){result.textContent=error.message;}finally{button.disabled=false;}
});
document.querySelector('#download-public').addEventListener('click',()=>{if(currentOpening)download('chlom-public-commitment.json',currentOpening.publicCommitment);});
document.querySelector('#download-private').addEventListener('click',()=>{if(currentOpening)download('chlom-private-opening.json',currentOpening);});
document.querySelector('#verify-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;const result=document.querySelector('#verify-result');
  try {const raw=document.querySelector('#opening').value;if(raw.length>8000)throw new Error('Opening JSON is too large.');let opening;try{opening=JSON.parse(raw);}catch{throw new Error('The opening is not valid JSON.');}const matches=await verifyFileCommitment(await fileBytes(document.querySelector('#verify-file')),opening);result.textContent=matches?'MATCH — the file bytes and private opening match this commitment.':'NO MATCH — the file or opening does not match this commitment.';}
  catch(error){result.textContent=error.message;}finally{button.disabled=false;}
});
function capability(title,message){const card=document.createElement('article');const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=message;card.append(h,p);return card;}
async function status(){
  const grid=document.querySelector('#capabilities');
  const results=await Promise.allSettled(['/api/wallet','/api/protocol','/api/health'].map(async url=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}));
  const [wallet,protocol,runtime]=results;
  grid.replaceChildren(
    capability('Browser tools','File commitments and local workspace tools run on this device. Wallet connections require an installed compatible wallet.'),
    capability('Wallet verification',wallet.status==='fulfilled'?(wallet.value.proof_verification ? 'Signature observation is configured. Connect a wallet to verify a short-lived message.' : 'Wallet connection is available. Signature observation needs server configuration.'):'Wallet service could not be verified. Connection features may still be available.'),
    capability('Protocol API',protocol.status==='fulfilled'?'Protocol service responded. Authenticated policy and utility evaluation require approved server configuration.':'Protocol service could not be verified.'),
    capability('Chain evidence',runtime.status==='fulfilled'?`Current readiness: ${runtime.value.readinessStatus||'UNKNOWN'}.`:'Runtime readback unavailable.'),
    capability('ZK and token issuance','Production ZK proofs, native token issuance, and settlement require separate verified deployments. This release does not activate them.'),
    capability('Commercial installation','Installable source and operator documentation are available. Paid entitlements and third-party delivery require their own accepted license and fulfillment configuration.'),
  );
}
status();
