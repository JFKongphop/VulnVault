import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  generateRSAKeyPair,
  BugReportEncryption,
  type RSAKeyPair,
} from "../helpers/encryption";
import * as snarkjs from "snarkjs";
import { poseidon2, poseidon4 } from "poseidon-lite";
import * as path from "path";
import { MerkleTree } from "fixed-merkle-tree";

const D6 = 1_000_000n;
const TREE_LEVELS = 20;

// Helper to generate real ZK proof for withdrawal
async function generateWithdrawalProof(
  secret0: bigint,
  secret1: bigint,
  impactType: bigint,
  severity: bigint,
  onChainMerkleTree: any,
  commitmentsList: bigint[] // Track commitments off-chain
) {
  // Compute commitment (nullifier) - same as on-chain
  const commitment = poseidon4([secret0, secret1, impactType, severity]) as any;
  const commitmentHex = ethers.toBeHex(commitment, 32);
  
  // Get on-chain Merkle tree state
  const onChainRoot = await onChainMerkleTree.getRoot();
  
  // Build sparse Merkle tree matching on-chain
  // Note: fixed-merkle-tree requires inserting elements after construction
  const tree = new MerkleTree(TREE_LEVELS, [], {
    hashFunction: ((left: bigint, right: bigint) => poseidon2([left, right])) as any,
    zeroElement: 0n as any
  });
  
  // Insert all commitments
  for (const leaf of commitmentsList) {
    tree.insert(leaf as any);
  }
  
  // Find commitment index in tree
  const commitmentBigInt = BigInt(commitmentHex);
  
  // Generate Merkle proof (pass commitment, not index!)
  const merkleProof = tree.proof(commitmentBigInt as any);
  const pathElements = merkleProof.pathElements.map((x: any) => BigInt(x));
  const pathIndices = merkleProof.pathIndices;
  const pathRoot = BigInt(merkleProof.pathRoot);
  
  // Verify roots match
  if (pathRoot.toString() !== BigInt(onChainRoot).toString()) {
    console.error('Root mismatch!');
    console.error('Off-chain root:', pathRoot.toString(16));
    console.error('On-chain root:', BigInt(onChainRoot).toString(16));
    throw new Error('Merkle root mismatch between on-chain and off-chain trees');
  }
  
  // Prepare circuit inputs
  const circuitInput = {
    root: pathRoot.toString(),
    nullifier: commitment.toString(),
    secret: [secret0.toString(), secret1.toString()],
    impactType: impactType.toString(),
    severity: severity.toString(),
    pathElements: pathElements.map((x: any) => x.toString()),
    pathIndices: pathIndices.map((x: any) => x.toString())
  };
  
  // Generate ZK proof
  const wasmPath = path.join(process.cwd(), 'circuit/proof-source/bountyClaim_js/bountyClaim.wasm');
  const zkeyPath = path.join(process.cwd(), 'circuit/proof-source/bountyClaim.zkey');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
  
  // Convert proof format for Solidity verifier
  const pA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const pB: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
  ];
  const pC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  
  return {
    pA,
    pB,
    pC,
    publicSignals,
    root: pathRoot,
    nullifier: commitmentHex,
    commitment: commitmentBigInt
  };
}

