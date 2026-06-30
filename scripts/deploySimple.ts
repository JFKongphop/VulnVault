import { ethers } from "hardhat";

/**
 * Simple Bug Bounty Deployment (Development/Testing)
 * 
 * Quick deployment for local testing without verbose output
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy token infrastructure
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const underlyingToken = await MockERC20.deploy();
  await underlyingToken.waitForDeployment();

  const MockConfidentialUSDT = await ethers.getContractFactory("MockConfidentialUSDT");
  const cUSDT = await MockConfidentialUSDT.deploy(await underlyingToken.getAddress());
  await cUSDT.waitForDeployment();

  // Deploy bug bounty program first (needed for reputation)
  const BugBountyProgram = await ethers.getContractFactory("BugBountyProgram");
  const bugBounty = await BugBountyProgram.deploy(deployer.address, 0);
  await bugBounty.waitForDeployment();

  // Deploy global infrastructure
  const WhitehatReputation = await ethers.getContractFactory("WhitehatReputation");
  const reputation = await WhitehatReputation.deploy(await bugBounty.getAddress());
  await reputation.waitForDeployment();

  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy();
  await disputeResolver.waitForDeployment();

  // Deploy ZK infrastructure
  const Hasher = await ethers.getContractFactory("Hasher");
  const hasher = await Hasher.deploy();
  await hasher.waitForDeployment();

  const BugBountyMerkleTree = await ethers.getContractFactory("BugBountyMerkleTree", {
    libraries: { Hasher: await hasher.getAddress() }
  });
  const merkleTree = await BugBountyMerkleTree.deploy();
  await merkleTree.waitForDeployment();

  const BountyClaimVerifier = await ethers.getContractFactory("BountyClaimVerifier");
  const verifier = await BountyClaimVerifier.deploy();
  await verifier.waitForDeployment();

  // Deploy payment infrastructure
  const BountyVault = await ethers.getContractFactory("BountyVault");
  const vault = await BountyVault.deploy(await cUSDT.getAddress(), deployer.address, 0);
  await vault.waitForDeployment();

  const ConfidentialPayouts = await ethers.getContractFactory("ConfidentialPayouts");
  const payouts = await ConfidentialPayouts.deploy(
    0,
    await bugBounty.getAddress(),
    await vault.getAddress(),
    await merkleTree.getAddress(),
    await verifier.getAddress()
  );
  await payouts.waitForDeployment();

  // Wire contracts
  await bugBounty.setMerkleTree(await merkleTree.getAddress());
  await bugBounty.setReputation(await reputation.getAddress());
  await bugBounty.setDisputeResolver(await disputeResolver.getAddress());
  await bugBounty.setVault(await vault.getAddress());
  await merkleTree.authorise(await payouts.getAddress());
  await merkleTree.authorise(await bugBounty.getAddress());
  await vault.setBugBountyProgram(await bugBounty.getAddress());
  await vault.setConfidentialPayouts(await payouts.getAddress());
  await vault.setDisputeResolver(await disputeResolver.getAddress());
  await disputeResolver.setBugBountyProgram(await bugBounty.getAddress());

  console.log("✅ Deployment Complete\n");
  console.log("Contracts:");
  console.log("  UnderlyingToken:", await underlyingToken.getAddress());
  console.log("  ConfidentialToken:", await cUSDT.getAddress());
  console.log("  Reputation:", await reputation.getAddress());
  console.log("  DisputeResolver:", await disputeResolver.getAddress());
  console.log("  MerkleTree:", await merkleTree.getAddress());
  console.log("  Verifier:", await verifier.getAddress());
  console.log("  BugBounty:", await bugBounty.getAddress());
  console.log("  Vault:", await vault.getAddress());
  console.log("  Payouts:", await payouts.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
