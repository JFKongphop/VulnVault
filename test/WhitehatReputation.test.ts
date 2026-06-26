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
    reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy();
    await reputation.waitForDeployment();
    reputationAddr = await reputation.getAddress();
    // signers[0] acts as BugBountyProgram
    await reputation.setBugBountyProgram(signers[0].address);
  });

  // ── Helper: grant decrypt access then read handle as hex ──────────────────
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

  it("registers commitment and increments score", async () => {
    await reputation.incrementScore(C1, 1, 5_000n * 1_000_000n);
    expect(await reputation.isRegisteredCommitment(C1)).to.be.true;
    expect(await reputation.getApprovedCount(C1)).to.equal(1);
  });

  it("accumulates score across reports", async () => {
    await reputation.incrementScore(C1, 0, 1_000n * 1_000_000n); // Low = 10
    await reputation.incrementScore(C1, 1, 5_000n * 1_000_000n); // Medium = 25
    expect(await reputation.getApprovedCount(C1)).to.equal(2);
  });

  it("assigns correct points — Low=10 via FHE decrypt", async () => {
    await reputation.incrementScore(C1, 0, 0); // Low = 10 points
    const handle = await scoreHandleFor(C1);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(10n);
  });

  it("assigns correct points — Critical=100 via FHE decrypt", async () => {
    await reputation.incrementScore(C2, 3, 0); // Critical = 100 points
    const handle = await scoreHandleFor(C2);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(100n);
  });

  it("accumulates score correctly — Medium(25) + High(50) = 75 via FHE decrypt", async () => {
    await reputation.incrementScore(C1, 1, 0); // Medium = 25
    await reputation.incrementScore(C1, 2, 0); // High = 50
    const handle = await scoreHandleFor(C1);
    const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, signers[0]);
    expect(score).to.equal(75n);
  });

  it("tracks total earnings via FHE decrypt", async () => {
    const bounty = 5_000n * 1_000_000n;
    await reputation.incrementScore(C1, 2, bounty);
    const handle = await earningsHandleFor(C1);
    const earnings = await fhevm.userDecryptEuint(FhevmType.euint64, handle, reputationAddr, signers[0]);
    expect(earnings).to.equal(bounty);
  });

  it("accumulates earnings across reports via FHE decrypt", async () => {
    await reputation.incrementScore(C1, 1, 1_000n * 1_000_000n);
    await reputation.incrementScore(C1, 2, 4_000n * 1_000_000n);
    const handle = await earningsHandleFor(C1);
    const earnings = await fhevm.userDecryptEuint(FhevmType.euint64, handle, reputationAddr, signers[0]);
    expect(earnings).to.equal(5_000n * 1_000_000n);
  });

  it("requestMeetsRequirement: score 100 >= threshold 50 → true", async () => {
    await reputation.incrementScore(C1, 3, 0); // Critical = 100 points
    const tx = await reputation.requestMeetsRequirement(C1, 50); // Bronze threshold
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
    await expect(reputation.connect(signers[1]).incrementScore(C1, 0, 0)).to.be.revertedWith("Not BugBountyProgram");
  });

  it("multiple commitments independent — verified via FHE decrypt", async () => {
    await reputation.incrementScore(C1, 3, 0); // Critical = 100
    await reputation.incrementScore(C2, 0, 0); // Low = 10
    const h1 = await scoreHandleFor(C1);
    const h2 = await scoreHandleFor(C2);
    expect(await fhevm.userDecryptEuint(FhevmType.euint32, h1, reputationAddr, signers[0])).to.equal(100n);
    expect(await fhevm.userDecryptEuint(FhevmType.euint32, h2, reputationAddr, signers[0])).to.equal(10n);
  });
});


