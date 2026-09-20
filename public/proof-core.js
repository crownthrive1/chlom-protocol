const encoder = new TextEncoder();
export const SCHEMA = 'ct.chlom.protocol.salted-commitment.v1';
const HEX = /^[a-f0-9]{64}$/;
const SALT = /^[A-Za-z0-9_-]{43}$/;
export async function digestBytes(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2,'0')).join('');
}
function decodeHex(value) {
  if (typeof value !== 'string' || !HEX.test(value)) throw new Error('Expected a lowercase SHA-256 digest.');
  return Uint8Array.from(value.match(/../g), x => parseInt(x,16));
}
function encodeSalt(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function decodeSalt(value) {
  if (typeof value !== 'string' || !SALT.test(value)) throw new Error('The private opening has an invalid salt.');
  const bytes = Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='), x=>x.charCodeAt(0));
  if (bytes.length !== 32 || encodeSalt(bytes) !== value) throw new Error('The private opening has an invalid salt.');
  return bytes;
}
export async function commitmentFor(evidenceDigest, contextDigest, salt) {
  const prefix = encoder.encode('CHLOM:salted-evidence-commitment:v1');
  const input = new Uint8Array(prefix.length+1+96);
  input.set(prefix); input.set(decodeHex(contextDigest),prefix.length+1);
  input.set(decodeSalt(salt),prefix.length+33); input.set(decodeHex(evidenceDigest),prefix.length+65);
  return digestBytes(input);
}
export async function createFileCommitment(bytes) {
  const evidenceDigest = await digestBytes(bytes);
  const contextDigest = await digestBytes(encoder.encode('ct.chlom.file-evidence.v1'));
  const salt = encodeSalt(crypto.getRandomValues(new Uint8Array(32)));
  return {
    publicCommitment:{schema:SCHEMA,algorithm:'SHA-256',contextDigest,commitment:await commitmentFor(evidenceDigest,contextDigest,salt)},
    privateOpening:{evidenceDigest,salt},
  };
}
export async function verifyFileCommitment(bytes, opening) {
  const pub=opening?.publicCommitment, priv=opening?.privateOpening;
  if (pub?.schema!==SCHEMA || pub?.algorithm!=='SHA-256' || !priv) throw new Error('Use the complete private opening downloaded by CHLOM.');
  decodeHex(pub.commitment);
  const expected=await commitmentFor(priv.evidenceDigest,pub.contextDigest,priv.salt);
  return expected===pub.commitment && await digestBytes(bytes)===priv.evidenceDigest;
}
