import { ethers } from "hardhat";
import { expect } from "chai";
import * as snarkjs from "snarkjs";
import { MerkleTree } from "fixed-merkle-tree";
import { poseidon2, poseidon4 } from "poseidon-lite";
import * as path from "path";

const TREE_LEVELS = 20;

describe("BountyClaimVerifier", function () {
  let verifier: any;
  let signers: any;

  // Helper function to generate valid proof (same logic as Circuit.ts)
  async function generateProof(secret0: bigint, secret1: bigint, impactType: bigint, severity: bigint) {
    // Calculate commitment: H(secret[0], secret[1], impactType, severity)
    const commitment = poseidon4([secret0, secret1, impactType, severity]) as any;

    // Create sparse Merkle tree
    const leaves = [commitment];
    const tree = new MerkleTree(TREE_LEVELS, leaves, {
      hashFunction: ((a: bigint, b: bigint) => poseidon2([a, b])) as any,
      zeroElement: 0n as any
    });

    const { pathElements, pathIndices, pathRoot } = tree.proof(commitment);

    // Prepare circuit inputs
    const circuitInput = {
      root: pathRoot.toString(),
      nullifier: commitment.toString(),
      secret: [secret0.toString(), secret1.toString()],
      impactType: impactType.toString(),
      severity: severity.toString(),
      pathElements: pathElements.map((x: any) => x.toString()),
      pathIndices: pathIndices.map((x: any) => x.toString())
    };

    // Generate proof
    const wasmPath = path.join(process.cwd(), 'circuit/proof-source/bountyClaim_js/bountyClaim.wasm');
    const zkeyPath = path.join(process.cwd(), 'circuit/proof-source/bountyClaim.zkey');
    
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

    // Parse proof for Solidity verifier format
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const parsed = JSON.parse(`[${calldata}]`);

    return {
      pA: parsed[0],
      pB: parsed[1],
      pC: parsed[2],
      publicSignals: parsed[3],
      root: pathRoot,
      nullifier: commitment
    };
  }

  before(async () => {
    signers = await ethers.getSigners();

    const BountyClaimVerifier = await ethers.getContractFactory("BountyClaimVerifier");
    verifier = await BountyClaimVerifier.deploy();
    await verifier.waitForDeployment();

    console.log("  BountyClaimVerifier deployed to:", await verifier.getAddress());
  });

  it("should verify a valid proof", async function () {
    // Generate random secrets
    const secret0 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const secret1 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const impactType = 1n; // Low
    const severity = 2n;   // High

    console.log("  Generating proof...");
    const { pA, pB, pC, publicSignals, root, nullifier } = await generateProof(
      secret0,
      secret1,
      impactType,
      severity
    );

    console.log("  Root:", root.toString());
    console.log("  Nullifier:", nullifier.toString());

    // Call verifier contract
    const isValid = await verifier.verifyProof(pA, pB, pC, publicSignals);

    expect(isValid).to.be.true;
    console.log("  ✅ Proof verified on-chain!");
  });

  it("should reject proof with wrong public signals", async function () {
    // Generate valid proof
    const secret0 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const secret1 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const impactType = 1n;
    const severity = 2n;

    const { pA, pB, pC, publicSignals } = await generateProof(
      secret0,
      secret1,
      impactType,
      severity
    );

    // Tamper with public signals
    const tamperedSignals = [
      "0x0000000000000000000000000000000000000000000000000000000000000001", // Wrong root
      publicSignals[1] // Keep nullifier
    ];

    // Should reject
    const isValid = await verifier.verifyProof(pA, pB, pC, tamperedSignals);

    expect(isValid).to.be.false;
    console.log("  ✅ Invalid proof correctly rejected!");
  });

  it("should verify multiple different proofs", async function () {
    for (let i = 0; i < 3; i++) {
      const secret0 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
      const secret1 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
      const impactType = BigInt(i % 4); // Rotate through impact types
      const severity = BigInt((i + 1) % 4); // Rotate through severities

      const { pA, pB, pC, publicSignals } = await generateProof(
        secret0,
        secret1,
        impactType,
        severity
      );

      const isValid = await verifier.verifyProof(pA, pB, pC, publicSignals);
      expect(isValid).to.be.true;
      console.log(`  ✅ Proof ${i + 1}/3 verified`);
    }
  });
});
