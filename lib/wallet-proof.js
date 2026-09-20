import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {getAddress, verifyMessage} from 'ethers';

export const CHALLENGE_COOKIE = '__Host-chlom-wallet-challenge';
export const CHALLENGE_SECONDS = 300;
const PURPOSE = 'CHLOM wallet-control observation';

function fail(message, status=400) { return Object.assign(new Error(message), {status}); }
export function proofConfigured(env=process.env) {
  return typeof env.CHLOM_WALLET_CHALLENGE_SECRET === 'string' && Buffer.byteLength(env.CHLOM_WALLET_CHALLENGE_SECRET) >= 32;
}
function secret(env) {
  if (!proofConfigured(env)) throw fail('Wallet proof verification is not configured on this installation.',503);
  return env.CHLOM_WALLET_CHALLENGE_SECRET;
}
export function walletAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw fail('Choose a valid EVM wallet address.');
  return getAddress(value.toLowerCase());
}
export function walletChain(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,13}$/.test(value)) throw fail('The wallet returned an unsupported chain identifier.');
  const chain = Number(BigInt(value));
  if (!Number.isSafeInteger(chain) || chain < 1) throw fail('The wallet returned an unsupported chain identifier.');
  return '0x'+chain.toString(16);
}
export function proofMessage(challenge) {
  return [
    PURPOSE,
    '',
    `Origin: ${challenge.origin}`,
    `Address: ${challenge.address}`,
    `Chain ID: ${Number(BigInt(challenge.chain_id))}`,
    `Nonce: ${challenge.nonce}`,
    `Issued at: ${new Date(challenge.issued_at).toISOString()}`,
    `Expires at: ${new Date(challenge.expires_at).toISOString()}`,
    '',
    'Confirm wallet control for this browser observation only.',
    'This signature does not sign in, transfer funds, approve spending, grant rights, or create an entitlement.',
  ].join('\n');
}
function mac(payload, env) { return createHmac('sha256',secret(env)).update(payload).digest('base64url'); }
export function createChallenge({origin,address,chain_id},env=process.env,now=Date.now()) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw fail('A secure origin is required.');
  const challenge={version:1,purpose:PURPOSE,origin,address:walletAddress(address),chain_id:walletChain(chain_id),nonce:randomBytes(24).toString('hex'),issued_at:now,expires_at:now+CHALLENGE_SECONDS*1000};
  const payload=Buffer.from(JSON.stringify(challenge)).toString('base64url');
  return {challenge,message:proofMessage(challenge),cookie:`${payload}.${mac(payload,env)}`};
}
export function readChallenge(cookie,origin,env=process.env,now=Date.now()) {
  if (typeof cookie !== 'string' || cookie.length > 2048) throw fail('Request a new wallet challenge.',401);
  const [payload,signature,...extra]=cookie.split('.');
  if (extra.length || !payload || !signature) throw fail('Request a new wallet challenge.',401);
  const expected=Buffer.from(mac(payload,env));
  const actual=Buffer.from(signature);
  if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw fail('Request a new wallet challenge.',401);
  let challenge;
  try {challenge=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch {throw fail('Request a new wallet challenge.',401);}
  if (challenge.version!==1 || challenge.purpose!==PURPOSE || challenge.origin!==origin || !Number.isSafeInteger(challenge.issued_at) || !Number.isSafeInteger(challenge.expires_at) || challenge.issued_at>now || challenge.expires_at<=now || challenge.expires_at-challenge.issued_at!==CHALLENGE_SECONDS*1000 || !/^[0-9a-f]{48}$/.test(challenge.nonce)) throw fail('Wallet challenge expired or belongs to a different origin. Request a new challenge.',401);
  walletAddress(challenge.address);walletChain(challenge.chain_id);
  return challenge;
}
export function verifyChallenge(cookie,origin,signature,env=process.env,now=Date.now()) {
  const challenge=readChallenge(cookie,origin,env,now);
  if (typeof signature!=='string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw fail('Use a standard EVM message signature. Smart-contract wallet signatures are not supported by this verifier.');
  let recovered;
  try {recovered=verifyMessage(proofMessage(challenge),signature);}catch {throw fail('The wallet signature could not be verified.',401);}
  if (recovered.toLowerCase()!==challenge.address.toLowerCase()) throw fail('The signature does not match the selected wallet.',401);
  return {schema:'ct.chlom.wallet-control-observation.v1',address:challenge.address,chain_id:challenge.chain_id,origin:challenge.origin,verified_at:new Date(now).toISOString(),expires_at:new Date(challenge.expires_at).toISOString(),scope:'browser_observation_only',account_authenticated:false,account_binding_created:false,payment_authorized:false,rights_granted:false,one_time_nonce:false};
}
