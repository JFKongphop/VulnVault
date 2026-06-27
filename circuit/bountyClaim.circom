pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

template MerkleTreeInclusionProof(levels) {
  signal input leaf;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal output root;

  signal intermediates[levels + 1];
  intermediates[0] <== leaf;

  component hashes[levels];
  component selectorsLeft[levels];
  component selectorsRight[levels];

  for (var i = 0; i < levels; i++) {
    hashes[i] = Poseidon(2);

    selectorsLeft[i] = Selector();
    selectorsRight[i] = Selector();

    selectorsLeft[i].in[0] <== intermediates[i];
    selectorsLeft[i].in[1] <== pathElements[i];
    selectorsLeft[i].sel <== pathIndices[i];

    selectorsRight[i].in[0] <== pathElements[i];
    selectorsRight[i].in[1] <== intermediates[i];
    selectorsRight[i].sel <== pathIndices[i];

    hashes[i].inputs[0] <== selectorsLeft[i].out;
    hashes[i].inputs[1] <== selectorsRight[i].out;

    intermediates[i + 1] <== hashes[i].out;
  }

  root <== intermediates[levels];
}

template Selector() {
  signal input in[2];
  signal input sel;
  signal output out;

  sel * (1 - sel) === 0;

  signal selNot;
  selNot <== 1 - sel;

  signal left;
  signal right;

  left <== in[0] * selNot;
  right <== in[1] * sel;

  out <== left + right;
}

template BountyClaim(N) {
  signal input root;
  signal input nullifier;

  signal input secret[2];
  signal input impactType;
  signal input severity;
  signal input pathElements[N];
  signal input pathIndices[N];

  component commitmentHash = Poseidon(4);
  commitmentHash.inputs[0] <== secret[0];
  commitmentHash.inputs[1] <== secret[1];
  commitmentHash.inputs[2] <== impactType;
  commitmentHash.inputs[3] <== severity;
  
  nullifier === commitmentHash.out;

  component merkle = MerkleTreeInclusionProof(N);
  merkle.leaf <== commitmentHash.out;

  for (var i = 0; i < N; i++) {
    merkle.pathElements[i] <== pathElements[i];
    merkle.pathIndices[i] <== pathIndices[i];
  }

  root === merkle.root;
}

component main {public [root, nullifier]} = BountyClaim(20);