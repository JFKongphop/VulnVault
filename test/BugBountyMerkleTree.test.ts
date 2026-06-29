import { ethers } from "hardhat";
import { expect } from "chai";
import { MerkleTree } from "fixed-merkle-tree";
import { poseidon2 } from "poseidon-lite";

describe("BugBountyMerkleTree", function () {
  let signers: any;
  let merkleTree: any;
  let owner: any, authorized: any, unauthorized: any;

  beforeEach(async function () {
    signers = await ethers.getSigners();
    [owner, authorized, unauthorized] = signers;

    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();

    merkleTree = await (
      await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() },
      })
    ).deploy();
    await merkleTree.waitForDeployment();
  });

  describe("Authorization", function () {
    it("owner can authorize addresses", async () => {
      await expect(merkleTree.authorise(authorized.address))
        .to.emit(merkleTree, "Authorised")
        .withArgs(authorized.address);

      expect(await merkleTree.authorised(authorized.address)).to.be.true;
    });

    it("owner can deauthorize addresses", async () => {
      await merkleTree.authorise(authorized.address);
      expect(await merkleTree.authorised(authorized.address)).to.be.true;

      await expect(merkleTree.deauthorise(authorized.address))
        .to.emit(merkleTree, "Deauthorised")
        .withArgs(authorized.address);

      expect(await merkleTree.authorised(authorized.address)).to.be.false;
    });

    it("non-owner cannot authorize", async () => {
      await expect(
        merkleTree.connect(unauthorized).authorise(authorized.address),
      ).to.be.revertedWith("Not owner");
    });

    it("non-owner cannot deauthorize", async () => {
      await merkleTree.authorise(authorized.address);
      await expect(
        merkleTree.connect(unauthorized).deauthorise(authorized.address),
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Field Reduction Bug Fix", function () {
    it("commitments() correctly finds commitments that exceed BN254 field", async () => {
      // Authorize owner to insert commitments
      await merkleTree.authorise(owner.address);

      // Create a large commitment that exceeds BN254 field
      // BN254 field = 21888242871839275222246405745257275088548364400416034343698204186575808495617
      const largeCommitment =
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

      // Insert the commitment
      await merkleTree.insertCommitment(largeCommitment);

      // Check that commitments() returns true for the ORIGINAL value
      // This verifies the fix: commitments() now reduces the input before lookup
      expect(await merkleTree.commitments(largeCommitment)).to.be.true;
    });

    it("commitments() returns false for non-inserted commitments", async () => {
      const nonExistentCommitment = ethers.keccak256(
        ethers.toUtf8Bytes("never-inserted"),
      );

      expect(await merkleTree.commitments(nonExistentCommitment)).to.be.false;
    });

    it("commitments() works for values within BN254 field", async () => {
      await merkleTree.authorise(owner.address);

      // Small commitment well within field
      const smallCommitment = ethers.keccak256(
        ethers.toUtf8Bytes("small-commitment"),
      );

      await merkleTree.insertCommitment(smallCommitment);

      expect(await merkleTree.commitments(smallCommitment)).to.be.true;
    });
  });

  describe("Access Control", function () {
    it("only authorized addresses can insert commitments", async () => {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await expect(
        merkleTree.connect(unauthorized).insertCommitment(commitment),
      ).to.be.revertedWith("Not authorised");

      // Authorize and try again
      await merkleTree.authorise(authorized.address);
      await expect(merkleTree.connect(authorized).insertCommitment(commitment))
        .to.not.be.reverted;
    });

    it("only authorized addresses can insert approved leaves", async () => {
      const leaf = ethers.keccak256(ethers.toUtf8Bytes("test-leaf"));

      await expect(
        merkleTree.connect(unauthorized).insertApprovedLeaf(leaf),
      ).to.be.revertedWith("Not authorised");

      // Authorize and try again
      await merkleTree.authorise(authorized.address);
      await expect(merkleTree.connect(authorized).insertApprovedLeaf(leaf)).to
        .not.be.reverted;
    });

    it("owner can always insert without explicit authorization", async () => {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("owner-commit"));
      const leaf = ethers.keccak256(ethers.toUtf8Bytes("owner-leaf"));

      await expect(merkleTree.insertCommitment(commitment)).to.not.be.reverted;
      await expect(merkleTree.insertApprovedLeaf(leaf)).to.not.be.reverted;
    });

    it("deauthorized addresses cannot insert", async () => {
      await merkleTree.authorise(authorized.address);

      const commitment1 = ethers.keccak256(ethers.toUtf8Bytes("test1"));
      await expect(merkleTree.connect(authorized).insertCommitment(commitment1))
        .to.not.be.reverted;

      // Deauthorize
      await merkleTree.deauthorise(authorized.address);

      // Should now fail
      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("test2"));
      await expect(
        merkleTree.connect(authorized).insertCommitment(commitment2),
      ).to.be.revertedWith("Not authorised");
    });
  });

  describe("Merkle Tree Operations", function () {
    beforeEach(async () => {
      await merkleTree.authorise(owner.address);
    });

    it("inserting commitments increments nextIndex", async () => {
      expect(await merkleTree.nextIndex()).to.equal(0);

      const commitment1 = ethers.keccak256(ethers.toUtf8Bytes("commit1"));
      await merkleTree.insertCommitment(commitment1);

      expect(await merkleTree.nextIndex()).to.equal(1);

      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("commit2"));
      await merkleTree.insertCommitment(commitment2);

      expect(await merkleTree.nextIndex()).to.equal(2);
    });

    it("inserting approved leaves increments nextIndex", async () => {
      const leaf1 = ethers.keccak256(ethers.toUtf8Bytes("leaf1"));
      await merkleTree.insertApprovedLeaf(leaf1);

      expect(await merkleTree.nextIndex()).to.equal(1);
    });

    it("maintains root history", async () => {
      const initialRoot = await merkleTree.getRoot();

      const leaf1 = ethers.keccak256(ethers.toUtf8Bytes("leaf1"));
      await merkleTree.insertApprovedLeaf(leaf1);

      const root1 = await merkleTree.getRoot();
      expect(root1).to.not.equal(initialRoot);
      expect(await merkleTree.isKnownRoot(root1)).to.be.true;

      const leaf2 = ethers.keccak256(ethers.toUtf8Bytes("leaf2"));
      await merkleTree.insertApprovedLeaf(leaf2);

      const root2 = await merkleTree.getRoot();
      expect(root2).to.not.equal(root1);

      // Both roots should be known
      expect(await merkleTree.isKnownRoot(root1)).to.be.true;
      expect(await merkleTree.isKnownRoot(root2)).to.be.true;
    });
  });

  describe("Root Verification with fixed-merkle-tree", function () {
    beforeEach(async () => {
      await merkleTree.authorise(owner.address);
    });

    // Helper to convert BigInt to hex string padded to 32 bytes
    const toHex = (num: bigint) => "0x" + num.toString(16).padStart(64, "0");

    // Helper to reduce value to BN254 field
    const FIELD =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const toField = (value: bigint) => value % FIELD;

    it("contract root matches fixed-merkle-tree for single leaf", async () => {
      // Create commitment and reduce to field
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commit"));
      const commitmentBigInt = BigInt(commitment);
      const fieldCommitment = toField(commitmentBigInt);

      // Insert into contract
      await merkleTree.insertCommitment(commitment);
      const contractRoot = await merkleTree.getRoot();

      // Build reference tree with fixed-merkle-tree
      const referenceTree = new MerkleTree(20, [], {
        hashFunction: (left, right) =>
          poseidon2([BigInt(left), BigInt(right)]).toString(),
        zeroElement: "0",
      });

      referenceTree.insert(fieldCommitment.toString());
      const referenceRoot = toHex(BigInt(referenceTree.root));

      expect(contractRoot).to.equal(referenceRoot);
    });

    it("contract root matches fixed-merkle-tree for multiple leaves", async () => {
      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("commit1")),
        ethers.keccak256(ethers.toUtf8Bytes("commit2")),
        ethers.keccak256(ethers.toUtf8Bytes("commit3")),
      ];

      // Build reference tree
      const referenceTree = new MerkleTree(20, [], {
        hashFunction: (left, right) =>
          poseidon2([BigInt(left), BigInt(right)]).toString(),
        zeroElement: "0",
      });

      // Insert into both trees
      for (const commitment of commitments) {
        const commitmentBigInt = BigInt(commitment);
        const fieldCommitment = toField(commitmentBigInt);

        await merkleTree.insertCommitment(commitment);
        referenceTree.insert(fieldCommitment.toString());
      }

      const contractRoot = await merkleTree.getRoot();
      const referenceRoot = toHex(BigInt(referenceTree.root));

      expect(contractRoot).to.equal(referenceRoot);
    });

    it("contract root matches fixed-merkle-tree for approved leaves", async () => {
      const leaves = [
        ethers.keccak256(
          ethers.solidityPacked(
            ["bytes32", "uint256", "uint256"],
            [ethers.keccak256(ethers.toUtf8Bytes("commitment1")), 1000, 100],
          ),
        ),
        ethers.keccak256(
          ethers.solidityPacked(
            ["bytes32", "uint256", "uint256"],
            [ethers.keccak256(ethers.toUtf8Bytes("commitment2")), 2000, 200],
          ),
        ),
      ];

      // Build reference tree
      const referenceTree = new MerkleTree(20, [], {
        hashFunction: (left, right) =>
          poseidon2([BigInt(left), BigInt(right)]).toString(),
        zeroElement: "0",
      });

      // Insert into both trees
      for (const leaf of leaves) {
        const leafBigInt = BigInt(leaf);
        const fieldLeaf = toField(leafBigInt);

        await merkleTree.insertApprovedLeaf(leaf);
        referenceTree.insert(fieldLeaf.toString());
      }

      const contractRoot = await merkleTree.getRoot();
      const referenceRoot = toHex(BigInt(referenceTree.root));

      expect(contractRoot).to.equal(referenceRoot);
    });

    it("contract root matches fixed-merkle-tree with large values exceeding BN254 field", async () => {
      // Large value that will be reduced
      const largeCommitment =
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
      const largeBigInt = BigInt(largeCommitment);
      const fieldValue = toField(largeBigInt);

      // Insert into contract
      await merkleTree.insertCommitment(largeCommitment);
      const contractRoot = await merkleTree.getRoot();

      // Build reference tree with reduced value
      const referenceTree = new MerkleTree(20, [], {
        hashFunction: (left, right) =>
          poseidon2([BigInt(left), BigInt(right)]).toString(),
        zeroElement: "0",
      });

      referenceTree.insert(fieldValue.toString());
      const referenceRoot = toHex(BigInt(referenceTree.root));

      expect(contractRoot).to.equal(referenceRoot);
    });

    it("historical roots match as tree grows", async () => {
      const referenceTree = new MerkleTree(20, [], {
        hashFunction: (left, right) =>
          poseidon2([BigInt(left), BigInt(right)]).toString(),
        zeroElement: "0",
      });

      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("a")),
        ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("c")),
      ];

      for (let i = 0; i < commitments.length; i++) {
        const commitment = commitments[i];
        const commitmentBigInt = BigInt(commitment);
        const fieldCommitment = toField(commitmentBigInt);

        await merkleTree.insertCommitment(commitment);
        referenceTree.insert(fieldCommitment.toString());

        const contractRoot = await merkleTree.getRoot();
        const referenceRoot = toHex(BigInt(referenceTree.root));

        expect(contractRoot).to.equal(
          referenceRoot,
          `Root mismatch at index ${i}`,
        );
        expect(await merkleTree.isKnownRoot(contractRoot)).to.be.true;
      }
    });
  });
});
