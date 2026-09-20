// Run with PGLITE_MODULE_URL pointing at @electric-sql/pglite's dist/index.js.
// The test engine is intentionally external to the production runtime dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

if (!process.env.PGLITE_MODULE_URL) throw Error('Set PGLITE_MODULE_URL to the temporary PGlite module file URL.');
const {PGlite}=await import(process.env.PGLITE_MODULE_URL);
const db=new PGlite();
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const bootstrap=await readFile(new URL('./workspace-bootstrap-v1.sql',import.meta.url),'utf8');
const verification=await readFile(new URL('./workspace-verification-v1.sql',import.meta.url),'utf8');
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  $$;
  grant usage on schema auth to anon,authenticated;
  insert into auth.users values ('${a}'),('${b}');`);
await db.exec(bootstrap);
async function asUser(uid,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);
  await db.exec(`set role ${role}`);
}
async function save({id=null,kind='asset',title='Test work',payload={owner:'Test'},revision=0,archive=false}={}) {
  return (await db.query('select public.chlom_lex_save_draft_v1($1,$2,$3,$4::jsonb,$5,$6) as result',
    [id,kind,title,JSON.stringify(payload),revision,archive])).rows[0].result;
}
let draft;
test('bootstrap installs with all grant/RLS/capability verification checks passing',async()=>{
  const rows=(await db.query(verification)).rows;
  assert.ok(rows.length>=12);
  assert.deepEqual(rows.filter(r=>!r.passed),[]);
});
test('anonymous cannot save or read workspace records',async()=>{
  await asUser(null,'anon');
  await assert.rejects(save(),e=>e.code==='42501');
  await assert.rejects(db.query('select * from public.chlom_lex_drafts_v1'),e=>e.code==='42501');
});
test('authenticated user cannot write without an authenticated UID',async()=>{
  await asUser(null);
  await assert.rejects(save(),/AUTHENTICATION_REQUIRED/);
});
test('owner can save and receive a private revision and hash',async()=>{
  await asUser(a);
  const r=await save();draft=r.draft;
  assert.equal(r.ok,true);assert.equal(r.authority_created,false);assert.equal(r.publicly_listed,false);
  assert.equal(draft.user_id,a);assert.equal(draft.revision,1);
  assert.match(r.payload_sha256,/^[0-9a-f]{64}$/);
  assert.equal((await db.query('select * from public.chlom_lex_events_v1')).rows.length,1);
});
test('other account sees no drafts or events and cannot update another owner',async()=>{
  await asUser(b);
  assert.equal((await db.query('select * from public.chlom_lex_drafts_v1')).rows.length,0);
  assert.equal((await db.query('select * from public.chlom_lex_events_v1')).rows.length,0);
  await assert.rejects(save({id:draft.id,revision:1}),/DRAFT_NOT_ACCESSIBLE/);
});
test('owner cannot bypass RPC or rewrite event history',async()=>{
  await asUser(a);
  await assert.rejects(db.query("update public.chlom_lex_drafts_v1 set revision=99"),e=>e.code==='42501');
  await assert.rejects(db.query('delete from public.chlom_lex_events_v1'),e=>e.code==='42501');
  await assert.rejects(db.query('truncate public.chlom_lex_events_v1'),e=>e.code==='42501');
});
test('stale revision and immutable kind fail without an event',async()=>{
  await assert.rejects(save({id:draft.id,revision:0}),/DRAFT_REVISION_CONFLICT/);
  await assert.rejects(save({id:draft.id,revision:1,kind:'license'}),/DRAFT_KIND_IMMUTABLE/);
  assert.equal((await db.query('select * from public.chlom_lex_events_v1')).rows.length,1);
});
test('null revision/kind, invalid payload and oversized text are rejected',async()=>{
  await assert.rejects(save({revision:null}),/INVALID_DRAFT/);
  await assert.rejects(save({kind:null}),/INVALID_DRAFT/);
  await assert.rejects(save({payload:[]}),/INVALID_DRAFT/);
  await assert.rejects(save({payload:{text:'x'.repeat(66000)}}),/INVALID_DRAFT/);
});
test('archive appends a new event preserving prior revision',async()=>{
  const r=await save({id:draft.id,revision:1,archive:true});
  assert.equal(r.draft.revision,2);assert.equal(r.draft.state,'ARCHIVED');
  const rows=(await db.query('select revision,event_type from public.chlom_lex_events_v1 order by revision')).rows;
  assert.deepEqual(rows,[{revision:1,event_type:'DRAFT_SAVED'},{revision:2,event_type:'ARCHIVED'}]);
});
test('unprovided canonical capabilities explicitly fail',async()=>{
  await assert.rejects(db.query('select public.chlom_lex_public_offers_v1()'),/CAPABILITY_NOT_INSTALLED/);
  await assert.rejects(db.query('select public.chlom_lex_request_review_v1($1,2)',[draft.id]),/CAPABILITY_NOT_INSTALLED/);
  await assert.rejects(db.query("select public.chlom_api_dispatch_v3('capabilities')"),/CAPABILITY_NOT_INSTALLED/);
});
test('per-account save limit rejects the 31st write',async()=>{
  for(let i=0;i<28;i++) await save({title:`Limit test ${i}`});
  await assert.rejects(save(),/WORKSPACE_RATE_LIMIT/);
  assert.equal((await db.query('select * from public.chlom_lex_events_v1')).rows.length,30);
});
test('bootstrap refuses existing installation without replacing objects',async()=>{
  await db.exec('reset role');
  await assert.rejects(db.exec(bootstrap),/EXISTING_CHLOM_INSTALLATION/);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::integer as n from public.chlom_lex_events_v1')).rows[0].n,30);
});
test.after(async()=>{await db.close();});
