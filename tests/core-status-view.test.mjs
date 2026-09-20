import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {sanitizeProtocol,sanitizeControlPlane} from '../lib/core-status.js';

// Execute the actual status renderer against an inert DOM and fixed responses.
// Wallet and navigation side effects are stubs; no endpoint is contacted.
const source=(await readFile(new URL('../public/core.js',import.meta.url),'utf8'))
  .replace(/^import \{[^}]+\} from '\.\/wallet-connection\.js';\n/,'')
  .replace('wallet.discover(); wallet.loadStatus(); refreshStatus();','wallet.discover(); wallet.loadStatus();')
  .replace(/export \{jsonRequest\};\s*$/,'');

class Element {
  textContent='';children=[];disabled=false;
  classes=new Set();
  classList={toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)};
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(){}
}
async function render(core) {
  const elements=new Map();
  const element=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
  const responses={
    '/api/core?route=health':{ok:true,backend_configured:true,version:'1.4.0'},
    '/api/core?route=status':core,
    '/api/protocol':{ok:true,policyRegistry:'unconfigured',utilityRegistry:'unconfigured'},
    '/api/wallet?route=status':{ok:true,proof_verification:false},
    '/api/health':{ok:true,readiness:{configuredRpcChains:[]}},
  };
  const context=vm.createContext({
    document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>new Element(),
      createTextNode:text=>Object.assign(new Element(),{textContent:text})},
    location:{origin:'https://core.example.test',hash:'#overview'},addEventListener(){},
    AbortSignal,WalletConnection:class {discover(){}loadStatus(){}},
    BASE_CHAIN:'0x2105',walletError:()=>'',
    fetch:async url=>{assert.ok(Object.hasOwn(responses,url),'Unexpected fixture endpoint');return {ok:true,status:200,json:async()=>responses[url]};},
  });
  vm.runInContext(source,context,{filename:'public/core.js'});
  await context.refreshStatus();
  const fields=Object.fromEntries(element('#core-detail').children.map(row=>row.children.map(child=>child.textContent)));
  return {badge:element('#ledger-badge').textContent,badgeAvailable:element('#ledger-badge').classes.has('available'),
    fields,description:element('#core-description').textContent};
}
const control=dail=>sanitizeControlPlane({contract:'ct.chlom.public-control-plane-status.v1',ok:true,dail});
const protocol=dail=>sanitizeProtocol({contract:'ct.chlom.protocol-status.v2',...(dail===undefined?{}:{dail})});
const aggregate=(p,c)=>({ok:false,source:'canonical_chlom_core',protocol:p,control_plane:c,
  availability:{protocol:'available',control_plane:'available',wallet:'unavailable',mesh:'available'}});

test('core status renders control-plane DAIL when the protocol projection contains only null fields',async()=>{
  const projected=protocol();
  assert.equal(projected.dail.integrity_state,null);
  const result=await render(aggregate(projected,control({integrity_state:'PASS_VERIFIED_PREFIX_CATCHUP_PENDING',
    verified_prefix_ok:true,sequence_span_lag:56})));
  assert.equal(result.badge,'PASS VERIFIED PREFIX CATCHUP PENDING');
  assert.equal(result.fields['DAIL sequence lag'],'56');
  assert.equal(result.badgeAvailable,false,'catch-up state must not become a fully caught-up badge');
  assert.match(result.description,/Some core status sources responded/,'fallback must not promote partial source availability');
});
test('a valid protocol DAIL retains precedence over the control-plane projection',async()=>{
  const result=await render(aggregate(protocol({integrity_state:'PASS_VERIFIED_PREFIX_CATCHUP_PENDING',
    verified_prefix_ok:true,sequence_span_lag:8}),control({integrity_state:'PASS_FULLY_VERIFIED',verified_prefix_ok:true,sequence_span_lag:0})));
  assert.equal(result.badge,'PASS VERIFIED PREFIX CATCHUP PENDING');
  assert.equal(result.fields['DAIL sequence lag'],'8');
  assert.equal(result.badgeAvailable,false);
});
test('absent DAIL observations remain unverified without fabricating a ledger state',async()=>{
  const result=await render(aggregate(protocol(),null));
  assert.equal(result.badge,'Core not verified');
  assert.equal(result.fields['DAIL integrity state'],undefined);
  assert.equal(result.fields['DAIL sequence lag'],undefined);
  assert.equal(result.badgeAvailable,false);
});
