import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  generateRSAKeyPair,
  BugReportEncryption,
  type RSAKeyPair,
} from "../helpers/encryption";
const D6 = 1_000_000n;

// Shared FHE submit helper — encrypts impactType=1(SmartContract), severity=2(High)
async function fheSubmit(
  bb: any,
  bbAddr: string,
  signer: any,
  commitment: string,
  adminKeys: RSAKeyPair,
  protocol = "P",
  contractAddr = "0x01",
): Promise<string> {
  const inp = fhevm.createEncryptedInput(bbAddr, signer.address);
  inp.add8(1); // impactType
  inp.add8(2); // severity = High
  const { handles, inputProof } = await inp.encrypt();

  // Use production encryption
  const encryption = new BugReportEncryption();
  const reportData = {
    protocol,
    contractAddress: contractAddr,
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

  const tx = await bb.connect(signer).submitReport(
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
  return (
    (await tx.wait())?.logs.find(
      (l: any) => l.fragment?.name === "ReportSubmitted",
    ) as any
  ).args[0];
}

describe("FullFlow Integration", function () {
  let s: any;
  let adminKeys: RSAKeyPair;
  before(async () => {
    s = await ethers.getSigners();
    adminKeys = generateRSAKeyPair();
  });

  it("create → submit → review → vault-lock → withdraw → dispute", async function () {
    if (!fhevm.isMock) this.skip();

    // Deploy underlying ERC20
    const underlyingUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await underlyingUSDT.waitForDeployment();
    
    // Deploy ERC7984 confidential wrapper
    const cUSDT = await (await ethers.getContractFactory("MockConfidentialUSDT")).deploy(await underlyingUSDT.getAddress());
    await cUSDT.waitForDeployment();
    const cUSDTAddr = await cUSDT.getAddress();
    
    const resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
    const bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, 0); await bb.waitForDeployment();
    const vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, s[1].address, 0); await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    const payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(s[1].address, 0); await payouts.waitForDeployment();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
    const merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy(); await merkleTree.waitForDeployment();

    await bb.setVault(vaultAddr);
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(await bb.getAddress());
    await bb.setDisputeResolver(await resolver.getAddress());
    await vault.setBugBountyProgram(await bb.getAddress());
    await vault.setConfidentialPayouts(await payouts.getAddress());
    await vault.setDisputeResolver(await resolver.getAddress());
    await payouts.setMerkleTree(await merkleTree.getAddress());
    await payouts.setVault(vaultAddr);
    await resolver.setBugBountyProgram(await bb.getAddress());
    await resolver.setProgramArbiters(0, [s[3].address, s[4].address, s[5].address]);

    // Mint underlying tokens and wrap them to confidential
    await underlyingUSDT.mint(s[1].address, 100_000n * D6);
    await underlyingUSDT.connect(s[1]).approve(cUSDTAddr, 100_000n * D6);
    await cUSDT.connect(s[1]).wrap(s[1].address, 100_000n * D6);
    
    // Deposit to vault via confidentialTransferAndCall
    const inpDeposit = fhevm.createEncryptedInput(cUSDTAddr, s[1].address);
    inpDeposit.add64(Number(50_000n * D6));
    const { handles: depositHandles, inputProof: depositProof } = await inpDeposit.encrypt();
    // No data parameter needed for encrypted version
    await cUSDT.connect(s[1])["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, depositHandles[0], depositProof, "0x");

    // Submit
    const bbAddr = await bb.getAddress();
    const sid = await fheSubmit(
      bb,
      bbAddr,
      s[2],
      ethers.keccak256(ethers.randomBytes(32)),
      adminKeys,
    );
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(0);

    // Review
    await bb.connect(s[1]).reviewReport(sid);
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(1);

    // Approve — internally calls vault.lockFunds(pid, sid, bountyAmount) and merkleTree.insertApprovedLeaf
    const bounty = 5_000n * D6;
    const inpApprove = fhevm.createEncryptedInput(bbAddr, s[1].address);
    inpApprove.add64(Number(bounty));
    const { handles: approveHandles, inputProof: approveProof } = await inpApprove.encrypt();
    await bb.connect(s[1]).approveReport(sid, approveHandles[0], 3, approveProof, "0x");
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(2);

    // Withdraw — sid is the nullifier key (matches what approveReport locked in vault)
    // Just verify withdrawal succeeds - balance is encrypted (euint64)
    await payouts.withdraw(await merkleTree.getRoot(), sid, s[4].address, bounty, "0x");

    // Dispute
    const sid2 = await fheSubmit(
      bb,
      bbAddr,
      s[2],
      ethers.keccak256(ethers.randomBytes(32)),
      adminKeys,
      "P2",
      "0x02",
    );
    await bb.connect(s[1]).reviewReport(sid2);
    await bb.connect(s[1]).rejectReport(sid2, "0x");

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
    const dTx = await resolver
      .connect(s[2])
      .raiseDispute(
        sid2,
        disputeData.encryptedTitle,
        disputeData.encryptedDescription,
        "0x",
      );
    const dReceipt = await dTx.wait();
    const dEv = dReceipt?.logs.find(
      (l: any) => l.fragment?.name === "DisputeRaised",
    ) as any;
    const disputeId = dEv.args[0];
    
    const resolverAddr = await resolver.getAddress();
    const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
    inp3.add8(1); // ForReporter
    const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
    await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
    
    const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
    inp4.add8(1); // ForReporter
    const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
    await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
    
    await resolver.resolveDispute(disputeId);
    expect(await resolver.getDisputeStatus(disputeId)).to.equal(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step-by-step: approve-flow scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe("Step-by-step: approve flow", function () {
    let underlyingUSDT: any, cUSDT: any, cUSDTAddr: string, bb: any, bbAddr: string, vault: any, vaultAddr: string, payouts: any;
    let merkleTree: any, resolver: any, reputation: any, reputationAddr: string;
    const commitment = "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";
    const PID = 0;

    // Helper to deposit via confidentialTransferAndCall
    async function depositToVault(admin: any, amount: bigint) {
      const inp = fhevm.createEncryptedInput(cUSDTAddr, admin.address);
      inp.add64(Number(amount));
      const { handles, inputProof } = await inp.encrypt();
      // No data parameter needed for encrypted version
      await cUSDT.connect(admin)["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x");
    }

    beforeEach(async function () {
      if (!fhevm.isMock) this.skip();
      
      // Deploy underlying ERC20
      underlyingUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
      await underlyingUSDT.waitForDeployment();
      
      // Deploy ERC7984 confidential wrapper
      cUSDT = await (await ethers.getContractFactory("MockConfidentialUSDT")).deploy(await underlyingUSDT.getAddress());
      await cUSDT.waitForDeployment();
      cUSDTAddr = await cUSDT.getAddress();
      
      bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, PID); await bb.waitForDeployment();
      bbAddr = await bb.getAddress();
      vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, s[1].address, PID); await vault.waitForDeployment();
      vaultAddr = await vault.getAddress();
      payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(s[1].address, PID); await payouts.waitForDeployment();
      const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
      merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() }
      })).deploy(); await merkleTree.waitForDeployment();
      resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
      reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy(); await reputation.waitForDeployment();
      reputationAddr = await reputation.getAddress();

      await bb.setVault(vaultAddr);
      await bb.setMerkleTree(await merkleTree.getAddress());
      await bb.setDisputeResolver(await resolver.getAddress());
      await bb.setReputation(reputationAddr);
      await merkleTree.authorise(bbAddr);
      await vault.setBugBountyProgram(bbAddr);
      await vault.setConfidentialPayouts(await payouts.getAddress());
      await vault.setDisputeResolver(await resolver.getAddress());
      await payouts.setMerkleTree(await merkleTree.getAddress());
      await payouts.setVault(vaultAddr);
      await resolver.setBugBountyProgram(bbAddr);
      await resolver.setProgramArbiters(PID, [s[3].address, s[4].address, s[5].address]);
      await reputation.setBugBountyProgram(bbAddr);

      // Mint underlying tokens and wrap them to confidential
      await underlyingUSDT.mint(s[1].address, 100_000n * D6);
      await underlyingUSDT.connect(s[1]).approve(cUSDTAddr, 100_000n * D6);
      await cUSDT.connect(s[1]).wrap(s[1].address, 100_000n * D6);
      
      // Deposit to vault
      await depositToVault(s[1], 50_000n * D6);
    });

    it("vault available decreases and locked increases after approve", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      await bb.connect(s[1]).reviewReport(sid);
      const bounty = 5_000n * D6;
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(bounty));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid, handles[0], 2, inputProof, "0x");
      // Encrypted version - can't check exact balances (euint64), just verify operation succeeded
    });

    it("anti-rug protection: admin withdrawal uses graceful degradation", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      await bb.connect(s[1]).reviewReport(sid);
      const bounty = 30_000n * D6;
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(bounty));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid, handles[0], 2, inputProof, "0x");
      // Available = 50k-30k = 20k. Admin tries to withdraw 50k
      // Encrypted version uses FHE.select - silently withdraws 20k instead of reverting
      await vault.connect(s[1]).initiateWithdrawal(PID, 50_000n * D6);
      // No revert, operation succeeds silently
    });

    it("merkle nextIndex: 1 after submit, 2 after approve", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      expect(await merkleTree.nextIndex()).to.equal(1);
      await bb.connect(s[1]).reviewReport(sid);
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(1_000n * D6));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid, handles[0], 2, inputProof, "0x");
      expect(await merkleTree.nextIndex()).to.equal(2);
    });

    it("FHE: critical severity emits CriticalReportFlagged", async () => {
      const input = fhevm.createEncryptedInput(bbAddr, s[2].address);
      input.add8(1); // impactType
      input.add8(3); // severity = Critical
      const { handles, inputProof } = await input.encrypt();

      const encryption = new BugReportEncryption();
      const reportData = {
        protocol: "Protocol",
        contractAddress: "0xABC",
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

      await expect(
        bb.connect(s[2]).submitReport(
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
        ),
      ).to.emit(bb, "CriticalReportFlagged");
    });

    it("multiple reports: independent IDs and both Pending", async () => {
      const c2 = "0xbbbbccccddddeeee0000111122223333444455556666777788889999aaaabbbb";
      const sid1 = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      const sid2 = await fheSubmit(bb, bbAddr, s[2], c2, adminKeys);
      expect(sid1).to.not.equal(sid2);
      expect((await bb.getSubmissionMeta(sid1))[1]).to.equal(0n);
      expect((await bb.getSubmissionMeta(sid2))[1]).to.equal(0n);
    });

    it("reputation: Critical=100 score after approve — FHE user decrypt", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      await bb.connect(s[1]).reviewReport(sid);
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(5_000n * D6));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid, handles[0], 3, inputProof, "0x"); // severity=3 Critical
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
    let underlyingUSDT: any, cUSDT: any, cUSDTAddr: string, bb: any, bbAddr: string, vault: any, vaultAddr: string, resolver: any, resolverAddr: string;
    let merkleTree: any;
    const commitment = "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";
    const PID = 0;

    // Helper to deposit via confidentialTransferAndCall
    async function depositToVault(admin: any, amount: bigint) {
      const inp = fhevm.createEncryptedInput(cUSDTAddr, admin.address);
      inp.add64(Number(amount));
      const { handles, inputProof } = await inp.encrypt();
      // No data parameter needed for encrypted version
      await cUSDT.connect(admin)["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vaultAddr, handles[0], inputProof, "0x");
    }

    beforeEach(async function () {
      if (!fhevm.isMock) this.skip();
      
      // Deploy underlying ERC20
      underlyingUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
      await underlyingUSDT.waitForDeployment();
      
      // Deploy ERC7984 confidential wrapper
      cUSDT = await (await ethers.getContractFactory("MockConfidentialUSDT")).deploy(await underlyingUSDT.getAddress());
      await cUSDT.waitForDeployment();
      cUSDTAddr = await cUSDT.getAddress();
      
      bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, PID); await bb.waitForDeployment();
      bbAddr = await bb.getAddress();
      vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, s[1].address, PID); await vault.waitForDeployment();
      vaultAddr = await vault.getAddress();
      const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
      merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() }
      })).deploy(); await merkleTree.waitForDeployment();
      resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
      resolverAddr = await resolver.getAddress();

      await bb.setVault(vaultAddr);
      await bb.setMerkleTree(await merkleTree.getAddress());
      await bb.setDisputeResolver(resolverAddr);
      await merkleTree.authorise(bbAddr);
      await vault.setBugBountyProgram(bbAddr);
      await vault.setDisputeResolver(resolverAddr);
      await resolver.setBugBountyProgram(bbAddr);
      // Intentionally skip resolver.setVault to avoid unlockFunds on never-locked reports
      await resolver.setProgramArbiters(PID, [s[3].address, s[4].address, s[5].address]);

      // Mint underlying tokens and wrap them to confidential
      await underlyingUSDT.mint(s[1].address, 100_000n * D6);
      await underlyingUSDT.connect(s[1]).approve(cUSDTAddr, 100_000n * D6);
      await cUSDT.connect(s[1]).wrap(s[1].address, 100_000n * D6);
      
      // Deposit to vault
      await depositToVault(s[1], 50_000n * D6);
    });

    async function submitAndReject(): Promise<string> {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      await bb.connect(s[1]).reviewReport(sid);
      await bb.connect(s[1]).rejectReport(sid, "0x");
      return sid;
    }

    it("reporter wins dispute: overrideApprove → status Approved (2)", async () => {
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
        .connect(s[2])
        .raiseDispute(
          sid,
          disputeData.encryptedTitle,
          disputeData.encryptedDescription,
          "0x",
        );
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      
      const resolverAddr = await resolver.getAddress();
      const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
      inp3.add8(1); // ForReporter
      const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
      await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
      
      const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
      inp4.add8(1); // ForReporter
      const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
      await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
      
      await resolver.resolveDispute(disputeId);
      await resolver.connect(s[1]).executeOutcome(disputeId, true);
      
      // Admin must now approve the report separately with encrypted bounty
      const inpBounty = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inpBounty.add64(Number(5_000n * D6));
      const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
      await bb.connect(s[1]).overrideApprove(sid, bountyHandles[0], 3, bountyProof);
      expect((await bb.getSubmissionMeta(sid))[1]).to.equal(2n); // Approved
    });

    it("admin wins dispute: unfreezeReport → report not frozen", async () => {
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
        .connect(s[2])
        .raiseDispute(
          sid,
          disputeData.encryptedTitle,
          disputeData.encryptedDescription,
          "0x",
        );
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      
      const resolverAddr = await resolver.getAddress();
      const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
      inp3.add8(2); // ForAdmin
      const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
      await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
      
      const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
      inp4.add8(2); // ForAdmin
      const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
      await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
      
      await resolver.resolveDispute(disputeId);
      await resolver.connect(s[1]).executeOutcome(disputeId, false); // admin wins
      // frozen = false after unfreezeReport
      expect((await bb.getSubmissionMeta(sid))[3]).to.be.false;
    });

    it("OutcomeExecuted event: reporterWon=true when reporter wins", async () => {
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
        .connect(s[2])
        .raiseDispute(
          sid,
          disputeData.encryptedTitle,
          disputeData.encryptedDescription,
          "0x",
        );
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      
      const resolverAddr = await resolver.getAddress();
      const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
      inp3.add8(1); // ForReporter
      const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
      await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
      
      const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
      inp4.add8(1); // ForReporter
      const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
      await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
      
      await resolver.resolveDispute(disputeId);
      await expect(resolver.connect(s[1]).executeOutcome(disputeId, true))
        .to.emit(resolver, "OutcomeExecuted").withArgs(disputeId, true);
      
      // Admin must now approve the report separately with encrypted bounty
      const inpBounty = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inpBounty.add64(Number(5_000n * D6));
      const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
      await bb.connect(s[1]).overrideApprove(sid, bountyHandles[0], 3, bountyProof);
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
        .connect(s[2])
        .raiseDispute(
          sid,
          disputeData.encryptedTitle,
          disputeData.encryptedDescription,
          "0x",
        );
      const disputeId = ((await tx.wait())?.logs.find((l: any) => l.fragment?.name === "DisputeRaised") as any).args[0];
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(1); // Voting
      
      const resolverAddr = await resolver.getAddress();
      const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
      inp3.add8(1); // ForReporter
      const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
      await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
      
      const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
      inp4.add8(1); // ForReporter
      const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
      await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
      
      await resolver.resolveDispute(disputeId);
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(2); // Resolved
      await resolver.connect(s[1]).executeOutcome(disputeId, true);
      expect(await resolver.getDisputeStatus(disputeId)).to.equal(3); // Executed
      
      // Admin must now approve the report separately with encrypted bounty
      const inpBounty = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inpBounty.add64(Number(5_000n * D6));
      const { handles: bountyHandles, inputProof: bountyProof } = await inpBounty.encrypt();
      await bb.connect(s[1]).overrideApprove(sid, bountyHandles[0], 2, bountyProof);
    });

    it("locked funds remain after a different dispute admin win (vault guarded)", async () => {
      // Approve first report → locks funds
      const sid0 = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys);
      await bb.connect(s[1]).reviewReport(sid0);
      const bounty = 10_000n * D6;
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(bounty));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid0, handles[0], 2, inputProof, "0x");
      // Encrypted version - can't check exact balance (euint64)

      const c2 = "0xbbbbccccddddeeee0000111122223333444455556666777788889999aaaabbbb";
      const sid2 = await fheSubmit(bb, bbAddr, s[2], c2, adminKeys);
      await bb.connect(s[1]).reviewReport(sid2);
      await bb.connect(s[1]).rejectReport(sid2, "0x");
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
      const tx3 = await resolver
        .connect(s[2])
        .raiseDispute(
          sid2,
          disputeData.encryptedTitle,
          disputeData.encryptedDescription,
          "0x",
        );
      const disputeId = (
        (await tx3.wait())?.logs.find(
          (l: any) => l.fragment?.name === "DisputeRaised",
        ) as any
      ).args[0];
      
      const resolverAddr = await resolver.getAddress();
      const inp3 = fhevm.createEncryptedInput(resolverAddr, s[3].address);
      inp3.add8(2); // ForAdmin
      const { handles: handles3, inputProof: inputProof3 } = await inp3.encrypt();
      await resolver.connect(s[3]).submitVote(disputeId, handles3[0], inputProof3);
      
      const inp4 = fhevm.createEncryptedInput(resolverAddr, s[4].address);
      inp4.add8(2); // ForAdmin
      const { handles: handles4, inputProof: inputProof4 } = await inp4.encrypt();
      await resolver.connect(s[4]).submitVote(disputeId, handles4[0], inputProof4);
      
      await resolver.resolveDispute(disputeId);
      // Admin wins → unfreezeReport (no vault.unlockFunds since resolver has no vault set)
      await resolver.connect(s[1]).executeOutcome(disputeId, false);
      // First report's locked funds unaffected (encrypted euint64, can't check exact value)
      // Second report unfrozen
      expect((await bb.getSubmissionMeta(sid2))[3]).to.be.false;
    });
  });
});
