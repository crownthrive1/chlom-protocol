# Signed RPC acceptance: CHLOM native 1.4.0

This isolated harness signs real Substrate extrinsics, waits for finalized blocks,
checks dispatch events, and reads the resulting storage through JSON-RPC. It uses
the public Alice/Bob development identities and explicitly synthetic hashes. It
does not load wallet secrets or accept production endpoints.

The SDK dependency is exactly `@polkadot/api` 16.5.6, with transitive versions and
integrity hashes committed in this directory's lockfile. It is separate from the
application dependencies and is not needed to run the Rust node binary. The
package is Apache-2.0; transitive dependency licenses remain applicable.

From this directory, with Node.js 22 or newer and a built CHLOM binary:

```sh
npm ci --ignore-scripts
npm test
npm run node -- --binary ../../../substrate/chlom-l1/target/release/chlom-node --output /tmp/chlom-signed-rpc.json
```

The wrapper starts `chlom-node --dev --tmp` itself, binds RPC and peer listening
to loopback, disables public peer discovery/telemetry, and shuts it down after the
test. Use an absolute binary path when Cargo's target directory was overridden.
```sh
npm run node -- --binary /absolute/repository/substrate/chlom-l1/target/release/chlom-node --output /tmp/chlom-signed-rpc.json
```

To use an already-running **fresh disposable** development node:

```sh
npm run acceptance -- --rpc ws://127.0.0.1:9944 --output /tmp/chlom-signed-rpc.json
```

Direct mode accepts only literal `127.0.0.1` or `::1` WebSocket endpoints, verifies
the CHLOM Development chain, runtime identity, neutral UNIT denomination, Alice
sudo, empty utility history and absent Bob utility grant before signing. A used
test chain must be restarted with fresh state. The harness will not reset it.

The finalized flow verifies:

1. Bob's signed allocation fails with `BadOrigin` before authority exists.
2. Alice's signed Sudo call creates the exact account-bound D3 utility grant.
3. Bob's signed allocation succeeds; replay does not double-credit.
4. Bob approves a future-effective synthetic service and reserves resource units.
5. Alice cannot consume Bob's reservation; Bob can consume it once, with safe replay.
6. Bob reserves and releases more units; accounting conserves allocated units.
7. Alice revokes the grant; Bob's next allocation fails again.
8. Five immutable receipts form the expected hash chain and match storage totals.

The JSON receipt records all finalized transaction and block hashes, event names,
expected dispatch failures, authority identifiers, final balance and receipt chain.
Wrapper mode also binds the evidence to the tested executable's SHA-256. Runtime
Wasm is separately fingerprinted from actual chain storage. Node logs are kept
beside the receipt. A failed test exits nonzero and does not write a PASS receipt.

Upstream API references:

- [Transaction signing](https://polkadot.js.org/docs/api/start/api.tx/)
- [Keyring and development identities](https://polkadot.js.org/docs/api/start/keyring/)
- [Finalization and dispatch events](https://polkadot.js.org/docs/api/start/api.tx.subs/)
