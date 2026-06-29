import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  generateRSAKeyPair,
  BugReportEncryption,
  type RSAKeyPair,
} from "./helpers/encryption";

describe("DisputeResolver", function () {
  let signers: any, resolver: any, bb: any, bbAddr: string;
  let adminKeys: RSAKeyPair;

  before(async () => {
    signers = await ethers.getSigners();
    adminKeys = generateRSAKeyPair();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await resolver.waitForDeployment();
    bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(signers[1].address, 0);
    await bb.waitForDeployment();
    bbAddr = await bb.getAddress();
    await resolver.setBugBountyProgram(bbAddr);
    await bb.setDisputeResolver(await resolver.getAddress());
    await resolver.setProgramArbiters(0, [signers[3].address, signers[4].address, signers[5].address]);
  });

  async function submitAndReject(): Promise<string> {
    const commitment = ethers.keccak256(ethers.randomBytes(32));
    const inp = fhevm.createEncryptedInput(bbAddr, signers[2].address);
    inp.add8(1); // impactType = Smart Contract
    inp.add8(2); // severity = High
    const { handles, inputProof } = await inp.encrypt();

    // Use production encryption
    const encryption = new BugReportEncryption();
    const reportData = {
      protocol: "Protocol",
      contractAddress: "0x01",
      title: "Title",
      description: "Description",
      poc: "PoC",
      gistLink: "",
      attachments: "",
    };
    const encryptedReport = encryption.encryptReport(reportData);
    const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
      adminKeys.publicKey,
    );

    const tx = await bb.connect(signers[2]).submitReport(
      commitment,
      encryptedReport.encryptedProtocol,
      encryptedReport.encryptedContractAddress,
      handles[0],
      handles[1],
      inputProof,
      encryptedReport.encryptedTitle,
      encryptedReport.encryptedDescription,
      encryptedReport.encryptedPoC,
      encryptedReport.encryptedGistLink,
      encryptedReport.encryptedAttachments,
      encryptedSymmetricKey,
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
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "Reason",
      description: "Evidence",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    await expect(
      resolver.connect(signers[2]).raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      ),
    ).to.emit(resolver, "DisputeRaised");
  });

  it("votes and resolves — FHE tally: 2 ForReporter, 0 ForAdmin", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver.connect(signers[2]).raiseDispute(
      sid,
      disputeData.encryptedTitle,
      disputeData.encryptedDescription,
      "0x",
    );
    const receipt = await tx.wait();
    const ev = receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised");
    const disputeId = (ev as any).args[0];

    // Two arbiters vote ForReporter (1) — encrypted client-side via TFHE
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);

    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);

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
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver.connect(signers[2]).raiseDispute(
      sid,
      disputeData.encryptedTitle,
      disputeData.encryptedDescription,
      "0x",
    );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];

    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(2); // ForAdmin
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);

    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(2); // ForAdmin
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);

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
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp2 = fhevm.createEncryptedInput(resolverAddr, signers[2].address);
    inp2.add8(1); // ForReporter
    const { handles: handles2, inputProof: inputProof2 } = await inp2.encrypt();
    await expect(resolver.connect(signers[2]).submitVote(disputeId, handles2[0], inputProof2)).to.be.reverted;
  });

  it("reverts double vote", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3a = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3a.add8(1); // ForReporter
    const { handles: handles3a, inputProof: inputProof3a } = await inp3a.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3a[0], inputProof3a);
    
    const inp3b = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3b.add8(2); // ForAdmin
    const { handles: handles3b, inputProof: inputProof3b } = await inp3b.encrypt();
    await expect(resolver.connect(signers[3]).submitVote(disputeId, handles3b[0], inputProof3b)).to.be.reverted;
  });

  it("reverts dispute on non-rejected report", async () => {
    const commitment = ethers.keccak256(ethers.randomBytes(32));
    const inp = fhevm.createEncryptedInput(bbAddr, signers[2].address);
    inp.add8(1);
    inp.add8(2);
    const { handles, inputProof } = await inp.encrypt();

    const encryption = new BugReportEncryption();
    const reportData = {
      protocol: "Protocol",
      contractAddress: "0x01",
      title: "Title",
      description: "Description",
      poc: "PoC",
      gistLink: "",
      attachments: "",
    };
    const encryptedReport = encryption.encryptReport(reportData);
    const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
      adminKeys.publicKey,
    );

    const tx = await bb.connect(signers[2]).submitReport(
      commitment,
      encryptedReport.encryptedProtocol,
      encryptedReport.encryptedContractAddress,
      handles[0],
      handles[1],
      inputProof,
      encryptedReport.encryptedTitle,
      encryptedReport.encryptedDescription,
      encryptedReport.encryptedPoC,
      encryptedReport.encryptedGistLink,
      encryptedReport.encryptedAttachments,
      encryptedSymmetricKey,
    );
    const receipt = await tx.wait();
    const sid = (
      receipt?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted") as any
    ).args[0];

    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    await expect(
      resolver.connect(signers[2]).raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      ),
    ).to.be.reverted;
  });

  it("allows resolve after voting deadline", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    await time.increase(5 * 24 * 3600 + 1);
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
  });

  it("executes outcome for reporter win", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    await expect(resolver.connect(signers[1]).executeOutcome(disputeId, true)).to.emit(resolver, "OutcomeExecuted");
    
    // Admin must now approve the report separately with encrypted bounty
    const inpBounty = fhevm.createEncryptedInput(bbAddr, signers[1].address);
    inpBounty.add64(5_000n * 1_000_000n);
    const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
    await bb.connect(signers[1]).overrideApprove(sid, bountyHandles[0], 2, bountyProof);
  });

  it("voting deadline blocks late votes", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    await time.increase(5 * 24 * 3600 + 1); // past 5-day voting window
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await expect(
      resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3)
    ).to.be.revertedWith("Voting closed");
  });

  it("unanimous 3-of-3 ForReporter — FHE tally = 3", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    const inp5 = fhevm.createEncryptedInput(resolverAddr, signers[5].address);
    inp5.add8(1); // ForReporter (all voted → resolve)
    const { handles: handles5, inputProof: inputProof5 } = await inp5.encrypt();
    await resolver.connect(signers[5]).submitVote(disputeId, handles5[0], inputProof5);
    
    const tx2 = await resolver.resolveDispute(disputeId);
    const receipt2 = await tx2.wait();
    const ev = receipt2?.logs.find((l: any) => l.fragment?.name === "DisputeResolved");
    const forReporterHandle = (ev as any).args[1];
    expect(await fhevm.publicDecryptEuint(FhevmType.euint8, forReporterHandle)).to.equal(3n);
  });

  it("partial 2-of-3 vote: ForReporter=2 after 2 arbiters vote and deadline passes", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
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
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(2); // ForAdmin
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(2); // ForAdmin
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    await expect(
      resolver.connect(signers[1]).executeOutcome(disputeId, false)
    ).to.emit(resolver, "OutcomeExecuted").withArgs(disputeId, false);
  });

  it("reverts executeOutcome if dispute not yet resolved", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    // Don't resolve — try to execute directly
    await expect(resolver.connect(signers[1]).executeOutcome(disputeId, true)).to.be.revertedWith("Not yet resolved");
  });

  it("dispute status transitions: Voting → Resolved → Executed", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(1); // Voting
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
    await resolver.connect(signers[1]).executeOutcome(disputeId, true);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(3); // Executed
    
    // Admin must now approve the report separately with encrypted bounty
    const inpBounty = fhevm.createEncryptedInput(bbAddr, signers[1].address);
    inpBounty.add64(5_000n * 1_000_000n);
    const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
    await bb.connect(signers[1]).overrideApprove(sid, bountyHandles[0], 2, bountyProof);
  });

  it("getDisputeOutcome returns non-zero handles after resolve", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    const [status, forReporter, forAdmin, reporterWon] = await resolver.getDisputeOutcome(disputeId);
    expect(status).to.equal(2); // Resolved
    expect(forReporter).to.not.equal(ethers.ZeroHash);
    expect(forAdmin).to.not.equal(ethers.ZeroHash);
    expect(reporterWon).to.not.equal(ethers.ZeroHash);
  });

  it("reverts raising duplicate dispute on same submission", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    // After first raise, status = Disputed (not Rejected) → second raise reverts
    const disputeData2 = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R2",
      description: "E2",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    await expect(
      resolver.connect(signers[2]).raiseDispute(
        sid,
        disputeData2.encryptedTitle,
        disputeData2.encryptedDescription,
        "0x",
      ),
    ).to.be.revertedWith("Report not rejected");
  });

  it("markDisputed: submission status becomes Disputed (4) after raiseDispute", async () => {
    const sid = await submitAndReject();
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(3n); // Rejected
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(4n); // Disputed
  });

  it("reverts resolveDispute if already resolved", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    await expect(resolver.resolveDispute(disputeId)).to.be.revertedWith("Already resolved");
  });

  // ── UX View Functions Tests
  // ─────────────────────────────────────────────────────────────

  it("getDisputeInfo returns complete dispute details", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "Dispute Reason",
      description: "Evidence Details",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const [submissionId, programId, raisedAt, votingDeadline, status, arbiters] = await resolver.getDisputeInfo(disputeId);
    
    expect(submissionId).to.equal(sid);
    expect(programId).to.equal(0);
    expect(raisedAt).to.be.greaterThan(0);
    expect(votingDeadline).to.equal(raisedAt + (5n * 24n * 60n * 60n)); // VOTING_PERIOD = 5 days
    expect(status).to.equal(1); // Voting
    expect(arbiters).to.have.lengthOf(3);
    expect(arbiters[0]).to.equal(signers[3].address);
    expect(arbiters[1]).to.equal(signers[4].address);
    expect(arbiters[2]).to.equal(signers[5].address);
  });

  it("hasArbiterVoted returns false before vote, true after", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    // Before voting
    expect(await resolver.hasArbiterVoted(disputeId, signers[3].address)).to.be.false;
    
    // Submit vote
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    // After voting
    expect(await resolver.hasArbiterVoted(disputeId, signers[3].address)).to.be.true;
    expect(await resolver.hasArbiterVoted(disputeId, signers[4].address)).to.be.false;
  });

  it("getDisputeEvidence returns encrypted reason and evidence", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "Dispute Reason",
      description: "Evidence Details",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    const [encryptedReason, encryptedEvidence] = await resolver.getDisputeEvidence(disputeId);
    
    expect(encryptedReason).to.not.equal("0x");
    expect(encryptedEvidence).to.not.equal("0x");
    expect(encryptedReason.length).to.be.greaterThan(0);
    expect(encryptedEvidence.length).to.be.greaterThan(0);
  });

  it("getVoteCount returns correct count: 0 before votes, increases with each vote", async () => {
    const sid = await submitAndReject();
    const disputeEncryption = new BugReportEncryption();
    const disputeData = disputeEncryption.encryptReport({
      protocol: "",
      contractAddress: "",
      title: "R",
      description: "E",
      poc: "",
      gistLink: "",
      attachments: "",
    });
    const tx = await resolver
      .connect(signers[2])
      .raiseDispute(
        sid,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const receipt = await tx.wait();
    const disputeId = (receipt?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
    
    // Before any votes
    expect(await resolver.getVoteCount(disputeId)).to.equal(0);
    
    const resolverAddr = await resolver.getAddress();
    
    // First vote
    const inp3 = fhevm.createEncryptedInput(resolverAddr, signers[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(signers[3]).submitVote(disputeId, handles3[0], inputProof3);
    expect(await resolver.getVoteCount(disputeId)).to.equal(1);
    
    // Second vote
    const inp4 = fhevm.createEncryptedInput(resolverAddr, signers[4].address);
    inp4.add8(2); // ForAdmin
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(signers[4]).submitVote(disputeId, handles4[0], inputProof4);
    expect(await resolver.getVoteCount(disputeId)).to.equal(2);
    
    // Third vote
    const inp5 = fhevm.createEncryptedInput(resolverAddr, signers[5].address);
    inp5.add8(1); // ForReporter
    const { handles: handles5, inputProof: inputProof5 } = await inp5.encrypt();
    await resolver.connect(signers[5]).submitVote(disputeId, handles5[0], inputProof5);
    expect(await resolver.getVoteCount(disputeId)).to.equal(3);
  });

  // ── Setup Events Tests
  // ─────────────────────────────────────────────────────────────

  it("emits BugBountyProgramSet event when setting program", async () => {
    const newResolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await newResolver.waitForDeployment();
    
    await expect(newResolver.setBugBountyProgram(bbAddr))
      .to.emit(newResolver, "BugBountyProgramSet")
      .withArgs(bbAddr);
  });

  it("emits VaultSet event when setting vault", async () => {
    const mockToken = await (await ethers.getContractFactory("MockERC20")).deploy();
    await mockToken.waitForDeployment();
    const mockVault = await (await ethers.getContractFactory("BountyVault")).deploy(
      await mockToken.getAddress(),
      signers[1].address,
      0
    );
    await mockVault.waitForDeployment();
    const vaultAddr = await mockVault.getAddress();
    
    const newResolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await newResolver.waitForDeployment();
    
    await expect(newResolver.setVault(vaultAddr))
      .to.emit(newResolver, "VaultSet")
      .withArgs(vaultAddr);
  });

  it("emits ReputationSet event when setting reputation", async () => {
    const mockReputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy();
    await mockReputation.waitForDeployment();
    const reputationAddr = await mockReputation.getAddress();
    
    const newResolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await newResolver.waitForDeployment();
    
    await expect(newResolver.setReputation(reputationAddr))
      .to.emit(newResolver, "ReputationSet")
      .withArgs(reputationAddr);
  });

  it("emits ArbitersSet event when setting arbiters", async () => {
    const newResolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await newResolver.waitForDeployment();
    
    const arbiterAddresses = [signers[3].address, signers[4].address, signers[5].address];
    
    await expect(newResolver.setProgramArbiters(0, arbiterAddresses))
      .to.emit(newResolver, "ArbitersSet")
      .withArgs(0, arbiterAddresses);
  });

  it("updateProgramArbiters allows updating arbiters for existing program", async () => {
    const newArbiters = [signers[6].address, signers[7].address, signers[8].address];
    
    await expect(resolver.updateProgramArbiters(0, newArbiters))
      .to.emit(resolver, "ArbitersSet")
      .withArgs(0, newArbiters);
    
    // Verify arbiters were actually updated
    const firstArbiter = await resolver.programArbiters(0, 0);
    expect(firstArbiter).to.equal(signers[6].address);
  });

  it("updateProgramArbiters reverts if program not initialized", async () => {
    const newArbiters = [signers[6].address, signers[7].address, signers[8].address];
    
    await expect(
      resolver.updateProgramArbiters(999, newArbiters)
    ).to.be.revertedWith("Not initialized");
  });

  it("updateProgramArbiters reverts with <3 arbiters", async () => {
    const twoArbiters = [signers[6].address, signers[7].address];
    
    await expect(
      resolver.updateProgramArbiters(0, twoArbiters)
    ).to.be.revertedWith("Need at least 3 arbiters");
  });

  it("updateProgramArbiters replaces all arbiters completely", async () => {
    // Initially has signers[3,4,5]
    const initialFirst = await resolver.programArbiters(0, 0);
    expect(initialFirst).to.equal(signers[3].address);
    
    // Update to signers[6,7,8]
    const newArbiters = [signers[6].address, signers[7].address, signers[8].address];
    await resolver.updateProgramArbiters(0, newArbiters);
    
    // Verify all arbiters were replaced
    const first = await resolver.programArbiters(0, 0);
    const second = await resolver.programArbiters(0, 1);
    const third = await resolver.programArbiters(0, 2);
    
    expect(first).to.equal(signers[6].address);
    expect(second).to.equal(signers[7].address);
    expect(third).to.equal(signers[8].address);
  });
});

