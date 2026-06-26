import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("DisputeResolver", function () {
  let signers: any, resolver: any, bb: any;

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await resolver.waitForDeployment();
    bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(signers[1].address, 0);
    await bb.waitForDeployment();
    await resolver.setBugBountyProgram(await bb.getAddress());
    await bb.setDisputeResolver(await resolver.getAddress());
    await resolver.setProgramArbiters(0, [signers[3].address, signers[4].address, signers[5].address]);
  });

  async function submitAndReject(): Promise<string> {
    const tx = await bb.connect(signers[2]).submitReport(
      ethers.keccak256(ethers.randomBytes(32)),
      ethers.toUtf8Bytes("P"), "0x01",
      ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x",
    );
    const receipt = await tx.wait();
    const ev = receipt?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted");
    const sid = (ev as any).args[0];
    await bb.connect(signers[1]).reviewReport(sid);
    await bb.connect(signers[1]).rejectReport(sid, "0x");
    return sid;
  }

  it("raises dispute on rejected report", async () => {
    const sid = await submitAndReject();
    await expect(resolver.connect(signers[2]).raiseDispute(
      sid, ethers.toUtf8Bytes("Reason"), ethers.toUtf8Bytes("Evidence"), "0x"
    )).to.emit(resolver, "DisputeRaised");
  });

  it("votes and resolves — FHE tally: 2 ForReporter, 0 ForAdmin", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(
      sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x"
    );
    const receipt = await tx.wait();
    const ev = receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised");
    const disputeId = (ev as any).args[0];

    // Two arbiters vote ForReporter (1) — encrypted by the contract via FHE.asEuint8
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x");

    // Resolve — FHE.add tallies votes, FHE.makePubliclyDecryptable on handles
    const resolveTx = await resolver.resolveDispute(disputeId);
    const resolveReceipt = await resolveTx.wait();
    const resolveEv = resolveReceipt?.logs.find((l: any) => l.fragment?.name === "DisputeResolved") as any;

    // Handles are publicly decryptable — verify vote counts via oracle
    const forReporterHandle = resolveEv.args[1];
    const forAdminHandle = resolveEv.args[2];
    const forReporter = await fhevm.publicDecryptEuint(FhevmType.euint8, forReporterHandle);
    const forAdmin = await fhevm.publicDecryptEuint(FhevmType.euint8, forAdminHandle);
    expect(forReporter).to.equal(2n); // two ForReporter votes
    expect(forAdmin).to.equal(0n);    // zero ForAdmin votes

    // Also verify the outcome boolean handle
    const reporterWonHandle = resolveEv.args[3];
    const reporterWon = await fhevm.publicDecryptEbool(reporterWonHandle);
    expect(reporterWon).to.be.true;
  });

  it("votes and resolves — FHE tally: 2 ForAdmin, reporter loses", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(
      sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x"
    );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];

    await resolver.connect(signers[3]).submitVote(disputeId, 2, "0x"); // ForAdmin
    await resolver.connect(signers[4]).submitVote(disputeId, 2, "0x"); // ForAdmin

    const resolveTx = await resolver.resolveDispute(disputeId);
    const resolveReceipt = await resolveTx.wait();
    const resolveEv = resolveReceipt?.logs.find((l: any) => l.fragment?.name === "DisputeResolved") as any;

    const forReporter = await fhevm.publicDecryptEuint(FhevmType.euint8, resolveEv.args[1]);
    const forAdmin = await fhevm.publicDecryptEuint(FhevmType.euint8, resolveEv.args[2]);
    const reporterWon = await fhevm.publicDecryptEbool(resolveEv.args[3]);
    expect(forReporter).to.equal(0n);
    expect(forAdmin).to.equal(2n);
    expect(reporterWon).to.be.false;
  });

  it("reverts non-arbiter vote", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await expect(resolver.connect(signers[2]).submitVote(disputeId, 1, "0x")).to.be.reverted;
  });

  it("reverts double vote", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await expect(resolver.connect(signers[3]).submitVote(disputeId, 2, "0x")).to.be.reverted;
  });

  it("reverts dispute on non-rejected report", async () => {
    const tx = await bb.connect(signers[2]).submitReport(
      ethers.keccak256(ethers.randomBytes(32)),
      ethers.toUtf8Bytes("P"), "0x01",
      ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x",
    );
    const receipt = await tx.wait();
    const sid = (receipt?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
    await expect(resolver.connect(signers[2]).raiseDispute(
      sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x"
    )).to.be.reverted;
  });

  it("allows resolve after voting deadline", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await time.increase(5 * 24 * 3600 + 1);
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
  });

  it("executes outcome for reporter win", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x");
    await resolver.resolveDispute(disputeId);
    await expect(resolver.executeOutcome(disputeId, 5_000n * 1_000_000n, 2)).to.emit(resolver, "OutcomeExecuted");
  });

  it("voting deadline blocks late votes", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await time.increase(5 * 24 * 3600 + 1); // past 5-day voting window
    await expect(
      resolver.connect(signers[3]).submitVote(disputeId, 1, "0x")
    ).to.be.revertedWith("Voting closed");
  });

  it("unanimous 3-of-3 ForReporter — FHE tally = 3", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x"); // ForReporter
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x"); // ForReporter
    await resolver.connect(signers[5]).submitVote(disputeId, 1, "0x"); // ForReporter (all voted → resolve)
    const tx2 = await resolver.resolveDispute(disputeId);
    const receipt2 = await tx2.wait();
    const ev = receipt2?.logs.find((l: any) => l.fragment?.name === "DisputeResolved");
    const forReporterHandle = (ev as any).args[1];
    expect(await fhevm.publicDecryptEuint(FhevmType.euint8, forReporterHandle)).to.equal(3n);
  });

  it("partial 2-of-3 vote: ForReporter=2 after 2 arbiters vote and deadline passes", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x"); // ForReporter
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x"); // ForReporter
    // signers[5] abstains — advance time to pass deadline
    await time.increase(5 * 24 * 3600 + 1);
    const tx2 = await resolver.resolveDispute(disputeId);
    const receipt2 = await tx2.wait();
    const ev = receipt2?.logs.find((l: any) => l.fragment?.name === "DisputeResolved");
    const forReporterHandle = (ev as any).args[1];
    expect(await fhevm.publicDecryptEuint(FhevmType.euint8, forReporterHandle)).to.equal(2n);
  });

  it("admin wins — executeOutcome emits OutcomeExecuted with reporterWon=false", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 2, "0x"); // ForAdmin
    await resolver.connect(signers[4]).submitVote(disputeId, 2, "0x"); // ForAdmin
    await resolver.resolveDispute(disputeId);
    await expect(
      resolver.executeOutcome(disputeId, 0, 0) // bountyAmount=0 → admin wins path
    ).to.emit(resolver, "OutcomeExecuted").withArgs(disputeId, false);
  });

  it("reverts executeOutcome if dispute not yet resolved", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    // Don't resolve — try to execute directly
    await expect(resolver.executeOutcome(disputeId, 0, 0)).to.be.revertedWith("Not yet resolved");
  });

  it("dispute status transitions: Voting → Resolved → Executed", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(1); // Voting
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x");
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
    await resolver.executeOutcome(disputeId, 5_000n * 1_000_000n, 2);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(3); // Executed
  });

  it("getDisputeOutcome returns non-zero handles after resolve", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x");
    await resolver.resolveDispute(disputeId);
    const [status, forReporter, forAdmin, reporterWon] = await resolver.getDisputeOutcome(disputeId);
    expect(status).to.equal(2); // Resolved
    expect(forReporter).to.not.equal(ethers.ZeroHash);
    expect(forAdmin).to.not.equal(ethers.ZeroHash);
    expect(reporterWon).to.not.equal(ethers.ZeroHash);
  });

  it("reverts raising duplicate dispute on same submission", async () => {
    const sid = await submitAndReject();
    await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    // After first raise, status = Disputed (not Rejected) → second raise reverts
    await expect(
      resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R2"), ethers.toUtf8Bytes("E2"), "0x")
    ).to.be.revertedWith("Report not rejected");
  });

  it("markDisputed: submission status becomes Disputed (4) after raiseDispute", async () => {
    const sid = await submitAndReject();
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(3n); // Rejected
    await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(4n); // Disputed
  });

  it("reverts resolveDispute if already resolved", async () => {
    const sid = await submitAndReject();
    const tx = await resolver.connect(signers[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await resolver.connect(signers[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(signers[4]).submitVote(disputeId, 1, "0x");
    await resolver.resolveDispute(disputeId);
    await expect(resolver.resolveDispute(disputeId)).to.be.revertedWith("Already resolved");
  });
});

