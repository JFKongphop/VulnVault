import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("BugBountyProgram", function () {
  let signers: any, bb: any, bbAddr: string, merkleTree: any;

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(signers[1].address, 0);
    await bb.waitForDeployment();
    bbAddr = await bb.getAddress();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy(20);
    await merkleTree.waitForDeployment();
    await merkleTree.authorise(bbAddr);
    await bb.connect(signers[1]).setMerkleTree(await merkleTree.getAddress());
  });

  const commitment = "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";

  // ── Plain submit (zero FHE fields) — used by tests not focusing on FHE values
  async function submit(): Promise<string> {
    const tx = await bb.connect(signers[2]).submitReport(
      commitment,
      ethers.toUtf8Bytes("Uniswap V3"),
      ethers.toUtf8Bytes("0xABC"),
      ethers.toUtf8Bytes("Reentrancy"),
      ethers.toUtf8Bytes("Description"),
      ethers.toUtf8Bytes("PoC"),
      "0x", "0x",
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted");
    return (event as any).args[0];
  }

  // ── FHE submit — encrypts impactType and severity on-chain via user inputs
  async function submitWithFHE(impactType: number, severity: number): Promise<string> {
    const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
    input.add8(impactType);
    input.add8(severity);
    const { handles, inputProof } = await input.encrypt();

    const tx = await bb.connect(signers[2]).submitReportWithFHE(
      commitment,
      ethers.toUtf8Bytes("Uniswap V3"),
      ethers.toUtf8Bytes("0xABC"),
      handles[0],   // externalEuint8: impactType
      handles[1],   // externalEuint8: severity
      inputProof,
      ethers.toUtf8Bytes("Reentrancy"),
      ethers.toUtf8Bytes("Description"),
      ethers.toUtf8Bytes("PoC"),
      "0x", "0x",
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "ReportSubmitted");
    return (event as any).args[0];
  }

  it("submits a report", async () => {
    const sid = await submit();
    expect(sid).to.not.be.empty;
  });

  it("submits a report with FHE-encrypted fields", async () => {
    const sid = await submitWithFHE(1, 3); // impactType=1, severity=Critical(3)
    expect(sid).to.not.be.empty;
  });

  it("stores report metadata", async () => {
    const sid = await submit();
    const [submittedAt, status] = await bb.getSubmissionMeta(sid);
    expect(status).to.equal(0); // Pending
  });

  it("admin reviews report (makes handles decryptable)", async () => {
    const sid = await submit();
    await expect(bb.connect(signers[1]).reviewReport(sid)).to.emit(bb, "ReportUnderReview");
    const [, status] = await bb.getSubmissionMeta(sid);
    expect(status).to.equal(1); // UnderReview
  });

  it("admin decrypts FHE severity after review", async () => {
    // Reporter submits with encrypted severity=2 (High)
    const sid = await submitWithFHE(1, 2);
    // Admin reviews — grants admin allow + makePubliclyDecryptable
    const reviewTx = await bb.connect(signers[1]).reviewReport(sid);
    const reviewReceipt = await reviewTx.wait();
    const reviewEv = reviewReceipt?.logs.find((l: any) => l.fragment?.name === "ReportUnderReview") as any;
    const severityHandle = reviewEv.args[2]; // severityHandle from event
    // Admin decrypts severity via userDecryptEuint (allow was granted in reviewReport)
    const decryptedSeverity = await fhevm.userDecryptEuint(FhevmType.euint8, severityHandle, bbAddr, signers[1]);
    expect(decryptedSeverity).to.equal(2n); // High
  });

  it("admin decrypts FHE impact type after review", async () => {
    const sid = await submitWithFHE(3, 1); // impactType=3, severity=Medium
    const reviewTx = await bb.connect(signers[1]).reviewReport(sid);
    const reviewReceipt = await reviewTx.wait();
    const reviewEv = reviewReceipt?.logs.find((l: any) => l.fragment?.name === "ReportUnderReview") as any;
    const impactHandle = reviewEv.args[1]; // impactTypeHandle from event
    const decryptedImpact = await fhevm.userDecryptEuint(FhevmType.euint8, impactHandle, bbAddr, signers[1]);
    expect(decryptedImpact).to.equal(3n); // impactType=3
  });

  it("admin approves report with bounty — verifies encrypted bounty", async () => {
    const bounty = 5_000n * 1_000_000n;
    const sid = await submitWithFHE(1, 2);
    await bb.connect(signers[1]).reviewReport(sid);
    const approveTx = await bb.connect(signers[1]).approveReport(sid, bounty, 2, "0x");
    const approveReceipt = await approveTx.wait();
    // approveReport calls FHE.makePubliclyDecryptable on bounty amount
    const approveEv = approveReceipt?.logs.find((l: any) => l.fragment?.name === "ReportApproved") as any;
    expect(approveEv.args[0]).to.equal(sid);
    // Decrypt bounty via public oracle (makePubliclyDecryptable was called)
    const bountyHandle = await bb.connect(signers[1]).getBountyHandle(sid);
    const decryptedBounty = await fhevm.publicDecryptEuint(FhevmType.euint64, bountyHandle);
    expect(decryptedBounty).to.equal(bounty);
    const [, status] = await bb.getSubmissionMeta(sid);
    expect(status).to.equal(2); // Approved
  });

  it("admin rejects report", async () => {
    const sid = await submit();
    await bb.connect(signers[1]).reviewReport(sid);
    await expect(bb.connect(signers[1]).rejectReport(sid, "0x")).to.emit(bb, "ReportRejected");
    const [, status] = await bb.getSubmissionMeta(sid);
    expect(status).to.equal(3); // Rejected
  });

  it("lists all submission IDs", async () => {
    await submit();
    await submit();
    expect((await bb.getAllSubmissionIds()).length).to.equal(2);
  });

  it("reverts non-admin review", async () => {
    await expect(bb.connect(signers[2]).reviewReport(ethers.ZeroHash)).to.be.revertedWith("Not admin");
  });

  it("reverts non-admin approve", async () => {
    await expect(bb.connect(signers[2]).approveReport(ethers.ZeroHash, 1000, 0, "0x")).to.be.revertedWith("Not admin");
  });

  it("reverts reviewing already-reviewed report", async () => {
    const sid = await submit();
    await bb.connect(signers[1]).reviewReport(sid);
    await expect(bb.connect(signers[1]).reviewReport(sid)).to.be.revertedWith("Already reviewed");
  });

  it("reverts approving non-UnderReview report", async () => {
    const sid = await submit();
    await expect(bb.connect(signers[1]).approveReport(sid, 1000, 0, "0x")).to.be.revertedWith("Not under review");
  });

  it("freezes and unfreezes report", async () => {
    const sid = await submit();
    await bb.setDisputeResolver(signers[0].address); // set to deployer so test can call
    await bb.freezeReport(sid);
    let [, , , frozen] = await bb.getSubmissionMeta(sid);
    expect(frozen).to.be.true;
    await bb.unfreezeReport(sid);
    [, , , frozen] = await bb.getSubmissionMeta(sid);
    expect(frozen).to.be.false;
  });

  it("reporter decrypts report via makePubliclyDecryptable", async () => {
    const sid = await submitWithFHE(1, 3); // severity=Critical
    const decryptTx = await bb.connect(signers[2]).decryptMyReport(sid);
    const decryptReceipt = await decryptTx.wait();
    const decryptEv = decryptReceipt?.logs.find((l: any) => l.fragment?.name === "ReportDecrypted") as any;
    // severity handle is made publicly decryptable — oracle can decrypt it
    const severityHandle = decryptEv.args[2];
    const decryptedSeverity = await fhevm.publicDecryptEuint(FhevmType.euint8, severityHandle);
    expect(decryptedSeverity).to.equal(3n); // Critical
  });

  it("gets report handles — non-zero after FHE submit", async () => {
    const sid = await submitWithFHE(2, 1);
    await bb.connect(signers[1]).reviewReport(sid); // allow admin to read handles
    const [impact, severity, bounty] = await bb.connect(signers[1]).getReportHandles(sid);
    expect(impact).to.not.equal(ethers.ZeroHash);
    expect(severity).to.not.equal(ethers.ZeroHash);
  });

  it("multiple submissions produce different IDs", async () => {
    const sid1 = await submit();
    const sid2 = await submit();
    expect(sid1).to.not.equal(sid2);
    expect((await bb.getSubmissionMeta(sid1))[1]).to.equal(0n); // Pending
    expect((await bb.getSubmissionMeta(sid2))[1]).to.equal(0n); // Pending
  });

  it("CriticalReportFlagged emitted for severity=3 FHE submit", async () => {
    const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
    input.add8(1); // impactType
    input.add8(3); // severity = Critical
    const { handles, inputProof } = await input.encrypt();
    await expect(
      bb.connect(signers[2]).submitReportWithFHE(
        commitment,
        ethers.toUtf8Bytes("Protocol"),
        ethers.toUtf8Bytes("0xABC"),
        handles[0], handles[1], inputProof,
        ethers.toUtf8Bytes("Reentrancy"),
        ethers.toUtf8Bytes("Description"),
        ethers.toUtf8Bytes("PoC"),
        "0x", "0x",
      )
    ).to.emit(bb, "CriticalReportFlagged");
  });

  it("cannot approve frozen report — reverts with Report frozen", async () => {
    const sid = await submit();
    await bb.connect(signers[1]).reviewReport(sid); // UnderReview
    await bb.setDisputeResolver(signers[0].address); // deployer acts as dispute resolver
    await bb.connect(signers[0]).freezeReport(sid);
    await expect(
      bb.connect(signers[1]).approveReport(sid, 1_000_000_000n, 2, "0x")
    ).to.be.revertedWith("Report frozen");
  });

  it("merkle nextIndex: 1 after submit, 2 after approve", async () => {
    const sid = await submit();
    expect(await merkleTree.nextIndex()).to.equal(1); // commitment inserted on submit
    await bb.connect(signers[1]).reviewReport(sid);
    await bb.connect(signers[1]).approveReport(sid, 0n, 2, "0x"); // vault not set → no lockFunds
    expect(await merkleTree.nextIndex()).to.equal(2); // approved leaf inserted
  });
});

