# Original CHLOM Groth16 interoperability fixtures

Generated locally on 2026-09-20 from the original `product.circom` in this folder. The relation is `statement = left * right + context`, with private inputs `left` and `right` and public signals ordered `[statement, context]`. The main fixture uses `(3,7,21)` and yields `[42,21]`; the second uses `(0,7,0)` and yields `[0,0]`.

The tests exercise proof verification only. The tiny example, known inputs and insecure test-only ceremony are unsuitable for business claims or production privacy. No fixture is registered by default. The circuit source contains no private CrownThrive logic or third-party copied circuit.

Tools used in a separate scratch directory: `snarkjs@0.7.6`, `circom2@0.2.22` (Circom compiler 2.2.2). Those GPL tools are not runtime dependencies and their implementation is not copied into this repository. The retained files are the original circuit and its generated public mathematical outputs. Proving keys, witnesses and ceremony binaries are not shipped.

Generation procedure (new ceremony randomness produces different points with the same relation):

```sh
npx circom2 product.circom --r1cs --wasm --sym
npx snarkjs powersoftau new bn128 4 pot_0000.ptau
npx snarkjs powersoftau contribute pot_0000.ptau pot_0001.ptau --name=CHLOM-test-only -e=fixture-only-not-production
npx snarkjs powersoftau prepare phase2 pot_0001.ptau pot_final.ptau
npx snarkjs groth16 setup product.r1cs pot_final.ptau product_0000.zkey
npx snarkjs zkey contribute product_0000.zkey product_final.zkey --name=CHLOM-fixture -e=fixture-only-not-production-phase2
npx snarkjs zkey export verificationkey product_final.zkey verification_key.json
npx snarkjs groth16 fullprove input.json product_js/product.wasm product_final.zkey proof.json public.json
npx snarkjs groth16 verify verification_key.json public.json proof.json
```

`input.json` is `{"left":"3","right":"7","context":"21"}`. Repeat fullprove with `{"left":"0","right":"7","context":"0"}` for `proof-zero.json` and `public-zero.json`.

`non-subgroup-g2.json` is an on-curve BN254 twist point outside the prime-order subgroup, generated independently as the first square-root point for `x=(i,0)` from `i=0` upward satisfying `y²=x³+3/(9+i_unit)`. The curve library confirms its subgroup check rejects the point. It tests an adversarial condition, not a valid proof.

An independent local comparison ran snarkjs 0.7.6 and the CHLOM verifier against the same public outputs. `differential-results.json` records all seven matching results: valid fixture, changed statement, changed context, swapped proof A/C, off-curve point, wrong-subgroup point and valid zero-input fixture.
