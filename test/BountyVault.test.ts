import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DECIMALS_6 = 1_000_000n;

describe("BountyVault", function () {
  let signers: any;
  let cUSDT: any, vault: any, vaultAddr: string;
  const PID = 0;
  const SID = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await cUSDT.waitForDeployment();
    vault = await (await ethers.getContractFactory("BountyVault")).deploy(await cUSDT.getAddress(), signers[1].address, PID);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();
    await vault.connect(signers[1]).setBugBountyProgram(signers[0].address);
    await vault.connect(signers[1]).setConfidentialPayouts(signers[0].address);
    await vault.connect(signers[1]).setDisputeResolver(signers[0].address);
    await cUSDT.mint(signers[1].address, 100_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).approve(vaultAddr, 100_000n * DECIMALS_6);
  });

  it("deposits from admin", async () => {
    await vault.connect(signers[1]).deposit(PID, 10_000n * DECIMALS_6);
    expect(await vault.getAvailableBalance(PID)).to.equal(10_000n * DECIMALS_6);
  });

  it("reverts zero deposit", async () => {
    await expect(vault.connect(signers[1]).deposit(PID, 0)).to.be.revertedWith("Zero deposit");
  });

  it("reverts non-admin deposit", async () => {
    await expect(vault.connect(signers[2]).deposit(PID, 1000n)).to.be.revertedWith("Not program admin");
  });

  it("locks funds for approved report", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.lockFunds(PID, SID, 5_000n * DECIMALS_6);
    expect(await vault.getAvailableBalance(PID)).to.equal(45_000n * DECIMALS_6);
    expect(await vault.getLockedBalance(PID)).to.equal(5_000n * DECIMALS_6);
  });

  it("reverts lock exceeding available", async () => {
    await vault.connect(signers[1]).deposit(PID, 1_000n * DECIMALS_6);
    await expect(vault.lockFunds(PID, SID, 5_000n * DECIMALS_6)).to.be.revertedWith("Insufficient pool");
  });

  it("releases bounty to reporter", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.lockFunds(PID, SID, 5_000n * DECIMALS_6);
    const balBefore = await cUSDT.balanceOf(signers[2].address);
    await vault.releaseBounty(PID, SID, signers[2].address, 5_000n * DECIMALS_6);
    expect(await cUSDT.balanceOf(signers[2].address)).to.equal(balBefore + 5_000n * DECIMALS_6);
  });

  it("reverts release exceeding locked", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.lockFunds(PID, SID, 1_000n * DECIMALS_6);
    await expect(vault.releaseBounty(PID, SID, signers[2].address, 5_000n * DECIMALS_6)).to.be.revertedWith("Exceeds locked");
  });

  it("unlocks funds back to available", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.lockFunds(PID, SID, 5_000n * DECIMALS_6);
    await vault.unlockFunds(PID, SID);
    expect(await vault.getAvailableBalance(PID)).to.equal(50_000n * DECIMALS_6);
    expect(await vault.getLockedBalance(PID)).to.equal(0);
  });

  it("timelocked withdrawal flow", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.connect(signers[1]).initiateWithdrawal(PID, 10_000n * DECIMALS_6);
    await expect(vault.connect(signers[1]).executeWithdrawal(PID)).to.be.revertedWith("Timelock active");
    await time.increase(48 * 3600 + 1);
    const balBefore = await cUSDT.balanceOf(signers[1].address);
    await vault.connect(signers[1]).executeWithdrawal(PID);
    expect(await cUSDT.balanceOf(signers[1].address)).to.equal(balBefore + 10_000n * DECIMALS_6);
  });

  it("cancels pending withdrawal", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.connect(signers[1]).initiateWithdrawal(PID, 10_000n * DECIMALS_6);
    await vault.connect(signers[1]).cancelWithdrawal(PID);
    const [amt] = await vault.getPendingWithdrawal(PID);
    expect(amt).to.equal(0);
    expect(await vault.getAvailableBalance(PID)).to.equal(50_000n * DECIMALS_6);
  });

  it("anti-rug: initiateWithdrawal reverts when amount exceeds available balance", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    await vault.lockFunds(PID, SID, 10_000n * DECIMALS_6); // signers[0] is BB
    // available = 40k, locked = 10k → try to withdraw 50k
    await expect(
      vault.connect(signers[1]).initiateWithdrawal(PID, 50_000n * DECIMALS_6)
    ).to.be.revertedWith("Insufficient available");
  });

  it("complete lifecycle: deposit → lock → release → timelock withdraw", async () => {
    await vault.connect(signers[1]).deposit(PID, 50_000n * DECIMALS_6);
    // Lock 20k for a report
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("report1"));
    await vault.lockFunds(PID, nullifier, 20_000n * DECIMALS_6);
    expect(await vault.getLockedBalance(PID)).to.equal(20_000n * DECIMALS_6);
    expect(await vault.getAvailableBalance(PID)).to.equal(30_000n * DECIMALS_6);
    // Release (funds returned to available — simulating dispute admin win)
    await vault.unlockFunds(PID, nullifier);
    expect(await vault.getLockedBalance(PID)).to.equal(0);
    expect(await vault.getAvailableBalance(PID)).to.equal(50_000n * DECIMALS_6);
    // Admin timelock withdraw
    await vault.connect(signers[1]).initiateWithdrawal(PID, 50_000n * DECIMALS_6);
    await time.increase(48 * 3600 + 1);
    const balBefore = await cUSDT.balanceOf(signers[1].address);
    await vault.connect(signers[1]).executeWithdrawal(PID);
    expect(await cUSDT.balanceOf(signers[1].address)).to.equal(balBefore + 50_000n * DECIMALS_6);
  });
});
