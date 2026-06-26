import { ethers, fhevm } from "hardhat";
import { expect } from "chai";

const DECIMALS_6 = 1_000_000n;

describe("ProgramRegistry", function () {
  let signers: any, registry: any, reputation: any, resolver: any, cUSDT: any;
  let registryAddr: string;

  before(async () => { signers = await ethers.getSigners(); });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    cUSDT = await (await ethers.getContractFactory("MockERC20")).deploy();
    await cUSDT.waitForDeployment();
    reputation = await (await ethers.getContractFactory("WhitehatReputation")).deploy();
    await reputation.waitForDeployment();
    await reputation.setBugBountyProgram(signers[0].address);
    resolver = await (await ethers.getContractFactory("DisputeResolver")).deploy();
    await resolver.waitForDeployment();
    await resolver.setBugBountyProgram(signers[0].address);
    registry = await (await ethers.getContractFactory("ProgramRegistry")).deploy(
      await cUSDT.getAddress(), await reputation.getAddress(), await resolver.getAddress()
    );
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();
  });

  it("creates bug bounty program", async () => {
    await registry.connect(signers[1]).createProgram(
      "Uniswap Bug Bounty", "Desc", "https://u.com", 0,
      [signers[3].address, signers[4].address, signers[5].address], 0,
    );
    const p = await registry.getProgram(0);
    expect(p.name).to.equal("Uniswap Bug Bounty");
    expect(p.active).to.be.true;
    expect(p.bugBountyContract).to.not.equal(ethers.ZeroAddress);
  });

  it("creates program with initial pool", async () => {
    await cUSDT.mint(signers[1].address, 50_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).approve(registryAddr, 50_000n * DECIMALS_6);
    await registry.connect(signers[1]).createProgram(
      "Aave", "D", "https://a.com", 0,
      [signers[3].address, signers[4].address, signers[5].address], 50_000n * DECIMALS_6,
    );
    expect((await registry.getProgram(0)).totalPool).to.equal(50_000n * DECIMALS_6);
  });

  it("canSubmit returns true for active program with pool", async () => {
    await cUSDT.mint(signers[1].address, 50_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).approve(registryAddr, 50_000n * DECIMALS_6);
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 1000);
    expect(await registry.canSubmit(0, ethers.ZeroHash)).to.be.true;
  });

  it("canSubmit returns false for empty pool", async () => {
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    expect(await registry.canSubmit(0, ethers.ZeroHash)).to.be.false;
  });

  it("deactivates program", async () => {
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await registry.connect(signers[1]).updateProgram(0, "D", 0, false);
    expect((await registry.getProgram(0)).active).to.be.false;
  });

  it("reverts non-admin update", async () => {
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await expect(registry.connect(signers[4]).updateProgram(0, "H", 0, true)).to.be.revertedWith("Not admin");
  });

  it("reverts <3 arbiters", async () => {
    await expect(registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address], 0)).to.be.revertedWith(">=3 arbiters");
  });

  it("reverts empty name", async () => {
    await expect(registry.connect(signers[1]).createProgram("", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0)).to.be.revertedWith("Name req");
  });

  it("topUpPool increases program totalPool and transfers tokens", async () => {
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await cUSDT.mint(signers[1].address, 10_000n * DECIMALS_6);
    await cUSDT.connect(signers[1]).approve(registryAddr, 10_000n * DECIMALS_6);
    await expect(
      registry.connect(signers[1]).topUpPool(0, 10_000n * DECIMALS_6)
    ).to.emit(registry, "PoolToppedUp");
    expect((await registry.getProgram(0)).totalPool).to.equal(10_000n * DECIMALS_6);
  });

  it("transferAdmin changes program admin and emits AdminTransferred", async () => {
    await registry.connect(signers[1]).createProgram("P", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await expect(
      registry.connect(signers[1]).transferAdmin(0, signers[2].address)
    ).to.emit(registry, "AdminTransferred").withArgs(0, signers[1].address, signers[2].address);
    expect((await registry.getProgram(0)).admin).to.equal(signers[2].address);
  });

  it("getActivePrograms returns all active programs", async () => {
    await registry.connect(signers[1]).createProgram("P1", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await registry.connect(signers[2]).createProgram("P2", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    const active = await registry.getActivePrograms();
    expect(active.length).to.equal(2);
    expect(active[0]).to.equal(0n);
    expect(active[1]).to.equal(1n);
  });

  it("getAdminPrograms returns programs created by a specific admin", async () => {
    await registry.connect(signers[1]).createProgram("P1", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await registry.connect(signers[2]).createProgram("P2", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    await registry.connect(signers[1]).createProgram("P3", "D", "https://p.com", 0, [signers[3].address, signers[4].address, signers[5].address], 0);
    const s1Programs = await registry.getAdminPrograms(signers[1].address);
    expect(s1Programs.length).to.equal(2);
    expect(s1Programs[0]).to.equal(0n);
    expect(s1Programs[1]).to.equal(2n);
  });
});
