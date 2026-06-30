import { ethers } from "hardhat";

/**
 * Full Bug Bounty Platform Deployment Script
 * 
 * Deploys all contracts for a complete anonymous bug bounty platform with:
 * - ZK proof-based anonymous withdrawals
 * - FHE-encrypted sensitive data
 * - Merkle tree commitment tracking
 * - Reputation system
 * - Dispute resolution
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║         Anonymous Bug Bounty Platform Deployment              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  console.log("🔑 Deployer address:", deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Deploy Token Infrastructure
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 STEP 1: Deploying Token Infrastructure");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy underlying ERC20 token (e.g., USDT)
  console.log("⏳ Deploying MockERC20 (underlying token)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const underlyingToken = await MockERC20.deploy();
  await underlyingToken.waitForDeployment();
  const underlyingTokenAddr = await underlyingToken.getAddress();
  console.log("✅ MockERC20 deployed:", underlyingTokenAddr);

  // Deploy ERC7984 Confidential Token wrapper
  console.log("⏳ Deploying MockConfidentialUSDT (ERC7984 wrapper)...");
  const MockConfidentialUSDT = await ethers.getContractFactory("MockConfidentialUSDT");
  const cUSDT = await MockConfidentialUSDT.deploy(underlyingTokenAddr);
  await cUSDT.waitForDeployment();
  const cUSDTAddr = await cUSDT.getAddress();
  console.log("✅ MockConfidentialUSDT deployed:", cUSDTAddr);
  console.log("   → Wraps underlying token for confidential transfers\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Deploy Global Infrastructure
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🐛 STEP 2: Deploying Bug Bounty Program Core");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const programAdmin = deployer.address; // In production, use dedicated admin address
  const maxBounty = 0; // 0 = unlimited

  console.log("⏳ Deploying BugBountyProgram...");
  const BugBountyProgram = await ethers.getContractFactory("BugBountyProgram");
  const bugBounty = await BugBountyProgram.deploy(programAdmin, maxBounty);
  await bugBounty.waitForDeployment();
  const bugBountyAddr = await bugBounty.getAddress();
  console.log("✅ BugBountyProgram deployed:", bugBountyAddr);
  console.log("   → Admin:", programAdmin);
  console.log("   → Max bounty:", maxBounty === 0 ? "unlimited" : maxBounty, "\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Deploy Global Infrastructure
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🌍 STEP 3: Deploying Global Infrastructure");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy WhitehatReputation (needs BugBountyProgram address)
  console.log("⏳ Deploying WhitehatReputation...");
  const WhitehatReputation = await ethers.getContractFactory("WhitehatReputation");
  const reputation = await WhitehatReputation.deploy(bugBountyAddr);
  await reputation.waitForDeployment();
  const reputationAddr = await reputation.getAddress();
  console.log("✅ WhitehatReputation deployed:", reputationAddr);
  console.log("   → Tracks FHE-encrypted reputation scores (Bronze → Legendary)\n");

  // Deploy DisputeResolver
  console.log("⏳ Deploying DisputeResolver...");
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy();
  await disputeResolver.waitForDeployment();
  const disputeResolverAddr = await disputeResolver.getAddress();
  console.log("✅ DisputeResolver deployed:", disputeResolverAddr);
  console.log("   → Handles reporter vs admin disputes\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Deploy ZK Proof Infrastructure
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔐 STEP 4: Deploying ZK Proof Infrastructure");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy Hasher library (Poseidon)
  console.log("⏳ Deploying Hasher library...");
  const Hasher = await ethers.getContractFactory("Hasher");
  const hasher = await Hasher.deploy();
  await hasher.waitForDeployment();
  const hasherAddr = await hasher.getAddress();
  console.log("✅ Hasher deployed:", hasherAddr);
  console.log("   → Poseidon hash function for Merkle tree\n");

  // Deploy BugBountyMerkleTree
  console.log("⏳ Deploying BugBountyMerkleTree...");
  const BugBountyMerkleTree = await ethers.getContractFactory("BugBountyMerkleTree", {
    libraries: {
      Hasher: hasherAddr
    }
  });
  const merkleTree = await BugBountyMerkleTree.deploy();
  await merkleTree.waitForDeployment();
  const merkleTreeAddr = await merkleTree.getAddress();
  console.log("✅ BugBountyMerkleTree deployed:", merkleTreeAddr);
  console.log("   → 20-level sparse Merkle tree for commitments\n");

  // Deploy BountyClaimVerifier (Groth16 ZK verifier)
  console.log("⏳ Deploying BountyClaimVerifier (Groth16)...");
  const BountyClaimVerifier = await ethers.getContractFactory("BountyClaimVerifier");
  const verifier = await BountyClaimVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("✅ BountyClaimVerifier deployed:", verifierAddr);
  console.log("   → Real ZK proof verification for anonymous withdrawals\n");



  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Deploy Payment Infrastructure
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💰 STEP 5: Deploying Payment Infrastructure");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy BountyVault
  console.log("⏳ Deploying BountyVault...");
  const BountyVault = await ethers.getContractFactory("BountyVault");
  const vault = await BountyVault.deploy(cUSDTAddr, programAdmin, maxBounty);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("✅ BountyVault deployed:", vaultAddr);
  console.log("   → Manages locked/available funds with anti-rug protection\n");

  // Deploy ConfidentialPayouts
  console.log("⏳ Deploying ConfidentialPayouts...");
  const ConfidentialPayouts = await ethers.getContractFactory("ConfidentialPayouts");
  const payouts = await ConfidentialPayouts.deploy(
    maxBounty,
    bugBountyAddr,
    vaultAddr,
    merkleTreeAddr,
    verifierAddr
  );
  await payouts.waitForDeployment();
  const payoutsAddr = await payouts.getAddress();
  console.log("✅ ConfidentialPayouts deployed:", payoutsAddr);
  console.log("   → Handles anonymous withdrawals with ZK proofs\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Wire Contracts Together
  // ═══════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔗 STEP 6: Wiring Contracts");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("⏳ Setting up BugBountyProgram...");
  await bugBounty.setMerkleTree(merkleTreeAddr);
  await bugBounty.setReputation(reputationAddr);
  await bugBounty.setDisputeResolver(disputeResolverAddr);
  await bugBounty.setVault(vaultAddr);
  console.log("✅ BugBountyProgram wired");

  console.log("⏳ Authorizing ConfidentialPayouts on Merkle tree...");
  await merkleTree.authorise(payoutsAddr);
  console.log("✅ ConfidentialPayouts authorized");

  console.log("⏳ Authorizing BugBountyProgram on Merkle tree...");
  await merkleTree.authorise(bugBountyAddr);
  console.log("✅ BugBountyProgram authorized");

  console.log("⏳ Setting BugBountyProgram in DisputeResolver...");
  await disputeResolver.setBugBountyProgram(bugBountyAddr);
  console.log("✅ DisputeResolver linked");

  console.log("⏳ Wiring Vault...");
  await vault.setBugBountyProgram(bugBountyAddr);
  await vault.setConfidentialPayouts(payoutsAddr);
  await vault.setDisputeResolver(disputeResolverAddr);
  console.log("✅ Vault wired\n");

  // ═══════════════════════════════════════════════════════════════════
  // DEPLOYMENT SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                   DEPLOYMENT COMPLETE ✅                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("📋 DEPLOYED CONTRACTS:\n");
  
  console.log("💰 Token Infrastructure:");
  console.log("   MockERC20 (underlying):     ", underlyingTokenAddr);
  console.log("   MockConfidentialUSDT:       ", cUSDTAddr);
  console.log("");

  console.log("🌍 Global Infrastructure:");
  console.log("   WhitehatReputation:         ", reputationAddr);
  console.log("   DisputeResolver:            ", disputeResolverAddr);
  console.log("");

  console.log("🔐 ZK Proof Infrastructure:");
  console.log("   Hasher (library):           ", hasherAddr);
  console.log("   BugBountyMerkleTree:        ", merkleTreeAddr);
  console.log("   BountyClaimVerifier:        ", verifierAddr);
  console.log("");

  console.log("🐛 Bug Bounty Program:");
  console.log("   BugBountyProgram:           ", bugBountyAddr);
  console.log("   BountyVault:                ", vaultAddr);
  console.log("   ConfidentialPayouts:        ", payoutsAddr);
  console.log("");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📝 NEXT STEPS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("1. Fund the vault:");
  console.log("   - Mint tokens: await underlyingToken.mint(deployer.address, amount)");
  console.log("   - Approve: await underlyingToken.approve(cUSDTAddr, amount)");
  console.log("   - Wrap: await cUSDT.wrap(amount)");
  console.log("   - Deposit: transfer cUSDT to vault\n");

  console.log("2. Test the flow:");
  console.log("   - Submit bug report: bugBounty.submitReport(...)");
  console.log("   - Review: bugBounty.reviewReport(submissionId)");
  console.log("   - Approve: bugBounty.approveReport(submissionId, ...)");
  console.log("   - Generate ZK proof: use bountyClaim circuit");
  console.log("   - Withdraw: payouts.withdraw(root, nullifier, recipient, ...)\n");

  console.log("3. Production considerations:");
  console.log("   - Replace MockERC20 with real USDT/USDC");
  console.log("   - Replace MockConfidentialUSDT with production ERC7984");
  console.log("   - Set proper admin addresses (multisig recommended)");
  console.log("   - Configure bounty limits and thresholds");
  console.log("   - Verify all contracts on block explorer\n");

  // Save deployment addresses to file
  const deploymentData = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      tokens: {
        underlyingToken: underlyingTokenAddr,
        confidentialToken: cUSDTAddr
      },
      global: {
        reputation: reputationAddr,
        disputeResolver: disputeResolverAddr
      },
      zk: {
        hasher: hasherAddr,
        merkleTree: merkleTreeAddr,
        verifier: verifierAddr
      },
      program: {
        bugBounty: bugBountyAddr,
        vault: vaultAddr,
        payouts: payoutsAddr
      }
    }
  };

  const fs = require("fs");
  const deploymentPath = `./deployments/deployment-${Date.now()}.json`;
  fs.mkdirSync("./deployments", { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2));
  console.log("💾 Deployment data saved to:", deploymentPath, "\n");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
