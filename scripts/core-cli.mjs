import { readFile } from 'node:fs/promises';
import { ChlomCoreClient } from '../sdk/core-client.mjs';

const [command = 'status', action, payloadFile, idempotencyKey] = process.argv.slice(2);
try {
  const client = new ChlomCoreClient({ baseUrl: process.env.CHLOM_CORE_URL || 'http://127.0.0.1:3000', accessToken: process.env.CHLOM_USER_ACCESS_TOKEN });
  let result;
  if (command === 'status') result = await client.status();
  else if (command === 'capabilities') result = await client.capabilities();
  else if (command === 'dispatch' && action && payloadFile && idempotencyKey) {
    const file = await readFile(payloadFile);
    if (file.length > 64 * 1024) throw new Error('Payload file exceeds 64 KiB.');
    result = await client.dispatch(action, JSON.parse(file.toString('utf8')), { idempotencyKey });
  } else throw new Error('Usage: npm run core -- status | capabilities | dispatch ACTION PAYLOAD.json IDEMPOTENCY_KEY');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.name === 'ChlomCoreError' ? error.message : 'Invalid command or payload file. Use a bounded JSON object and the documented core command.');
  process.exitCode = 1;
}
