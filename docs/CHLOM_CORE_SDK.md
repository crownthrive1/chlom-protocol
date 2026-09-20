# CHLOM core client and command line

The client in `sdk/core-client.mjs` connects to the CHLOM core dispatcher. It does not use the LEX application. It requires Node.js 24, an installed CHLOM core HTTPS origin, and a genuine backend user access token for operator requests. The backend retains authority, scope, idempotency, rate-limit and DAIL enforcement; possession of the SDK does not enroll an operator.

## Read public status

```sh
CHLOM_CORE_URL=https://your-core.example npm run core -- status
```

Local previews may use `http://127.0.0.1:3000`. Remote HTTP, URLs containing credentials, path prefixes, query strings and fragments are rejected. Redirects are rejected so an access token is not forwarded to a different destination.

## Authenticated integration

Supply `CHLOM_USER_ACCESS_TOKEN` through the integrating application's protected runtime environment. It must represent the intended user from the configured backend. Do not use a service-role key, embed a token in source, or place a token in a URL. The browser console manages its own separate HttpOnly session cookies; it never exports those tokens to the SDK.

```js
import { ChlomCoreClient } from './sdk/core-client.mjs';

const core = new ChlomCoreClient({
  baseUrl: process.env.CHLOM_CORE_URL,
  accessToken: process.env.CHLOM_USER_ACCESS_TOKEN,
});
const capabilities = await core.capabilities();
```

Only documented dispatcher actions are accepted. For mutations, supply an object payload matching the installed backend contract and a stable, unique idempotency key for that logical operation. Retrying the same operation uses the same key and same payload. Changing the payload requires a new operation and key. Do not reuse an example key in production.

```js
const receipt = await core.dispatch('report_oracle_signal', signalPayload, {
  idempotencyKey: operationId,
});
```

The equivalent command reads a JSON file, avoiding private payloads in shell arguments:

```sh
npm run core -- capabilities
npm run core -- dispatch report_oracle_signal signal.json YOUR_STABLE_OPERATION_ID
```

The payload limit is 64 KiB. Responses are capped at 2 MiB and requests time out after 15 seconds. The client never retries a mutation automatically. Transport, authorization and JSON failures are errors, not successful receipts. Error messages avoid echoing upstream response bodies or credentials. The CLI prints the authorized result to stdout; route it to an appropriately protected destination when it includes private operator records.

## Contract and scope

The action allowlist covers status, capabilities, asset binding, ownership-interest records, rights instruments, DLA versions, optional LEX offers, agreement/entitlement records, obligations, revenue-policy records, settlement previews, token candidates, oracle signals and DAIL proof binding. The optional LEX offer action is one consumer operation inside the wider core protocol.

The installed dispatcher decides which actions the user can perform and what evidence each action requires. A settlement preview cannot move money. A token candidate is not a mint. A record or proof receipt does not independently adjudicate legal title. Native validator operation, token issuance, settlement, and approved production ZK circuits retain their separate implementation and activation requirements.
