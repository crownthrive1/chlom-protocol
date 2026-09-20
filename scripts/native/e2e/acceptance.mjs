import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loopbackEndpoint, options } from './guard.mjs';

// Validate before loading the network client or constructing any signer.
const args = options(process.argv.slice(2), ['--rpc', '--output']);
assert.ok(args['--rpc'], 'Supply --rpc ws://127.0.0.1:<port> for an isolated --dev node');
const endpoint = loopbackEndpoint(args['--rpc']);
const { ApiPromise, Keyring, WsProvider } = await import('@polkadot/api');
const provider = new WsProvider(endpoint, 1_000, {}, 20_000);
const api = new ApiPromise({
  provider, throwOnConnect: true,
  // The pinned SDK AuthorizeCall extension encodes only PhantomData and has
  // Implicit = (); declare its empty signed payload instead of guessing fields.
  signedExtensions: { AuthorizeCall: { extrinsic: {}, payload: {} } },
});
const report = { schema: 'chlom.native.rpc-acceptance.v1', fixture: 'synthetic-development-only', steps: [] };
const overallTimer = setTimeout(() => {
  console.error('CHLOM signed RPC acceptance exceeded its six-minute deadline');
  process.exit(1);
}, 360_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dispatchName(error) {
  if (error.isModule) {
    const meta = api.registry.findMetaError(error.asModule);
    return `${meta.section}.${meta.name}`;
  }
  return error.toString();
}

async function submit(label, call, signer, expectedError = null, expectedEvent = null) {
  const result = await new Promise((resolve, reject) => {
    let unsubscribe;
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe?.();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`${label}: no finalized result after 60 seconds`)), 60_000);
    call.signAndSend(signer, { nonce: -1 }, (result) => {
      if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped || result.status.isFinalityTimeout) {
        finish(new Error(`${label}: terminal transaction status ${result.status.type}`));
      } else if (result.status.isFinalized) {
        finish(null, result);
      }
    }).then((unsub) => {
      unsubscribe = unsub;
      if (finished) unsubscribe();
    }).catch((error) => finish(error));
  });
  const failedEvent = result.events.find(({ event }) => event.section === 'system' && event.method === 'ExtrinsicFailed');
  const dispatchError = result.dispatchError ?? failedEvent?.event.data[0];
  const actualError = dispatchError ? dispatchName(dispatchError) : null;
  assert.equal(actualError, expectedError, `${label}: dispatch result`);
  const events = result.events.map(({ event }) => `${event.section}.${event.method}`);
  assert.ok(events.includes(expectedError ? 'system.ExtrinsicFailed' : 'system.ExtrinsicSuccess'), `${label}: system result event`);
  if (expectedEvent) assert.ok(events.includes(expectedEvent), `${label}: expected ${expectedEvent}`);
  for (const { event } of result.events) {
    if (event.section === 'sudo' && event.method === 'Sudid') {
      assert.ok(event.data[0].isOk, `${label}: sudo inner dispatch failed`);
    }
  }
  const blockHash = result.status.asFinalized.toHex();
  const block = await api.rpc.chain.getHeader(blockHash);
  report.steps.push({ label, signer: signer.address, transactionHash: result.txHash.toHex(), blockHash, blockNumber: block.number.toString(), expectedDispatchError: expectedError, events });
  console.error(`PASS ${label} (finalized block ${block.number})`);
}

async function balanceFor(account, resource, expected) {
  const value = await api.query.chlomUtility.balances(account, resource);
  const result = Object.fromEntries(['allocated', 'available', 'reserved', 'consumed'].map((name) => [name, value[name].toString()]));
  assert.deepEqual(result, expected);
  return result;
}

