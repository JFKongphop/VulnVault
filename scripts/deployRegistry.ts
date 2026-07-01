import { ethers } from "hardhat";

// Existing deployed addresses on Sepolia — no redeployment needed
const CUSDT        = "0x8744FC2B44f93130C184d66ba5dCbB41740758d2";
const REPUTATION   = "0xeA3Fed61Eea443bA8eC8D2dD07A6B3331b894B2D";
const DISPUTE      = "0x1eecc3239d2Cf94e220664E7fdccF4fD36C5b607";
const VERIFIER     = "0x0926127278577088a6Af218cEC0F819a582B2e60";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ProgramRegistry with:", deployer.address);

  const ProgramRegistry = await ethers.getContractFactory("ProgramRegistry");
  const registry = await ProgramRegistry.deploy(CUSDT, REPUTATION, DISPUTE, VERIFIER);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("ProgramRegistry:", registryAddr);

  // Arbiters: need ≥3 distinct addresses. Using deployer + 2 dummy EOAs for demo.
  // Replace with real arbiters before mainnet.
  const arbiter1 = deployer.address;
  const arbiter2 = "0x000000000000000000000000000000000000dEaD";
  const arbiter3 = "0x0000000000000000000000000000000000000001";

  console.log("\nCreating demo program...");
  const tx = await registry.createProgram(
    "VulnVault Demo",
    "Confidential bug bounty demo program — powered by FHE on Sepolia",
    "https://vulnvault.xyz",
    0,                               // ReputationTier.None (any tier can submit)
    [arbiter1, arbiter2, arbiter3],
    0                                // pool starts at 0; top up separately
  );
  const receipt = await tx.wait();

  // Parse ProgramCreated event to get pid
  const event = receipt?.logs
    .map((log: { topics: string[]; data: string }) => {
      try { return registry.interface.parseLog(log as { topics: string[]; data: string }); }
      catch { return null; }
    })
    .find((e: { name: string } | null) => e?.name === "ProgramCreated");

  const pid = event?.args?.pid ?? 0n;
  console.log("Program created! PID:", pid.toString());

  const contracts = await registry.getProgramContracts(pid);
  console.log("\n=== New Program Contracts ===");
  console.log("BugBountyProgram:", contracts[0]);
  console.log("BountyVault:     ", contracts[1]);
  console.log("MerkleTree:      ", contracts[2]);

  console.log("\n=== Add to .env.local ===");
  console.log(`NEXT_PUBLIC_PROGRAM_REGISTRY=${registryAddr}`);
  console.log(`NEXT_PUBLIC_BUG_BOUNTY_PROGRAM=${contracts[0]}`);
  console.log(`NEXT_PUBLIC_BOUNTY_VAULT=${contracts[1]}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
