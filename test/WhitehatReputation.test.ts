import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("WhitehatReputation", function () {
  let signers: any, reputation: any, reputationAddr: string;
  const C1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const C2 = "0x2222222222222222222222222222222222222222222222222222222222222222";

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy(signers[0].address);
    await reputation.waitForDeployment();
    reputationAddr = await reputation.getAddress();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** FHE-encrypt a bounty amount and call incrementScoreExternal */
  async function incScore(commitment: string, severity: number, amount: bigint) {
    const inp = fhevm.createEncryptedInput(reputationAddr, signers[0].address);
    inp.add64(Number(amount));
    const { handles, inputProof } = await inp.encrypt();
    return reputation.incrementScoreExternal(commitment, severity, handles[0]!, inputProof);
  }

  async function scoreHandleFor(commitment: string, signer = signers[0]): Promise<string> {
    await reputation.connect(signer).allowScoreDecrypt(commitment);
    const h = await reputation.getMyScoreHandle(commitment);
    return typeof h === "string" ? h : ethers.zeroPadValue(ethers.toBeHex(h), 32);
  }

  async function earningsHandleFor(commitment: string, signer = signers[0]): Promise<string> {
    await reputation.connect(signer).allowEarningsDecrypt(commitment);
    const h = await reputation.getMyEarningsHandle(commitment);
    return typeof h === "string" ? h : ethers.zeroPadValue(ethers.toBeHex(h), 32);
  }

  // ── Core Tests ───────────────────────────────────────────────────────────

  it("registers commitment and increments score", async () => {
    await incScore(C1, 1, 5_000n * 1_000_000n);
    expect(await reputation.isRegisteredCommitment(C1)).to.be.true;
    expect(await reputation.getApprovedCount(C1)).to.equal(1);
  });

  it("accumulates score across reports", async () => {
    await incScore(C1, 0, 1_000n * 1_000_000n); // Low = 10
    await incScore(C1, 1, 5_000n * 1_000_000n); // Medium = 25
    expect(await reputation.getApprovedCount(C1)).to.equal(2);
  });

  it("assigns correct points — Low=10 via FHE decrypt", async () => {
    await incScore(C1, 0, 0n);
    const handle = await scoreHandleFor(C1);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(10n);
  });

  it("assigns correct points — Critical=100 via FHE decrypt", async () => {
    await incScore(C2, 3, 0n);
    const handle = await scoreHandleFor(C2);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(100n);
  });

  it("accumulates score correctly — Medium(25) + High(50) = 75 via FHE decrypt", async () => {
    await incScore(C1, 1, 0n); // Medium = 25
    await incScore(C1, 2, 0n); // High = 50
    const handle = await scoreHandleFor(C1);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(75n);
  });

  it("tracks total earnings via FHE decrypt", async () => {
    const bounty = 5_000n * 1_000_000n;
    await incScore(C1, 2, bounty);
    const handle = await earningsHandleFor(C1);
    const earnings = await fhevm.userDecryptEuint(FhevmType.euint64, handle, reputationAddr, signers[0]);
    expect(earnings).to.equal(bounty);
  });

  it("accumulates earnings across reports via FHE decrypt", async () => {
    await incScore(C1, 1, 1_000n * 1_000_000n);
    await incScore(C1, 2, 4_000n * 1_000_000n);
    const handle = await earningsHandleFor(C1);
    const earnings = await fhevm.userDecryptEuint(FhevmType.euint64, handle, reputationAddr, signers[0]);
    expect(earnings).to.equal(5_000n * 1_000_000n);
  });

  it("requestMeetsRequirement: score 100 >= threshold 50 → true", async () => {
    await incScore(C1, 3, 0n); // Critical = 100
    const tx = await reputation.requestMeetsRequirement(C1, 50);
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "RequirementCheckRequested") as any;
    expect(event).to.not.be.undefined;
    const qualifies = await fhevm.publicDecryptEbool(event.args[2]);
    expect(qualifies).to.be.true;
  });

  it("requestMeetsRequirement: unregistered → false", async () => {
    const tx = await reputation.requestMeetsRequirement(C1, 50);
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "RequirementCheckRequested") as any;
    const qualifies = await fhevm.publicDecryptEbool(event.args[2]);
    expect(qualifies).to.be.false;
  });

  it("requestMeetsRequirement: Open tier (0 threshold) → always true", async () => {
    const tx = await reputation.requestMeetsRequirement(C1, 0);
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "RequirementCheckRequested") as any;
    const qualifies = await fhevm.publicDecryptEbool(event.args[2]);
    expect(qualifies).to.be.true;
  });

  it("reverts non-BugBountyProgram incrementScore", async () => {
    await expect(
      reputation.connect(signers[1]).incrementScore(C1, 0, ethers.ZeroHash)
    ).to.be.revertedWith("Not BugBountyProgram");
  });

  it("multiple commitments independent — verified via FHE decrypt", async () => {
    await incScore(C1, 3, 0n); // Critical = 100
    await incScore(C2, 0, 0n); // Low = 10
    const h1 = await scoreHandleFor(C1);
    const h2 = await scoreHandleFor(C2);
    expect(await fhevm.userDecryptEuint(FhevmType.euint32, h1, reputationAddr, signers[0])).to.equal(100n);
    expect(await fhevm.userDecryptEuint(FhevmType.euint32, h2, reputationAddr, signers[0])).to.equal(10n);
  });

  // ── Security & Access Control ─────────────────────────────────────────────

  it("constructor reverts for zero address", async () => {
    await expect(
      (await ethers.getContractFactory("WhitehatReputation")).deploy(ethers.ZeroAddress)
    ).to.be.revertedWith("Zero address");
  });

  it("reverts on invalid severity", async () => {
    await expect(
      reputation.incrementScore(C1, 99, ethers.ZeroHash)
    ).to.be.revertedWith("Invalid severity");
  });

  // ── Helper Functions ──────────────────────────────────────────────────────

  it("getAllTierThresholds returns correct values", async () => {
    const tiers = await reputation.getAllTierThresholds();
    expect(tiers[0]).to.equal(0);
    expect(tiers[1]).to.equal(50);
    expect(tiers[2]).to.equal(150);
    expect(tiers[3]).to.equal(400);
    expect(tiers[4]).to.equal(1000);
  });

  it("getSeverityPoints returns correct values", async () => {
    const points = await reputation.getSeverityPoints();
    expect(points[0]).to.equal(10);
    expect(points[1]).to.equal(25);
    expect(points[2]).to.equal(50);
    expect(points[3]).to.equal(100);
  });

  it("estimatePointsForReports calculates correctly", async () => {
    const total = await reputation.estimatePointsForReports([0, 1, 2, 3]);
    expect(total).to.equal(185);
  });

  it("getBatchApprovedCounts returns multiple counts", async () => {
    await incScore(C1, 1, 0n);
    await incScore(C1, 2, 0n);
    await incScore(C2, 3, 0n);
    const counts = await reputation.getBatchApprovedCounts([C1, C2]);
    expect(counts[0]).to.equal(2);
    expect(counts[1]).to.equal(1);
  });

  it("getBatchRegistrationStatus returns multiple statuses", async () => {
    await incScore(C1, 1, 0n);
    const statuses = await reputation.getBatchRegistrationStatus([C1, C2]);
    expect(statuses[0]).to.be.true;
    expect(statuses[1]).to.be.false;
  });
});
