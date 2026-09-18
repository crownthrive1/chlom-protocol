export const SCHEMA='ct.chlom.lex-workspace.v1';
export const TYPES=['Music & audio','Books & publishing','Visual media','Software & tools','Education & knowledge','Brands & experiences'];
export const LICENSES=['Personal','Household','Small group','Creator / professional','Church / ministry','School / classroom','Public display','Editable / derivative','Print on demand','Custom'];
export function escapeHTML(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export function validateDraft(row){
 if(!row||typeof row!=='object'||!['asset','license'].includes(row.kind))throw Error('Unsupported draft type.');
 if(typeof row.title!=='string'||!row.title.trim()||row.title.length>160)throw Error('Each draft needs a title of 1–160 characters.');
 if(!row.payload||typeof row.payload!=='object'||Array.isArray(row.payload))throw Error('Draft details must be an object.');
 if(new TextEncoder().encode(JSON.stringify(row.payload)).length>65536)throw Error('A draft exceeds the 64 KB limit.');
 return row;
}
export function importWorkspace(text){
 if(text.length>2000000)throw Error('Workspace import exceeds 2 MB.');
 const data=JSON.parse(text);
 if(data.schema!==SCHEMA||!Array.isArray(data.drafts)||data.drafts.length>1000)throw Error('Use a CHLOM LEX workspace export containing no more than 1,000 records.');
 return data.drafts.map(row=>{validateDraft(row);return {kind:row.kind,title:row.title.trim(),payload:JSON.parse(JSON.stringify(row.payload))};});
}
export function splitRevenue(grossValue,feeValue,percentages){
 const gross=Math.round(Number(grossValue)*100),fee=Math.round(Number(feeValue)*100);
 if(!Number.isFinite(gross)||!Number.isFinite(fee)||gross<0||fee<0||fee>gross||gross>1e12)throw Error('Enter nonnegative amounts with fees no greater than gross revenue.');
 if(!Array.isArray(percentages)||!percentages.length||percentages.length>20)throw Error('Add between one and twenty recipients.');
 const weights=percentages.map(x=>Math.round(Number(x)*100));
 if(weights.some(x=>!Number.isFinite(x)||x<0)||weights.reduce((a,b)=>a+b,0)!==10000)throw Error('Recipient percentages must total exactly 100%.');
 const net=gross-fee;
 const raw=weights.map(x=>net*x/10000);
 const cents=raw.map(Math.floor);let remainder=net-cents.reduce((a,b)=>a+b,0);
 const order=raw.map((x,i)=>({i,remainder:x-cents[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let i=0;i<remainder;i++)cents[order[i%order.length].i]++;
 return {gross_cents:gross,fee_cents:fee,net_cents:net,allocations_cents:cents};
}
export function readiness(payload){
 const text=v=>typeof v==='string'&&v.trim().length>0;
 const checks=[['Named work',text(payload.title)||text(payload.assetTitle)],['Rights holder identified',text(payload.owner)],['Source reference recorded',text(payload.source)],['File digest attached',/^[0-9a-f]{64}$/.test(payload.digest||'')],['Permitted use described',text(payload.use)],['Exclusions described',text(payload.exclusions)]];
 return {checks,complete:checks.filter(([,v])=>v).length,total:checks.length};
}
export function licenseBrief(row){
 const p=row.payload||{};
 return ['CHLOM LEX · LICENSE BRIEF','DRAFT FOR REVIEW — NOT AN EXECUTED LICENSE','',`Work / project: ${row.title}`,`Asset reference: ${p.assetTitle||p.assetId||'Not specified'}`,`Rights holder (self-declared): ${p.owner||'Not specified'}`,`Proposed licensee: ${p.licensee||'Not specified'}`,`License class: ${p.licenseClass||'Custom'}`,`Permitted use: ${p.use||'Not specified'}`,`Excluded use: ${p.exclusions||'Not specified'}`,`Territory: ${p.territory||'Not specified'}`,`Term: ${p.term||'Not specified'}`,`Seats / copies: ${p.seats||'Not specified'}`,`Attribution: ${p.attribution||'Not specified'}`,`Proposed fee: ${p.fee||'To be agreed'} ${p.currency||'USD'}`,`Exclusivity: ${p.exclusivity||'Nonexclusive (proposed)'}`,`AI training / voice use: ${p.aiUse||'Not granted by this brief'}`,`Source reference: ${p.source||'Not specified'}`,`File SHA-256: ${p.digest||'Not attached'}`,'','REVIEW CHECKPOINTS','Confirm ownership and any third-party permissions. Confirm territory, term, permitted uses, exclusions, compensation, attribution, termination and dispute terms in the final agreement.','', 'This user-authored planning document does not grant rights, certify ownership, provide legal advice, authorize payments, or prove a public-chain anchor. A file hash compares bytes, not legal title. CrownThrive and CHLOM approvals must be separately recorded.','',`Generated: ${new Date().toISOString()}`,'CHLOM LEX · CrownThrive, LLC · contact@crownthrive.com'].join('\n');
}
export async function hashFile(file){if(!file||file.size>100*1024*1024)throw Error('Choose a file no larger than 100 MB.');const buffer=await file.arrayBuffer();const bytes=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');}
