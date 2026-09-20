pragma circom 2.2.2;

// CHLOM verifier interoperability fixture only. No business or ownership claim.
template PrivateProduct() {
    signal input left;
    signal input right;
    signal input context;
    signal output statement;
    statement <== left * right + context;
}
component main {public [context]} = PrivateProduct();
