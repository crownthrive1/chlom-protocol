import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFileCommitment, verifyFileCommitment, commitmentFor } from '../public/proof-core.js';
test('browser commitment matches independent byte encoding and detects changed files', async()=>{
 const bytes=new TextEncoder().encode('private evidence');const output=await createFileCommitment(bytes);
 const {publicCommitment:p,privateOpening:o}=output;
 const independent=createHash('sha256').update(Buffer.concat([Buffer.from('CHLOM:salted-evidence-commitment:v1'),Buffer.from([0]),Buffer.from(p.contextDigest,'hex'),Buffer.from(o.salt,'base64url'),Buffer.from(o.evidenceDigest,'hex')])).digest('hex');
 assert.equal(p.commitment,independent);assert.equal(await verifyFileCommitment(bytes,output),true);
 assert.equal(await verifyFileCommitment(new TextEncoder().encode('changed'),output),false);
 assert.notEqual((await createFileCommitment(bytes)).publicCommitment.commitment,p.commitment);
 assert.equal(JSON.stringify(p).includes(o.evidenceDigest),false);assert.equal(JSON.stringify(p).includes(o.salt),false);
});
test('opening tampering and invalid encoding fail closed',async()=>{
 const bytes=new Uint8Array([1,2,3]);const output=await createFileCommitment(bytes);
 const tampered=structuredClone(output);tampered.privateOpening.salt='A'.repeat(43);
 assert.equal(await verifyFileCommitment(bytes,tampered),false);
 await assert.rejects(commitmentFor('0'.repeat(64),'0'.repeat(64),'!'.repeat(43)));
 await assert.rejects(verifyFileCommitment(bytes,{publicCommitment:{schema:'wrong'}}));
});
