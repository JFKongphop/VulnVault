import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // ── Step 1: Deploy Mock cUSDT (replace with real token on mainnet) ──
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const cUSDT = await MockERC20.deploy();
  await cUSDT.waitForDeployment();
  console.log("MockERC20 (cUSDT):", await cUSDT.getAddress());

  // ── Step 2: Deploy WhitehatReputation ────────────────────────────────
  const WhitehatReputation = await ethers.getContractFactory("WhitehatReputation");
  const reputation = await WhitehatReputation.deploy();
  await reputation.waitForDeployment();
  console.log("WhitehatReputation:", await reputation.getAddress());

  // ── Step 3: Deploy DisputeResolver ───────────────────────────────────
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy();
  await disputeResolver.waitForDeployment();
  console.log("DisputeResolver:", await disputeResolver.getAddress());

  // ── Step 4: Deploy ProgramRegistry (factory) ─────────────────────────
  const ProgramRegistry = await ethers.getContractFactory("ProgramRegistry");
  const registry = await ProgramRegistry.deploy(
    await cUSDT.getAddress(),
    await reputation.getAddress(),
    await disputeResolver.getAddress(),
  );
  await registry.waitForDeployment();
  console.log("ProgramRegistry:", await registry.getAddress());

  // ── Step 4b: Wire global contracts ───────────────────────────────────
  await reputation.setBugBountyProgram(deployer.address);
  await disputeResolver.setBugBountyProgram(deployer.address);

  console.log("\n=== Deployment Complete ===");
  console.log("cUSDT:", await cUSDT.getAddress());
  console.log("WhitehatReputation:", await reputation.getAddress());
  console.log("DisputeResolver:", await disputeResolver.getAddress());
  console.log("ProgramRegistry:", await registry.getAddress());
  console.log("\nNext: Call registry.createProgram() to create a bug bounty program.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
