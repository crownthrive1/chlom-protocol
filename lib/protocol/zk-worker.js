import { parentPort, workerData } from 'node:worker_threads';
import { bn254 } from '@noble/curves/bn254.js';

// Original CHLOM adapter for the Groth16 pairing equation (Groth, 2016/260).
// Curve arithmetic, subgroup checks and pairings are provided by noble-curves.
// This adapter has not undergone an independent security audit.
function g1(point) {
  const result = bn254.G1.Point.fromAffine({ x: BigInt(point[0]), y: BigInt(point[1]) });
  result.assertValidity();
  if (result.is0()) throw new Error('infinity');
  return result;
}
function g2(point) {
  // snarkjs JSON uses [real, imaginary] order, unlike EVM calldata ordering.
  const result = bn254.G2.Point.fromAffine({
    x: { c0: BigInt(point[0][0]), c1: BigInt(point[0][1]) },
    y: { c0: BigInt(point[1][0]), c1: BigInt(point[1][1]) },
  });
  result.assertValidity();
  if (result.is0()) throw new Error('infinity');
  return result;
}
function verify() {
  const { verificationKey: key, proof, publicSignals } = workerData;
  let alpha, beta, gamma, delta, coefficients;
  try {
    alpha = g1(key.vk_alpha_1); beta = g2(key.vk_beta_2);
    gamma = g2(key.vk_gamma_2); delta = g2(key.vk_delta_2);
    coefficients = key.IC.map(g1);
  } catch { return { kind: 'invalid-key' }; }
  let a, b, c;
  try { a = g1(proof.pi_a); b = g2(proof.pi_b); c = g1(proof.pi_c); }
  catch { return { kind: 'invalid-proof' }; }
  let publicPoint = coefficients[0];
  for (let index = 0; index < publicSignals.length; index++) {
    // Public scalars are nonsecret; this routine also accepts zero.
    publicPoint = publicPoint.add(coefficients[index + 1].multiplyUnsafe(BigInt(publicSignals[index])));
  }
  // e(A,B) = e(alpha,beta) * e(IC[0]+sum(signal[i]*IC[i+1]),gamma) * e(C,delta).
  const pairs = [{ g1: a.negate(), g2: b }, { g1: alpha, g2: beta }, { g1: c, g2: delta }];
  // Only this computed sum may be infinity, whose pairing is the neutral element.
  if (!publicPoint.is0()) pairs.push({ g1: publicPoint, g2: gamma });
  return { kind: 'result', valid: bn254.fields.Fp12.eql(bn254.pairingBatch(pairs), bn254.fields.Fp12.ONE) };
}
try { parentPort.postMessage(verify()); }
catch { parentPort.postMessage({ kind: 'failed' }); }
