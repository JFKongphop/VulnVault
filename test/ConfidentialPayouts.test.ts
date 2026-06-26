import { ethers } from "hardhat";
import { expect } from "chai";
const DECIMALS_6 = 1_000_000n;

describe("ConfidentialPayouts", function () {
  let signers: any, payouts: any, merkleTree: any, cUSDT: any, vault: any;
  const PID = 0;

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await cUSDT.waitForDeployment();
    vault = await (await ethers.getContractFactory("BountyVault")).deploy(await cUSDT.getAddress(), signers[1].address, PID);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    await vault.setBugBountyProgram(signers[0].address);
    await vault.setDisputeResolver(signers[0].address);

    payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(signers[1].address, PID);
    await payouts.waitForDeployment();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy(20);
    await merkleTree.waitForDeployment();
    await payouts.setMerkleTree(await merkleTree.getAddress());
    await payouts.setVault(vaultAddr);
    await vault.setConfidentialPayouts(await payouts.getAddress());

    await cUSDT.mint(signers[1].address, 100_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).approve(vaultAddr, 100_000n * DECIMALS_6);
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
  });

  it("withdraws bounty to fresh wallet", async () => {
    const bounty = 5_000n * DECIMALS_6;
    const nullifier = ethers.keccak256(ethers.randomBytes(32));
    await vault.lockFunds(PID, nullifier, bounty);
    const leaf = ethers.keccak256(ethers.solidityPacked(["bytes32","uint256","uint256"], [ethers.keccak256(ethers.randomBytes(32)), bounty, Math.floor(Date.now()/1000)]));
    await merkleTree.insertApprovedLeaf(leaf);
    const root = await merkleTree.getRoot();
    const balBefore = await cUSDT.balanceOf(signers[3].address);
    await payouts.withdraw(root, nullifier, signers[3].address, bounty, "0x");
    expect(await cUSDT.balanceOf(signers[3].address)).to.equal(balBefore + bounty);
  });

  it("marks nullifier as spent", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.randomBytes(32));
    await vault.lockFunds(PID, nf, bounty);
    const leaf = ethers.keccak256(ethers.solidityPacked(["bytes32","uint256","uint256"], [ethers.keccak256(ethers.randomBytes(32)), bounty, Math.floor(Date.now()/1000)]));
    await merkleTree.insertApprovedLeaf(leaf);
    await payouts.withdraw(await merkleTree.getRoot(), nf, signers[3].address, bounty, "0x");
    expect(await payouts.isNullifierSpent(nf)).to.be.true;
  });

  it("reverts double withdrawal", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf2 = ethers.keccak256(ethers.randomBytes(32));
    await vault.lockFunds(PID, nf2, bounty * 2n);
    const leaf = ethers.keccak256(ethers.solidityPacked(["bytes32","uint256","uint256"], [ethers.keccak256(ethers.randomBytes(32)), bounty, Math.floor(Date.now()/1000)]));
    await merkleTree.insertApprovedLeaf(leaf);
    const root = await merkleTree.getRoot();
    await payouts.withdraw(root, nf2, signers[3].address, bounty, "0x");
    await expect(payouts.withdraw(root, nf2, signers[4].address, bounty, "0x")).to.be.revertedWith("Already withdrawn");
  });

  it("reverts invalid root", async () => {
    await expect(payouts.withdraw(ethers.keccak256(ethers.toUtf8Bytes("bad")), ethers.keccak256(ethers.randomBytes(32)), signers[3].address, 1000n, "0x")).to.be.revertedWith("Invalid root");
  });

  it("updates merkle root", async () => {
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("test"));
    await payouts.updateMerkleRoot(newRoot);
    expect(await payouts.currentRoot()).to.equal(newRoot);
  });

  it("two different nullifiers can coexist — both withdrawals succeed", async () => {
    const bounty = 3_000n * DECIMALS_6;
    const nf1 = ethers.keccak256(ethers.toUtf8Bytes("nf-one"));
    const nf2 = ethers.keccak256(ethers.toUtf8Bytes("nf-two"));
    await vault.lockFunds(PID, nf1, bounty);
    await vault.lockFunds(PID, nf2, bounty);
    await merkleTree.insertApprovedLeaf(nf1);
    await merkleTree.insertApprovedLeaf(nf2);
    const root = await merkleTree.getRoot();
    await payouts.withdraw(root, nf1, signers[3].address, bounty, "0x");
    await payouts.withdraw(root, nf2, signers[4].address, bounty, "0x");
    expect(await cUSDT.balanceOf(signers[3].address)).to.equal(bounty);
    expect(await cUSDT.balanceOf(signers[4].address)).to.equal(bounty);
  });

  it("isNullifierSpent: false before withdrawal, true after", async () => {
    const bounty = 2_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.toUtf8Bytes("nf-spent-check"));
    await vault.lockFunds(PID, nf, bounty);
    await merkleTree.insertApprovedLeaf(nf);
    const root = await merkleTree.getRoot();
    expect(await payouts.isNullifierSpent(nf)).to.be.false;
    await payouts.withdraw(root, nf, signers[3].address, bounty, "0x");
    expect(await payouts.isNullifierSpent(nf)).to.be.true;
  });

  it("withdraw emits Withdrawal event with nullifier and root", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.toUtf8Bytes("nf-event-check"));
    await vault.lockFunds(PID, nf, bounty);
    await merkleTree.insertApprovedLeaf(nf);
    const root = await merkleTree.getRoot();
    await expect(
      payouts.withdraw(root, nf, signers[3].address, bounty, "0x")
    ).to.emit(payouts, "Withdrawal").withArgs(nf, root);
  });
});