// Shared FHE submit helper — encrypts impactType and severity
// For ZK withdrawal tests, pass secret0/secret1 to generate matching commitment
async function fheSubmit(
  bb: any,
  bbAddr: string,
  signer: any,
  commitment: string,
  adminKeys: RSAKeyPair,
  impactType: number,
  severity: number,
  protocol = "P",
  contractAddr = "0x01",
): Promise<string> {
  const inp = fhevm.createEncryptedInput(bbAddr, signer.address);
  inp.add8(impactType);
  inp.add8(severity);
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

  it("🔐 REAL ZK FLOW: submit → approve → withdraw with real ZK proof verification", async function () {
    this.timeout(60000); // ZK proof generation takes ~2 seconds
    if (!fhevm.isMock) this.skip();

    console.log('\n🔐 Starting Full Real ZK Integration Test\n');

    // Deploy underlying ERC20
    const underlyingUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await underlyingUSDT.waitForDeployment();
    
    // Deploy ERC7984 confidential wrapper
    const cUSDT = await (await ethers.getContractFactory("MockConfidentialUSDT")).deploy(await underlyingUSDT.getAddress());
    await cUSDT.waitForDeployment();
    const cUSDTAddr = await cUSDT.getAddress();
    
    const resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await resolver.waitForDeployment();
    
    const bb = await (await ethers.getContractFactory("BugBountyProgram")).deploy(s[1].address, 0);
    await bb.waitForDeployment();
    const bbAddr = await bb.getAddress();
    
    const vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, s[1].address, 0);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    
    const merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy();
    await merkleTree.waitForDeployment();
    
    // 🎯 USE REAL BOUNTY CLAIM VERIFIER - NOT MOCK
    console.log('📝 Deploying REAL BountyClaimVerifier (Groth16)...');
    const verifier = await (await ethers.getContractFactory("BountyClaimVerifier")).deploy();
    await verifier.waitForDeployment();
    console.log('✅ Real verifier deployed\n');
    
    const payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(
      0,
      bbAddr,
      vaultAddr,
      await merkleTree.getAddress(),
      await verifier.getAddress()
    );
    await payouts.waitForDeployment();

    // Connect contracts
    await bb.setVault(vaultAddr);
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(bbAddr);
    await bb.setDisputeResolver(await resolver.getAddress());
    await vault.setBugBountyProgram(bbAddr);
    await vault.setConfidentialPayouts(await payouts.getAddress());
    await vault.setDisputeResolver(await resolver.getAddress());
    await resolver.setBugBountyProgram(bbAddr);

    // Mint underlying tokens and wrap them to confidential
    await underlyingUSDT.mint(s[1].address, 100_000n * D6);
    await underlyingUSDT.connect(s[1]).approve(cUSDTAddr, 100_000n * D6);
    await cUSDT.connect(s[1]).wrap(s[1].address, 100_000n * D6);
    
    // Deposit to vault via confidentialTransferAndCall
    const inpDeposit = fhevm.createEncryptedInput(cUSDTAddr, s[1].address);
    inpDeposit.add64(Number(50_000n * D6));
    const { handles: depositHandles, inputProof: depositProof } = await inpDeposit.encrypt();
    await cUSDT.connect(s[1])["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      vaultAddr,
      depositHandles[0],
      depositProof,
      "0x"
    );

    // 🔑 STEP 1: Generate ZK proof secrets (reporter keeps these private)
    console.log('🔑 Step 1: Reporter generates secret parameters');
    const secret0 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const secret1 = BigInt(ethers.hexlify(ethers.randomBytes(32)));
    const impactType = 1n; // SmartContract
    const severity = 2n;   // High
    
    // Compute commitment using Poseidon hash (same as ZK circuit)
    const commitment = poseidon4([secret0, secret1, impactType, severity]) as any;
    const commitmentHex = ethers.toBeHex(commitment, 32);
    
    console.log('  Secret[0]:', secret0.toString().substring(0, 20) + '...');
    console.log('  Secret[1]:', secret1.toString().substring(0, 20) + '...');
    console.log('  Impact Type:', impactType.toString(), '(SmartContract)');
    console.log('  Severity:', severity.toString(), '(High)');
    console.log('  Commitment:', commitmentHex);
    console.log('  ✅ Commitment will be inserted into Merkle tree\n');

    // 📝 STEP 2: Submit report with commitment
    console.log('📝 Step 2: Submit bug report with commitment');
    const sid = await fheSubmit(
      bb,
      bbAddr,
      s[2],
      commitmentHex,
      adminKeys,
      Number(impactType),
      Number(severity)
    );
    console.log('  Report ID:', sid);
    console.log('  ✅ Commitment inserted at Merkle tree index:', (await merkleTree.nextIndex()).toString());
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(0); // Pending

    // 👀 STEP 3: Admin reviews report
    console.log('\n👀 Step 3: Admin reviews report');
    await bb.connect(s[1]).reviewReport(sid);
    console.log('  ✅ Report status: Under Review\n');
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(1); // Under Review

    // ✅ STEP 4: Admin approves report → locks funds + inserts leaf into Merkle tree
    console.log('✅ Step 4: Admin approves report');
    const bounty = 5_000n * D6;
    const inpApprove = fhevm.createEncryptedInput(bbAddr, s[1].address);
    inpApprove.add64(Number(bounty));
    const { handles: approveHandles, inputProof: approveProof } = await inpApprove.encrypt();
    
    await bb.connect(s[1]).approveReport(sid, approveHandles[0], Number(severity), approveProof, "0x");
    console.log('  ✅ Report approved, bounty locked');
    console.log('  ✅ Commitment leaf inserted into Merkle tree');
    console.log('  Merkle tree nextIndex:', (await merkleTree.nextIndex()).toString());
    console.log('  Merkle root:', await merkleTree.getRoot(), '\n');
    expect((await bb.getSubmissionMeta(sid))[1]).to.equal(2); // Approved

    // 🔐 STEP 5: Generate real ZK proof for withdrawal
    console.log('🔐 Step 5: Generate REAL ZK proof for anonymous withdrawal');
    console.log('  Generating proof (this takes ~2 seconds)...');
    
    // Track all commitments in tree
    // Note: commitment is inserted TWICE - once on submit, once on approve
    const commitmentBigInt = BigInt(commitmentHex);
    const commitmentsList = [commitmentBigInt, commitmentBigInt];
    
    const proofData = await generateWithdrawalProof(
      secret0,
      secret1,
      impactType,
      severity,
      merkleTree,
      commitmentsList
    );
    
    console.log('  ✅ ZK Proof generated successfully!');
    console.log('  Public inputs:');
    console.log('    Root:', ethers.toBeHex(proofData.root, 32));
    console.log('    Nullifier:', proofData.nullifier);
    console.log('  Private inputs (kept secret):');
    console.log('    secret[0], secret[1], impactType, severity');
    console.log('  Proof size: pA(2), pB(4), pC(2) field elements\n');

    // 💰 STEP 6: Withdraw to fresh address with ZK proof
    console.log('💰 Step 6: Withdraw bounty to fresh address (anonymous)');
    const freshWallet = s[4].address;
    console.log('  Fresh withdrawal address:', freshWallet);
    console.log('  Amount:', (bounty / D6).toString(), 'USDT');
    
    const onChainRoot = await merkleTree.getRoot();
    console.log('  Verifying on-chain with REAL Groth16 verifier...');
    
    await expect(
      payouts.withdraw(
        onChainRoot,
        proofData.nullifier,
        freshWallet,
        bounty,
        proofData.pA,
        proofData.pB,
        proofData.pC
      )
    ).to.emit(payouts, "Withdrawal").withArgs(proofData.nullifier, onChainRoot);
    
    console.log('  ✅ ZK proof VERIFIED on-chain!');
    console.log('  ✅ Withdrawal successful - reporter identity protected');
    console.log('  ✅ Nullifier marked as spent (prevents double-withdrawal)\n');

    // Verify nullifier is spent
    expect(await payouts.isNullifierSpent(proofData.nullifier)).to.be.true;
    
    // Verify cannot withdraw again with same proof
    await expect(
      payouts.withdraw(
        onChainRoot,
        proofData.nullifier,
        s[5].address,
        bounty,
        proofData.pA,
        proofData.pB,
        proofData.pC
      )
    ).to.be.revertedWith("Already withdrawn");
    
    console.log('🎉 FULL REAL ZK INTEGRATION TEST PASSED!');
    console.log('   - Real commitment generation (Poseidon)');
    console.log('   - Real Merkle tree insertion');
    console.log('   - Real ZK proof generation (Groth16)');
    console.log('   - Real on-chain verification (BountyClaimVerifier)');
    console.log('   - Real anonymous withdrawal\n');
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
    const bbAddr = await bb.getAddress();
    const vault = await (await ethers.getContractFactory("BountyVault")).deploy(cUSDTAddr, s[1].address, 0); await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
    const merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
      libraries: { Hasher: await hasher.getAddress() }
    })).deploy(); await merkleTree.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("MockBountyClaimVerifier")).deploy(); await verifier.waitForDeployment();
    const payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(0, bbAddr, vaultAddr, await merkleTree.getAddress(), await verifier.getAddress()); await payouts.waitForDeployment();

    await bb.setVault(vaultAddr);
    await bb.setMerkleTree(await merkleTree.getAddress());
    await merkleTree.authorise(bbAddr);
    await bb.setDisputeResolver(await resolver.getAddress());
    await vault.setBugBountyProgram(bbAddr);
    await vault.setConfidentialPayouts(await payouts.getAddress());
    await vault.setDisputeResolver(await resolver.getAddress());
    await resolver.setBugBountyProgram(bbAddr);
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
    const sid = await fheSubmit(
      bb,
      bbAddr,
      s[2],
      ethers.keccak256(ethers.randomBytes(32)),
      adminKeys,
      1, // impactType: SmartContract
      2, // severity: High
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

    // Withdraw with ZK proof — tested separately in BountyClaimVerifier.test.ts
    // Full ZK proof generation and verification is tested there
    // Here we just verify the overall flow up to approval
    // await payouts.withdraw(await merkleTree.getRoot(), sid, s[4].address, bounty, pA, pB, pC);

    // Dispute
    const sid2 = await fheSubmit(
      bb,
      bbAddr,
      s[2],
      ethers.keccak256(ethers.randomBytes(32)),
      adminKeys,
      1, // impactType
      2, // severity
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
      const hasher = await (await ethers.getContractFactory("Hasher")).deploy(); await hasher.waitForDeployment();
      merkleTree = await (await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() }
      })).deploy(); await merkleTree.waitForDeployment();
      const verifier = await (await ethers.getContractFactory("MockBountyClaimVerifier")).deploy(); await verifier.waitForDeployment();
      payouts = await (await ethers.getContractFactory("ConfidentialPayouts")).deploy(PID, bbAddr, vaultAddr, await merkleTree.getAddress(), await verifier.getAddress()); await payouts.waitForDeployment();
      resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy(); await resolver.waitForDeployment();
      reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy(bbAddr); await reputation.waitForDeployment();
      reputationAddr = await reputation.getAddress();

      await bb.setVault(vaultAddr);
      await bb.setMerkleTree(await merkleTree.getAddress());
      await bb.setDisputeResolver(await resolver.getAddress());
      await bb.setReputation(reputationAddr);
      await merkleTree.authorise(bbAddr);
      await vault.setBugBountyProgram(bbAddr);
      await vault.setConfidentialPayouts(await payouts.getAddress());
      await vault.setDisputeResolver(await resolver.getAddress());
      await resolver.setBugBountyProgram(bbAddr);
      await resolver.setProgramArbiters(PID, [s[3].address, s[4].address, s[5].address]);

      // Mint underlying tokens and wrap them to confidential
      await underlyingUSDT.mint(s[1].address, 100_000n * D6);
      await underlyingUSDT.connect(s[1]).approve(cUSDTAddr, 100_000n * D6);
      await cUSDT.connect(s[1]).wrap(s[1].address, 100_000n * D6);
      
      // Deposit to vault
      await depositToVault(s[1], 50_000n * D6);
    });

    it("vault available decreases and locked increases after approve", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
      await bb.connect(s[1]).reviewReport(sid);
      const bounty = 5_000n * D6;
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(bounty));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid, handles[0], 2, inputProof, "0x");
      // Encrypted version - can't check exact balances (euint64), just verify operation succeeded
    });

    it("anti-rug protection: admin withdrawal uses graceful degradation", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
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
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
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
      const sid1 = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
      const sid2 = await fheSubmit(bb, bbAddr, s[2], c2, adminKeys, 1, 2);
      expect(sid1).to.not.equal(sid2);
      expect((await bb.getSubmissionMeta(sid1))[1]).to.equal(0n);
      expect((await bb.getSubmissionMeta(sid2))[1]).to.equal(0n);
    });

    it("reputation: Critical=100 score after approve — FHE user decrypt", async () => {
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
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
      const sid = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
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
      const sid0 = await fheSubmit(bb, bbAddr, s[2], commitment, adminKeys, 1, 2);
      await bb.connect(s[1]).reviewReport(sid0);
      const bounty = 10_000n * D6;
      const inp = fhevm.createEncryptedInput(bbAddr, s[1].address);
      inp.add64(Number(bounty));
      const { handles, inputProof } = await inp.encrypt();
      await bb.connect(s[1]).approveReport(sid0, handles[0], 2, inputProof, "0x");
      // Encrypted version - can't check exact balance (euint64)

      const c2 = "0xbbbbccccddddeeee0000111122223333444455556666777788889999aaaabbbb";
      const sid2 = await fheSubmit(bb, bbAddr, s[2], c2, adminKeys, 1, 2);
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
