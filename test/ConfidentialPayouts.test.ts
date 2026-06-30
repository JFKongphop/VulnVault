import { ethers, fhevm } from "hardhat";
import { expect } from "chai";

const DECIMALS_6 = 1_000_000n;

// Dummy proof parameters for withdrawal tests
// Real ZK proof verification is thoroughly tested in BountyClaimVerifier.test.ts
// These tests focus on ConfidentialPayouts business logic (nullifier tracking, access control, etc.)
const DUMMY_PA: [bigint, bigint] = [0n, 0n];
const DUMMY_PB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
const DUMMY_PC: [bigint, bigint] = [0n, 0n];

describe("ConfidentialPayouts", function () {
  let signers: any, payouts: any, merkleTree: any, underlyingUSDT: any, cUSDT: any, cUSDTAddr: string, vault: any, vaultAddr: string;
  let bb: any, bbAddr: string;
  const PID = 0;

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    
    // Deploy underlying ERC20
    underlyingUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await underlyingUSDT.waitForDeployment();
    
    // Deploy ERC7984 confidential wrapper
    cUSDT = await (await ethers.getContractFactory("MockConfidentialUSDT")).deploy(await underlyingUSDT.getAddress());
    await cUSDT.waitForDeployment();
    cUSDTAddr = await cUSDT.getAddress();
    
    vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, signers[1].address, PID);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Deploy BugBountyProgram first (needed for ConfidentialPayouts constructor)
    bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(signers[1].address, PID);
    await bb.waitForDeployment();
    bbAddr = await bb.getAddress();

    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy();
    await merkleTree.waitForDeployment();

    // Use MockBountyClaimVerifier for withdrawal tests (real ZK verification tested in BountyClaimVerifier.test.ts)
    const verifier = await (await ethers.getContractFactory("MockBountyClaimVerifier")).deploy();
    await verifier.waitForDeployment();

    payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, bbAddr, vaultAddr, await merkleTree.getAddress(), await verifier.getAddress());
    await payouts.waitForDeployment();
    
    // Connect contracts
    await bb.setVault(vaultAddr);
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(bbAddr); // Authorize BB to insert commitments
    await vault.setBugBountyProgram(bbAddr);
    await vault.setConfidentialPayouts(await payouts.getAddress());
    await vault.setDisputeResolver(signers[0].address);

    // Mint underlying tokens and wrap them to confidential
    await underlyingUSDT.mint(signers[1].address, 100_000n * DECIMALS_6);
    await underlyingUSDT.connect(signers[1]).approve(cUSDTAddr, 100_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).wrap(signers[1].address, 100_000n * DECIMALS_6);
    
    // Deposit to vault via confidentialTransferAndCall
    const inp = fhevm.createEncryptedInput(cUSDTAddr, signers[1].address);
    inp.add64(Number(50_000n * DECIMALS_6));
    const { handles, inputProof } = await inp.encrypt();
    // No data parameter needed for encrypted version
    await cUSDT.connect(signers[1])["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x");
  });

  // Helper to lock funds via BugBountyProgram (real production flow)
  async function lockFundsViaBB(submissionId: string, amount: bigint) {
    // First, submit a report (required before approve)
    const inp = fhevm.createEncryptedInput(bbAddr, signers[0].address);
    inp.add8(1); // impactType
    inp.add8(2); // severity
    const { handles, inputProof } = await inp.encrypt();
    
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));
    await bb.submitReport(
      commitment,
      "0x", // encryptedProtocol
      "0x", // encryptedContractAddress  
      handles[0], // impactType
      handles[1], // severity
      inputProof,
      "0x", // title
      "0x", // description
      "0x", // poc
      "0x", // gist
      "0x", // attachments
      "0x"  // symmetricKey
    );
    
    // Review the report
    await bb.connect(signers[1]).reviewReport(submissionId);
    
    // Create encrypted bounty amount
    const inpBounty = fhevm.createEncryptedInput(bbAddr, signers[1].address);
    inpBounty.add64(Number(amount));
    const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
    
    // Approve report with encrypted bounty (this calls vault.lockFunds internally)
    await bb.connect(signers[1]).approveReport(submissionId, bountyHandles[0], 2, bountyProof, "0x");
  }

  it("withdraws bounty to fresh wallet", async () => {
    const bounty = 5_000n * DECIMALS_6;
    const nullifier = ethers.keccak256(ethers.randomBytes(32));
    
    await lockFundsViaBB(nullifier, bounty);
    await merkleTree.insertApprovedLeaf(nullifier);
    const root = await merkleTree.getRoot();
    
    // Withdraw with dummy proof (real ZK verification tested in BountyClaimVerifier.test.ts)
    await payouts.withdraw(root, nullifier, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
  });

  it("marks nullifier as spent", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.randomBytes(32));
    
    await lockFundsViaBB(nf, bounty);
    await merkleTree.insertApprovedLeaf(nf);
    
    await payouts.withdraw(await merkleTree.getRoot(), nf, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
    expect(await payouts.isNullifierSpent(nf)).to.be.true;
  });

  it("reverts double withdrawal", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf2 = ethers.keccak256(ethers.randomBytes(32));
    
    await lockFundsViaBB(nf2, bounty * 2n);
    await merkleTree.insertApprovedLeaf(nf2);
    const root = await merkleTree.getRoot();
    
    await payouts.withdraw(root, nf2, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
    await expect(payouts.withdraw(root, nf2, signers[4].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC)).to.be.revertedWith("Already withdrawn");
  });

  it("reverts invalid root", async () => {
    const nf = ethers.keccak256(ethers.randomBytes(32));
    await expect(
      payouts.withdraw(ethers.keccak256(ethers.toUtf8Bytes("bad")), nf, signers[3].address, 1000n, DUMMY_PA, DUMMY_PB, DUMMY_PC)
    ).to.be.revertedWith("Invalid root");
  });

  it("two different nullifiers can coexist — both withdrawals succeed", async () => {
    const bounty = 3_000n * DECIMALS_6;
    const nf1 = ethers.keccak256(ethers.toUtf8Bytes("nf-one"));
    const nf2 = ethers.keccak256(ethers.toUtf8Bytes("nf-two"));
    
    await lockFundsViaBB(nf1, bounty);
    await lockFundsViaBB(nf2, bounty);
    await merkleTree.insertApprovedLeaf(nf1);
    await merkleTree.insertApprovedLeaf(nf2);
    const root = await merkleTree.getRoot();
    
    // Both withdrawals should succeed
    await payouts.withdraw(root, nf1, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
    await payouts.withdraw(root, nf2, signers[4].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
  });

  it("isNullifierSpent: false before withdrawal, true after", async () => {
    const bounty = 2_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.toUtf8Bytes("nf-spent-check"));
    
    await lockFundsViaBB(nf, bounty);
    await merkleTree.insertApprovedLeaf(nf);
    const root = await merkleTree.getRoot();
    
    expect(await payouts.isNullifierSpent(nf)).to.be.false;
    await payouts.withdraw(root, nf, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC);
    expect(await payouts.isNullifierSpent(nf)).to.be.true;
  });

  it("withdraw emits Withdrawal event with nullifier and root", async () => {
    const bounty = 1_000n * DECIMALS_6;
    const nf = ethers.keccak256(ethers.toUtf8Bytes("nf-event-check"));
    
    await lockFundsViaBB(nf, bounty);
    await merkleTree.insertApprovedLeaf(nf);
    const root = await merkleTree.getRoot();
    
    await expect(
      payouts.withdraw(root, nf, signers[3].address, bounty, DUMMY_PA, DUMMY_PB, DUMMY_PC)
    ).to.emit(payouts, "Withdrawal").withArgs(nf, root);
  });

  // ── Access Control Tests ──────────────────────────────────────

  it("constructor reverts for zero bug bounty program", async () => {
    const verifier = await (await ethers.getContractFactory("BountyClaimVerifier")).deploy();
    await expect(
      (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, ethers.ZeroAddress, vaultAddr, await merkleTree.getAddress(), await verifier.getAddress())
    ).to.be.revertedWith("Zero bug bounty program");
  });

  it("constructor reverts for zero vault", async () => {
    const verifier = await (await ethers.getContractFactory("BountyClaimVerifier")).deploy();
    await expect(
      (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, bbAddr, ethers.ZeroAddress, await merkleTree.getAddress(), await verifier.getAddress())
    ).to.be.revertedWith("Zero vault");
  });

  it("constructor reverts for zero merkle tree", async () => {
    const verifier = await (await ethers.getContractFactory("BountyClaimVerifier")).deploy();
    await expect(
      (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, bbAddr, vaultAddr, ethers.ZeroAddress, await verifier.getAddress())
    ).to.be.revertedWith("Zero merkle tree");
  });

  it("constructor reverts for zero verifier", async () => {
    await expect(
      (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, bbAddr, vaultAddr, await merkleTree.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWith("Zero verifier");
  });

  it("updateMerkleRoot reverts for non-BugBountyProgram", async () => {
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
    await expect(
      payouts.connect(signers[2]).updateMerkleRoot(newRoot)
    ).to.be.revertedWith("Not bug bounty program");
  });

  it("updateMerkleRoot succeeds for BugBountyProgram", async () => {
    const mockMerkle = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await (await (await ethers.getContractFactory("Hasher")).deploy()).getAddress() }
    })).deploy();
    const verifier = await (await ethers.getContractFactory("MockBountyClaimVerifier")).deploy();
    const newPayouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, signers[0].address, vaultAddr, await mockMerkle.getAddress(), await verifier.getAddress());
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
    await expect(
      newPayouts.connect(signers[0]).updateMerkleRoot(newRoot)
    ).to.emit(newPayouts, "MerkleRootUpdated").withArgs(newRoot);
    expect(await newPayouts.currentRoot()).to.equal(newRoot);
  });
});
