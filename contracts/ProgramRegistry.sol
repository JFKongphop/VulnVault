// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {BugBountyProgram} from "./BugBountyProgram.sol";
import {BountyVault} from "./BountyVault.sol";
import {ConfidentialPayouts} from "./ConfidentialPayouts.sol";
import {DisputeResolver} from "./DisputeResolver.sol";

contract ProgramRegistry {
  enum ReputationTier {
    Open,
    Bronze,
    Silver,
    Gold,
    Elite
  }

  struct BountyProgram {
    uint256 programId;
    string name;
    string description;
    string websiteUrl;
    uint256 totalPool;
    uint256 submissionCount;
    uint256 createdAt;
    bool active;
    address admin;
    ReputationTier minTier;
    address bugBountyContract;
    address vaultContract;
  }

  IERC20 public immutable cUSDT;
  address public reputation;
  DisputeResolver public disputeResolver;

  mapping(uint256 => BountyProgram) private _programs;
  mapping(address => uint256[]) private _adminPrograms;
  uint256 public programCount;

  constructor(address c, address r, address d) {
    cUSDT = IERC20(c);
    reputation = r;
    disputeResolver = DisputeResolver(d);
  }

  function createProgram(
    string calldata name,
    string calldata desc,
    string calldata url,
    ReputationTier tier,
    address[] calldata arbiters,
    uint256 pool
  )
    external
    returns (uint256 pid)
  {
    require(arbiters.length >= 3, ">=3 arbiters");
    require(bytes(name).length > 0, "Name req");
    pid = programCount++;
    BugBountyProgram bb = new BugBountyProgram(msg.sender, pid);
    BountyVault bv = new BountyVault(address(cUSDT), msg.sender, pid);
    ConfidentialPayouts cp = new ConfidentialPayouts(msg.sender, pid);
    bb.setRegistry(address(this));
    bb.setVault(address(bv));
    bb.setReputation(reputation);
    bb.setDisputeResolver(address(disputeResolver));
    bv.setBugBountyProgram(address(bb));
    bv.setConfidentialPayouts(address(cp));
    bv.setDisputeResolver(address(disputeResolver));
    bv.setRegistry(address(this));
    cp.setVault(address(bv));
    disputeResolver.setProgramArbiters(pid, arbiters);
    if (pool > 0) cUSDT.transferFrom(msg.sender, address(bv), pool);
    _programs[pid] =
      BountyProgram(pid, name, desc, url, pool, 0, block.timestamp, true, msg.sender, tier, address(bb), address(bv));
    _adminPrograms[msg.sender].push(pid);
    emit ProgramCreated(pid, name, msg.sender);
  }

  function canSubmit(uint256 pid, bytes32) external view returns (bool) {
    BountyProgram storage p = _programs[pid];
    if (!p.active || p.totalPool == 0) return false;
    return true;
  }

  function updateProgram(uint256 pid, string calldata desc, ReputationTier tier, bool active) external {
    require(msg.sender == _programs[pid].admin, "Not admin");
    _programs[pid].description = desc;
    _programs[pid].minTier = tier;
    _programs[pid].active = active;
    emit ProgramUpdated(pid, active);
  }

  function incrementSubmissionCount(uint256 pid) external {
    require(msg.sender == _programs[pid].bugBountyContract, "Not BB");
    _programs[pid].submissionCount++;
  }

  function updatePoolSize(uint256 pid, uint256 s) external {
    require(msg.sender == _programs[pid].vaultContract, "Not vault");
    _programs[pid].totalPool = s;
  }

  function topUpPool(uint256 pid, uint256 amount) external {
    require(_programs[pid].active, "Not active");
    require(amount > 0, "Zero amount");
    cUSDT.transferFrom(msg.sender, _programs[pid].vaultContract, amount);
    _programs[pid].totalPool += amount;
    emit PoolToppedUp(pid, msg.sender, amount);
  }

  function transferAdmin(uint256 pid, address newAdmin) external {
    require(msg.sender == _programs[pid].admin, "Not admin");
    require(newAdmin != address(0), "Zero addr");
    address old = _programs[pid].admin;
    _programs[pid].admin = newAdmin;
    _adminPrograms[newAdmin].push(pid);
    emit AdminTransferred(pid, old, newAdmin);
  }

  function getActivePrograms() external view returns (uint256[] memory) {
    uint256 count;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].active) count++;
    }
    uint256[] memory ids = new uint256[](count);
    uint256 j;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].active) ids[j++] = i;
    }
    return ids;
  }

  function getAdminPrograms(address admin) external view returns (uint256[] memory) {
    return _adminPrograms[admin];
  }

  function getProgram(uint256 pid) external view returns (BountyProgram memory) {
    return _programs[pid];
  }

  event ProgramCreated(uint256 indexed pid, string name, address indexed admin);
  event ProgramUpdated(uint256 indexed pid, bool active);
  event PoolToppedUp(uint256 indexed pid, address indexed by, uint256 amount);
  event AdminTransferred(uint256 indexed pid, address indexed oldAdmin, address indexed newAdmin);
}
