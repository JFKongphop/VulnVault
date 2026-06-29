import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

const DECIMALS_6 = 1_000_000n;

describe("BountyVault", function () {
  let signers: any;
  let underlyingUSDT: any, cUSDT: any, vault: any, vaultAddr: string, cUSDTAddr: string;
  let bb: any, bbAddr: string, merkleTree: any;
  const PID = 0;
  const SID = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  // Helper to deposit via confidentialTransferAndCall
  async function depositToVault(admin: any, amount: bigint) {
    const inp = fhevm.createEncryptedInput(cUSDTAddr, admin.address);
    inp.add64(Number(amount));
    const { handles, inputProof } = await inp.encrypt();
    // No data parameter needed for encrypted version
    await cUSDT.connect(admin)["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x");
  }

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

  // Decrypt helper functions (similar to Collateral.ts pattern)
  async function getAvailableBalance(): Promise<bigint> {
    const enc = await vault.getAvailableBalance(PID);
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, vaultAddr, signers[1]);
  }

  async function getLockedBalance(): Promise<bigint> {
    const enc = await vault.getLockedBalance(PID);
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, vaultAddr, signers[1]);
  }

  async function getPendingWithdrawalAmount(): Promise<bigint> {
    const [enc] = await vault.getPendingWithdrawal(PID);
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, vaultAddr, signers[1]);
  }

  async function getLockedForReport(submissionId: string): Promise<bigint> {
    const enc = await vault.getLockedForReport(submissionId);
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, vaultAddr, signers[1]);
  }

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
    
    // Deploy vault
    vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, signers[1].address, PID);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();
    
    // Deploy MerkleTree
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy();
    await merkleTree.waitForDeployment();
    
    // Deploy BugBountyProgram
    bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(signers[1].address, PID);
    await bb.waitForDeployment();
    bbAddr = await bb.getAddress();
    
    // Connect contracts
    await bb.setVault(vaultAddr);
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(bbAddr); // Authorize BB to insert commitments
    await vault.connect(signers[1]).setBugBountyProgram(bbAddr);
    await vault.connect(signers[1]).setConfidentialPayouts(signers[0].address);
    await vault.connect(signers[1]).setDisputeResolver(signers[0].address);
    
    // Mint underlying tokens and wrap them to confidential
    await underlyingUSDT.mint(signers[1].address, 100_000n * DECIMALS_6);
    await underlyingUSDT.connect(signers[1]).approve(cUSDTAddr, 100_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).wrap(signers[1].address, 100_000n * DECIMALS_6);
  });

  it("deposits from admin", async () => {
    await depositToVault(signers[1], 10_000n * DECIMALS_6);
    const balance = await getAvailableBalance();
    expect(balance).to.equal(10_000n * DECIMALS_6);
  });

  it("allows zero deposit (encrypted version has no validation)", async () => {
    const inp = fhevm.createEncryptedInput(cUSDTAddr, signers[1].address);
    inp.add64(0);
    const { handles, inputProof } = await inp.encrypt();
    // Encrypted version doesn't revert on zero, just deposits encrypted 0
    await cUSDT.connect(signers[1])["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x");
    // No assertion - just checking it doesn't revert
  });

  it("reverts non-admin deposit", async () => {
    const inp = fhevm.createEncryptedInput(cUSDTAddr, signers[2].address);
    inp.add64(1000);
    const { handles, inputProof } = await inp.encrypt();
    // Should revert due to admin check in onConfidentialTransferReceived
    await expect(
      cUSDT.connect(signers[2])["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x")
    ).to.be.reverted;
  });

  it("locks funds for approved report", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await lockFundsViaBB(SID, 5_000n * DECIMALS_6);
    expect(await getAvailableBalance()).to.equal(45_000n * DECIMALS_6);
    expect(await getLockedBalance()).to.equal(5_000n * DECIMALS_6);
    expect(await getLockedForReport(SID)).to.equal(5_000n * DECIMALS_6);
  });

  it("locks partial amount when exceeding available (graceful degradation)", async () => {
    await depositToVault(signers[1], 1_000n * DECIMALS_6);
    // Encrypted version uses FHE.select - silently locks whatever is available (1k instead of 5k)
    await lockFundsViaBB(SID, 5_000n * DECIMALS_6);
    // Verify it locked only what was available (1k)
    expect(await getAvailableBalance()).to.equal(0n);
    expect(await getLockedBalance()).to.equal(1_000n * DECIMALS_6);
  });

  it("releases bounty to reporter", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await lockFundsViaBB(SID, 5_000n * DECIMALS_6);
    await vault.releaseBounty(PID, SID, signers[2].address, 5_000n * DECIMALS_6);
    expect(await getLockedBalance()).to.equal(0n);
    expect(await getLockedForReport(SID)).to.equal(0n);
  });

  it("releases partial amount when exceeding locked (graceful degradation)", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await lockFundsViaBB(SID, 1_000n * DECIMALS_6);
    // Encrypted version uses FHE.select - silently releases whatever is locked (1k instead of 5k)
    await vault.releaseBounty(PID, SID, signers[2].address, 5_000n * DECIMALS_6);
    // Verify it released only what was locked (1k)
    expect(await getLockedBalance()).to.equal(0n);
  });

  it("unlocks funds back to available", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await lockFundsViaBB(SID, 5_000n * DECIMALS_6);
    await vault.unlockFunds(PID, SID);
    expect(await getAvailableBalance()).to.equal(50_000n * DECIMALS_6);
    expect(await getLockedBalance()).to.equal(0n);
  });

  it("timelocked withdrawal flow", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await vault.connect(signers[1]).initiateWithdrawal(PID, 10_000n * DECIMALS_6);
    await expect(vault.connect(signers[1]).executeWithdrawal(PID)).to.be.revertedWith("Timelock active");
    await time.increase(48 * 3600 + 1);
    await vault.connect(signers[1]).executeWithdrawal(PID);
    expect(await getAvailableBalance()).to.equal(40_000n * DECIMALS_6);
  });

  it("cancels pending withdrawal", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await vault.connect(signers[1]).initiateWithdrawal(PID, 10_000n * DECIMALS_6);
    await vault.connect(signers[1]).cancelWithdrawal(PID);
    expect(await getPendingWithdrawalAmount()).to.equal(0n);
    expect(await getAvailableBalance()).to.equal(50_000n * DECIMALS_6);
  });

  it("initiates partial withdrawal when exceeding available (graceful degradation)", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    await lockFundsViaBB(SID, 10_000n * DECIMALS_6);
    // available = 40k, locked = 10k → try to withdraw 50k
    // Encrypted version uses FHE.select - silently withdraws 40k instead of reverting
    await vault.connect(signers[1]).initiateWithdrawal(PID, 50_000n * DECIMALS_6);
    expect(await getPendingWithdrawalAmount()).to.equal(40_000n * DECIMALS_6);
    expect(await getAvailableBalance()).to.equal(0n);
  });

  it("complete lifecycle: deposit → lock → release → timelock withdraw", async () => {
    await depositToVault(signers[1], 50_000n * DECIMALS_6);
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("report1"));
    await lockFundsViaBB(nullifier, 20_000n * DECIMALS_6);
    expect(await getLockedBalance()).to.equal(20_000n * DECIMALS_6);
    expect(await getAvailableBalance()).to.equal(30_000n * DECIMALS_6);
    await vault.unlockFunds(PID, nullifier);
    expect(await getLockedBalance()).to.equal(0n);
    expect(await getAvailableBalance()).to.equal(50_000n * DECIMALS_6);
    await vault.connect(signers[1]).initiateWithdrawal(PID, 50_000n * DECIMALS_6);
    await time.increase(48 * 3600 + 1);
    await vault.connect(signers[1]).executeWithdrawal(PID);
    expect(await getAvailableBalance()).to.equal(0n);
  });
});
