import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
const D6 = 1_000_000n;

describe("FullFlow Integration", function () {
  let s: any;
  before(async () => { s = await ethers.getSigners(); });

  it("create → submit → review → vault-lock → withdraw → dispute", async function () {
    if (!fhevm.isMock) this.skip();

    const cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy(); await cUSDT.waitForDeployment();
    const resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
    const bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, 0); await bb.waitForDeployment();
    const vault = await (await ethers.getContractFactory("BountyVault")).deploy(await cUSDT.getAddress(), s[1].address, 0); await vault.waitForDeployment();
    const payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(s[1].address, 0); await payouts.waitForDeployment();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
    const merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy(20); await merkleTree.waitForDeployment();

    await bb.setVault(await vault.getAddress());
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(await bb.getAddress());
    await bb.setDisputeResolver(await resolver.getAddress());
    await vault.setBugBountyProgram(await bb.getAddress());
    await vault.setConfidentialPayouts(await payouts.getAddress());
    await vault.setDisputeResolver(await resolver.getAddress());
    await payouts.setMerkleTree(await merkleTree.getAddress());
    await payouts.setVault(await vault.getAddress());
    await resolver.setBugBountyProgram(await bb.getAddress());
    await resolver.setProgramArbiters(0, [s[3].address, s[4].address, s[5].address]);

    await cUSDT.mint(s[1].address, 100_000n * D6);
    await cUSDT.connect(s[1]).approve(await vault.getAddress(), 100_000n * D6);
    await vault.connect(s[1]).deposit(0, 50_000n * D6);

    // Submit
    const tx = await bb.connect(s[2]).submitReport(
      ethers.keccak256(ethers.randomBytes(32)),
      ethers.toUtf8Bytes("P"), "0x01",
      ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x",
    );
    const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(0);

    // Review
    await bb.connect(s[1]).reviewReport(sid);
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(1);

    // Approve — internally calls vault.lockFunds(pid, sid, bountyAmount) and merkleTree.insertApprovedLeaf
    const bounty = 5_000n * D6;
    await bb.connect(s[1]).approveReport(sid, bounty, 3, "0x");
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(2);

    // Withdraw — sid is the nullifier key (matches what approveReport locked in vault)
    const balBefore = await cUSDT.balanceOf(s[4].address);
    await payouts.withdraw(await merkleTree.getRoot(), sid, s[4].address, bounty, "0x");
    expect(await cUSDT.balanceOf(s[4].address)).to.equal(balBefore + bounty);

    // Dispute
    const tx2 = await bb.connect(s[2]).submitReport(
      ethers.keccak256(ethers.randomBytes(32)),
      ethers.toUtf8Bytes("P2"), "0x02",
      ethers.toUtf8Bytes("T2"), ethers.toUtf8Bytes("D2"), ethers.toUtf8Bytes("P2"), "0x", "0x",
    );
    const sid2 = ((await tx2.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
    await bb.connect(s[1]).reviewReport(sid2);
    await bb.connect(s[1]).rejectReport(sid2, "0x");

    const dEv = ((await (await resolver.connect(s[2]).raiseDispute(sid2, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x")).wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any);
    const disputeId = dEv.args[0];
    await resolver.connect(s[3]).submitVote(disputeId, 1, "0x");
    await resolver.connect(s[4]).submitVote(disputeId, 1, "0x");
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step-by-step: approve-flow scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe("Step-by-step: approve flow", function () {
    let cUSDT: any, bb: any, bbAddr: string, vault: any, payouts: any;
    let merkleTree: any, resolver: any, reputation: any, reputationAddr: string;
    const commitment = "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";
    const PID = 0;

    beforeEach(async function () {
      if (!fhevm.isMock) this.skip();
      cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy(); await cUSDT.waitForDeployment();
      bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, PID); await bb.waitForDeployment();
      bbAddr = await bb.getAddress();
      vault = await (await ethers.getContractFactory("BountyVault")).deploy(await cUSDT.getAddress(), s[1].address, PID); await vault.waitForDeployment();
      payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(s[1].address, PID); await payouts.waitForDeployment();
      const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
      merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() }
      })).deploy(20); await merkleTree.waitForDeployment();
      resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
      reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy(); await reputation.waitForDeployment();
      reputationAddr = await reputation.getAddress();

      await bb.setVault(await vault.getAddress());
      await bb.setMerkleTree(await merkleTree.getAddress());
      await bb.setDisputeResolver(await resolver.getAddress());
      await bb.setReputation(reputationAddr);
      await merkleTree.authorise(bbAddr);
      await vault.setBugBountyProgram(bbAddr);
      await vault.setConfidentialPayouts(await payouts.getAddress());
      await vault.setDisputeResolver(await resolver.getAddress());
      await payouts.setMerkleTree(await merkleTree.getAddress());
      await payouts.setVault(await vault.getAddress());
      await resolver.setBugBountyProgram(bbAddr);
      await resolver.setProgramArbiters(PID, [s[3].address, s[4].address, s[5].address]);
      await reputation.setBugBountyProgram(bbAddr);

      await cUSDT.mint(s[1].address, 100_000n * D6);
      await cUSDT.connect(s[1]).approve(await vault.getAddress(), 100_000n * D6);
      await vault.connect(s[1]).deposit(PID, 50_000n * D6);
    });

    it("vault available decreases and locked increases after approve", async () => {
      const tx = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid);
      const bounty = 5_000n * D6;
      await bb.connect(s[1]).approveReport(sid, bounty, 2, "0x");
      expect(await vault.getLockedBalance(PID)).to.equal(bounty);
      expect(await vault.getAvailableBalance(PID)).to.equal(50_000n * D6 - bounty);
    });

    it("anti-rug: admin cannot initiate withdrawal exceeding available balance", async () => {
      const tx = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid);
      const bounty = 30_000n * D6;
      await bb.connect(s[1]).approveReport(sid, bounty, 2, "0x");
      // Available = 50k-30k = 20k. Admin tries to withdraw 50k → revert
      await expect(
        vault.connect(s[1]).initiateWithdrawal(PID, 50_000n * D6)
      ).to.be.revertedWith("Insufficient available");
    });

    it("merkle nextIndex: 1 after submit, 2 after approve", async () => {
      const tx = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      expect(await merkleTree.nextIndex()).to.equal(1);
      await bb.connect(s[1]).reviewReport(sid);
      await bb.connect(s[1]).approveReport(sid, 1_000n * D6, 2, "0x");
      expect(await merkleTree.nextIndex()).to.equal(2);
    });

    it("FHE: critical severity emits CriticalReportFlagged", async () => {
      const input = fhevm.createEncryptedInput(bbAddr, s[2].address);
      input.add8(1); // impactType
      input.add8(3); // severity = Critical
      const { handles, inputProof } = await input.encrypt();
      await expect(
        bb.connect(s[2]).submitReportWithFHE(
          commitment, ethers.toUtf8Bytes("P"), ethers.toUtf8Bytes("0xABC"),
          handles[0], handles[1], inputProof,
          ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x",
        )
      ).to.emit(bb, "CriticalReportFlagged");
    });

    it("multiple reports: independent IDs and both Pending", async () => {
      const c2 = "0xbbbbccccddddeeee0000111122223333444455556666777788889999aaaabbbb";
      const tx1 = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const tx2 = await bb.connect(s[2]).submitReport(c2, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid1 = ((await tx1.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      const sid2 = ((await tx2.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      expect(sid1).to.not.equal(sid2);
      expect((await bb.getSubmissionMeta(sid1))[1]).to.equal(0n);
      expect((await bb.getSubmissionMeta(sid2))[1]).to.equal(0n);
    });

    it("reputation: Critical=100 score after approve — FHE user decrypt", async () => {
      const tx = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid);
      await bb.connect(s[1]).approveReport(sid, 5_000n * D6, 3, "0x"); // severity=3 Critical
      // Allow score decrypt (caller = commitment owner, but for test use s[0] which is reputation.bugBountyProgram)
      await reputation.connect(s[0]).allowScoreDecrypt(commitment);
      const handle = await reputation.connect(s[0]).getMyScoreHandle(commitment);
      const score = await fhevm.userDecryptEuint(FhevmType.euint32, handle, reputationAddr, s[0]);
      expect(score).to.equal(100n); // Critical = 100 points
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step-by-step: dispute-flow scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe("Step-by-step: dispute flow", function () {
    let cUSDT: any, bb: any, bbAddr: string, vault: any, resolver: any, resolverAddr: string;
    let merkleTree: any;
    const commitment = "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";
    const PID = 0;

    beforeEach(async function () {
      if (!fhevm.isMock) this.skip();
      cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy(); await cUSDT.waitForDeployment();
      bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, PID); await bb.waitForDeployment();
      bbAddr = await bb.getAddress();
      vault = await (await ethers.getContractFactory("BountyVault")).deploy(await cUSDT.getAddress(), s[1].address, PID); await vault.waitForDeployment();
      const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
      merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() }
      })).deploy(20); await merkleTree.waitForDeployment();
      resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
      resolverAddr = await resolver.getAddress();

      await bb.setVault(await vault.getAddress());
      await bb.setMerkleTree(await merkleTree.getAddress());
      await bb.setDisputeResolver(resolverAddr);
      await merkleTree.authorise(bbAddr);
      await vault.setBugBountyProgram(bbAddr);
      await vault.setDisputeResolver(resolverAddr);
      await resolver.setBugBountyProgram(bbAddr);
      // Intentionally skip resolver.setVault to avoid unlockFunds on never-locked reports
      await resolver.setProgramArbiters(PID, [s[3].address, s[4].address, s[5].address]);

      await cUSDT.mint(s[1].address, 100_000n * D6);
      await cUSDT.connect(s[1]).approve(await vault.getAddress(), 100_000n * D6);
      await vault.connect(s[1]).deposit(PID, 50_000n * D6);
    });

    async function submitAndReject(): Promise<string> {
      const tx = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid);
      await bb.connect(s[1]).rejectReport(sid, "0x");
      return sid;
    }

    it("reporter wins dispute: overrideApprove → status Approved (2)", async () => {
      const sid = await submitAndReject();
      const tx = await resolver.connect(s[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      await resolver.connect(s[3]).submitVote(disputeId, 1, "0x"); // ForReporter
      await resolver.connect(s[4]).submitVote(disputeId, 1, "0x"); // ForReporter
      await resolver.resolveDispute(disputeId);
      await resolver.executeOutcome(disputeId, 5_000n * D6, 3);
      expect((await bb.getSubmissionMeta(sid))[1]).to.equal(2n); // Approved
    });

    it("admin wins dispute: unfreezeReport → report not frozen", async () => {
      const sid = await submitAndReject();
      const tx = await resolver.connect(s[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      await resolver.connect(s[3]).submitVote(disputeId, 2, "0x"); // ForAdmin
      await resolver.connect(s[4]).submitVote(disputeId, 2, "0x"); // ForAdmin
      await resolver.resolveDispute(disputeId);
      await resolver.executeOutcome(disputeId, 0, 0); // admin wins
      // frozen = false after unfreezeReport
      expect((await bb.getSubmissionMeta(sid))[3]).to.be.false;
    });

    it("OutcomeExecuted event: reporterWon=true when reporter wins", async () => {
      const sid = await submitAndReject();
      const tx = await resolver.connect(s[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      await resolver.connect(s[3]).submitVote(disputeId, 1, "0x");
      await resolver.connect(s[4]).submitVote(disputeId, 1, "0x");
      await resolver.resolveDispute(disputeId);
      await expect(resolver.executeOutcome(disputeId, 5_000n * D6, 3))
        .to.emit(resolver, "OutcomeExecuted").withArgs(disputeId, true);
    });

    it("dispute status transitions: Voting → Resolved → Executed", async () => {
      const sid = await submitAndReject();
      const tx = await resolver.connect(s[2]).raiseDispute(sid, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(1); // Voting
      await resolver.connect(s[3]).submitVote(disputeId, 1, "0x");
      await resolver.connect(s[4]).submitVote(disputeId, 1, "0x");
      await resolver.resolveDispute(disputeId);
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
      await resolver.executeOutcome(disputeId, 5_000n * D6, 2);
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(3); // Executed
    });

    it("locked funds remain after a different dispute admin win (vault guarded)", async () => {
      // Approve first report → locks funds
      const tx0 = await bb.connect(s[2]).submitReport(commitment, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid0 = ((await tx0.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid0);
      const bounty = 10_000n * D6;
      await bb.connect(s[1]).approveReport(sid0, bounty, 2, "0x");
      expect(await vault.getLockedBalance(PID)).to.equal(bounty);

      // Second report: submit → reject → dispute → admin wins
      const c2 = "0xbbbbccccddddeeee0000111122223333444455556666777788889999aaaabbbb";
      const tx2 = await bb.connect(s[2]).submitReport(c2, ethers.toUtf8Bytes("P"), "0x01", ethers.toUtf8Bytes("T"), ethers.toUtf8Bytes("D"), ethers.toUtf8Bytes("P"), "0x", "0x");
      const sid2 = ((await tx2.wait())?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any).args[0];
      await bb.connect(s[1]).reviewReport(sid2);
      await bb.connect(s[1]).rejectReport(sid2, "0x");
      const tx3 = await resolver.connect(s[2]).raiseDispute(sid2, ethers.toUtf8Bytes("R"), ethers.toUtf8Bytes("E"), "0x");
      const disputeId = ((await tx3.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      await resolver.connect(s[3]).submitVote(disputeId, 2, "0x");
      await resolver.connect(s[4]).submitVote(disputeId, 2, "0x");
      await resolver.resolveDispute(disputeId);
      // Admin wins → unfreezeReport (no vault.unlockFunds since resolver has no vault set)
      await resolver.executeOutcome(disputeId, 0, 0);
      // First report's locked funds unaffected
      expect(await vault.getLockedBalance(PID)).to.equal(bounty);
      // Second report unfrozen
      expect((await bb.getSubmissionMeta(sid2))[3]).to.be.false;
    });
  });
});