try {
  if (args['--output']) await writeFile(resolve(args['--output']), `${JSON.stringify({ ...report, status: 'RUNNING' }, null, 2)}\n`, { mode: 0o600 });
  await Promise.race([api.isReadyOrError, sleep(25_000).then(() => { throw new Error('Local RPC did not initialize'); })]);
  const [name, type, properties, version] = await Promise.all([
    api.rpc.system.chain(), api.rpc.system.chainType(), api.rpc.system.properties(), api.rpc.system.version(),
  ]);
  assert.equal(name.toString(), 'CHLOM Development', 'Only the built-in disposable development preset is accepted');
  assert.equal(type.toString(), 'Development');
  assert.equal(api.runtimeVersion.specName.toString(), 'chlom-runtime');
  assert.equal(properties.tokenSymbol.unwrap()[0].toString(), 'UNIT');
  const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
  const alice = keyring.addFromUri('//Alice', { name: 'CHLOM synthetic development Alice' });
  const bob = keyring.addFromUri('//Bob', { name: 'CHLOM synthetic development Bob' });
  assert.ok((await api.query.sudo.key()).unwrap().eq(alice.publicKey), 'Built-in Alice sudo is required');
  assert.equal((await api.query.chlomUtility.receiptCount()).toString(), '0', 'Use a fresh --tmp node; existing utility history is forbidden');

  const hash = (value) => api.registry.hash(value).toHex();
  const synthetic = (name) => hash(Buffer.from(`CHLOM:SYNTHETIC:RPC-ACCEPTANCE:v1:${name}`));
  // Rust encodes (&[u8; N], AccountId32) as the fixed domain bytes followed by the
  // account's 32 bytes, with no SCALE compact length prefix on either fixed array.
  const subject = hash(Buffer.concat([Buffer.from('CHLOM:runtime-account:v1'), Buffer.from(bob.publicKey)]));
  const utilityRole = hash(Buffer.from('CHLOM:role:utility:v1'));
  const grantKey = { subjectId: subject, roleId: utilityRole };
  assert.ok((await api.query.chlomAuthority.grantHeads(grantKey)).isNone, 'Bob must begin without a utility grant');
  const id = Object.fromEntries(['resource', 'allocation', 'approval', 'service', 'reserve', 'consume', 'foreign-consume', 'reserve-release', 'release', 'grant', 'revoke', 'revoked-allocation'].map((name) => [name, synthetic(name)]));
  const allocated = { allocated: '100', available: '100', reserved: '0', consumed: '0' };
  const finalBalance = { allocated: '100', available: '79', reserved: '0', consumed: '21' };
  const allocation = () => api.tx.chlomUtility.allocate(id.allocation, bob.address, id.resource, 100, id.approval);

  await submit('unauthorized signed allocation rejected', allocation(), bob, 'BadOrigin');
  await balanceFor(bob.address, id.resource, { allocated: '0', available: '0', reserved: '0', consumed: '0' });
  assert.equal((await api.query.chlomUtility.receiptCount()).toString(), '0');

  const head = (await api.rpc.chain.getHeader()).number.toNumber();
  await submit('Alice sudo grants Bob the exact D3 utility role', api.tx.sudo.sudo(api.tx.chlomAuthority.recordGrantVersion(subject, utilityRole, 1, 'D3', true, head + 100, null, id.grant)), alice, null, 'chlomAuthority.AuthorityVersionRecorded');
  const grant = (await api.query.chlomAuthority.grantVersions(grantKey, 1)).unwrap();
  assert.equal(grant.class.toString(), 'D3');
  assert.ok(grant.active.isTrue);
  assert.equal((await api.query.chlomAuthority.grantHeads(grantKey)).unwrap().toString(), '1');

  await submit('authorized Bob allocation succeeds', allocation(), bob, null, 'chlomUtility.ResourceOperation');
  await balanceFor(bob.address, id.resource, allocated);
  await submit('allocation replay does not double-credit', allocation(), bob);
  await balanceFor(bob.address, id.resource, allocated);
  assert.equal((await api.query.chlomUtility.receiptCount()).toString(), '1');

  const effectiveFrom = (await api.rpc.chain.getHeader()).number.toNumber() + 3;
  await submit('Bob approves a synthetic metered service', api.tx.chlomUtility.approveService(id.service, 1, id.resource, 7, effectiveFrom, effectiveFrom + 100, id.approval), bob, null, 'chlomUtility.ServiceApproved');
  while ((await api.rpc.chain.getHeader()).number.toNumber() < effectiveFrom) await sleep(500);
  await submit('resource owner reserves three actions', api.tx.chlomUtility.reserve(id.reserve, id.service, 1, 3), bob, null, 'chlomUtility.ResourceOperation');
  await balanceFor(bob.address, id.resource, { allocated: '100', available: '79', reserved: '21', consumed: '0' });

  await submit('Alice cannot consume Bob reservation', api.tx.chlomUtility.consume(id['foreign-consume'], id.reserve), alice, 'chlomUtility.ReservationMissing');
  await submit('resource owner consumes reserved units', api.tx.chlomUtility.consume(id.consume, id.reserve), bob, null, 'chlomUtility.ResourceOperation');
  await submit('consumption replay does not double-spend', api.tx.chlomUtility.consume(id.consume, id.reserve), bob);
  await balanceFor(bob.address, id.resource, finalBalance);
  assert.equal((await api.query.chlomUtility.receiptCount()).toString(), '3');

  await submit('resource owner creates another reservation', api.tx.chlomUtility.reserve(id['reserve-release'], id.service, 1, 2), bob, null, 'chlomUtility.ResourceOperation');
  await balanceFor(bob.address, id.resource, { allocated: '100', available: '65', reserved: '14', consumed: '21' });
  await submit('resource owner releases unconsumed units', api.tx.chlomUtility.release(id.release, id['reserve-release']), bob, null, 'chlomUtility.ResourceOperation');
  report.finalBalance = await balanceFor(bob.address, id.resource, finalBalance);

  await submit('Alice revokes the exact utility authority grant', api.tx.sudo.sudo(api.tx.chlomAuthority.recordGrantVersion(subject, utilityRole, 2, 'D3', false, null, id.grant, id.revoke)), alice, null, 'chlomAuthority.AuthorityVersionRecorded');
  await submit('revoked Bob cannot allocate', api.tx.chlomUtility.allocate(id['revoked-allocation'], bob.address, id.resource, 1, id.approval), bob, 'BadOrigin');
  await balanceFor(bob.address, id.resource, finalBalance);
  assert.ok((await api.query.chlomAuthority.grantVersions(grantKey, 2)).unwrap().active.isFalse);

  report.receiptChain = [];
  let previousHash = `0x${'00'.repeat(32)}`;
  for (const [index, operation] of ['allocation', 'reserve', 'consume', 'reserve-release', 'release'].entries()) {
    const receipt = (await api.query.chlomUtility.receipts(bob.address, id[operation])).unwrap();
    assert.equal(receipt.sequence.toString(), String(index + 1));
    assert.equal(receipt.previousHash.toHex(), previousHash);
    assert.equal(receipt.resourceId.toHex(), id.resource);
    previousHash = receipt.receiptHash.toHex();
    report.receiptChain.push({ operation, operationId: id[operation], sequence: receipt.sequence.toString(), receiptHash: previousHash, previousHash: receipt.previousHash.toHex() });
  }
  assert.equal((await api.query.chlomUtility.receiptCount()).toString(), '5');
  assert.equal((await api.query.chlomUtility.receiptHead()).toHex(), previousHash);
  assert.equal((await api.query.chlomUtility.reservationClosures(bob.address, id.reserve)).unwrap().toHex(), id.consume);
  assert.equal((await api.query.chlomUtility.reservationClosures(bob.address, id['reserve-release'])).unwrap().toHex(), id.release);

  const runtimeCode = (await api.rpc.state.getStorage('0x3a636f6465')).unwrap();
  Object.assign(report, {
    status: 'PASS', completedAt: new Date().toISOString(), endpoint, chain: name.toString(),
    nodeVersion: version.toString(), runtimeSpecName: api.runtimeVersion.specName.toString(),
    runtimeSpecVersion: api.runtimeVersion.specVersion.toString(), genesisHash: api.genesisHash.toHex(),
    runtimeCodeBlake2b256: hash(runtimeCode.toU8a(true)), authoritySubject: subject, utilityRole,
    signedTransactionCount: report.steps.length, receiptCount: '5',
    limits: ['Synthetic disposable development network only', 'Does not activate production rights, tokens or payments'],
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args['--output']) await writeFile(resolve(args['--output']), json, { mode: 0o600 });
  process.stdout.write(json);
} catch (error) {
  Object.assign(report, { status: 'FAIL', completedAt: new Date().toISOString(), error: error.message });
  if (args['--output']) await writeFile(resolve(args['--output']), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  throw error;
} finally {
  clearTimeout(overallTimer);
  await api.disconnect();
}
