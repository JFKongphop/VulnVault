// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {BugBountyProgram} from "./BugBountyProgram.sol";
import {BountyVault} from "./BountyVault.sol";
import {ConfidentialPayouts} from "./ConfidentialPayouts.sol";
import {DisputeResolver} from "./DisputeResolver.sol";
import {BugBountyMerkleTree} from "./BugBountyMerkleTree.sol";
import {IWhitehatReputation} from "./interfaces/IWhitehatReputation.sol";

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
    address merkleTreeContract;
  }

  IERC7984 public immutable cUSDT;
  address public reputation;
  address public verifier;
  DisputeResolver public disputeResolver;

  mapping(uint256 => BountyProgram) private _programs;
  mapping(address => uint256[]) private _adminPrograms;
  uint256 public programCount;

  event ProgramCreated(uint256 indexed pid, string name, address indexed admin);
  event ProgramUpdated(uint256 indexed pid, bool active);
  event PoolToppedUp(uint256 indexed pid, address indexed by, uint256 amount);
  event AdminTransferred(uint256 indexed pid, address indexed oldAdmin, address indexed newAdmin);
  event ArbitersUpdated(uint256 indexed pid, address[] arbiters);

  constructor(address c, address r, address d, address v) {
    cUSDT = IERC7984(c);
    reputation = r;
    disputeResolver = DisputeResolver(d);
    verifier = v;
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
    BugBountyMerkleTree merkleTree = new BugBountyMerkleTree();
    ConfidentialPayouts cp = new ConfidentialPayouts(pid, address(bb), address(bv), address(merkleTree), verifier);
    bb.setRegistry(address(this));
    bb.setVault(address(bv));
    bb.setReputation(reputation);
    bb.setDisputeResolver(address(disputeResolver));
    bb.setMerkleTree(address(merkleTree));
    bv.setBugBountyProgram(address(bb));
    bv.setConfidentialPayouts(address(cp));
    bv.setDisputeResolver(address(disputeResolver));
    bv.setRegistry(address(this));
    merkleTree.authorise(address(bb));
    disputeResolver.setProgramArbiters(pid, arbiters);
    // Note: Admin should separately call cUSDT.confidentialTransferAndCall(vault, encAmount, proof, "")
    // to deposit initial pool funds if pool > 0. The vault handles via onConfidentialTransferReceived.
    _programs[pid] = BountyProgram(
      pid,
      name,
      desc,
      url,
      pool,
      0,
      block.timestamp,
      true,
      msg.sender,
      tier,
      address(bb),
      address(bv),
      address(merkleTree)
    );
    _adminPrograms[msg.sender].push(pid);
    emit ProgramCreated(pid, name, msg.sender);
  }

  function canSubmit(uint256 pid, bytes32 commitment) external view returns (bool) {
    BountyProgram storage p = _programs[pid];
    if (!p.active || p.totalPool == 0) return false;
    
    // Check reputation tier requirement
    if (p.minTier != ReputationTier.Open) {
      uint32 threshold = _tierToThreshold(p.minTier);
      if (!IWhitehatReputation(reputation).meetsRequirement(commitment, threshold)) {
        return false;
      }
    }
    
    return true;
  }
  
  function _tierToThreshold(ReputationTier tier) private pure returns (uint32) {
    if (tier == ReputationTier.Bronze) return 50;
    if (tier == ReputationTier.Silver) return 150;
    if (tier == ReputationTier.Gold) return 400;
    if (tier == ReputationTier.Elite) return 1000;
    return 0; // Open
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
    // Note: Caller should separately call cUSDT.confidentialTransferAndCall(vault, encAmount, proof, "")
    // to deposit funds. This function only updates the tracking.
    _programs[pid].totalPool += amount;
    emit PoolToppedUp(pid, msg.sender, amount);
  }

  function transferAdmin(uint256 pid, address newAdmin) external {
    require(msg.sender == _programs[pid].admin, "Not admin");
    require(newAdmin != address(0), "Zero addr");
    address old = _programs[pid].admin;
    _programs[pid].admin = newAdmin;
    
    // Remove from old admin's array
    uint256[] storage oldAdminPrograms = _adminPrograms[old];
    for (uint256 i = 0; i < oldAdminPrograms.length; i++) {
      if (oldAdminPrograms[i] == pid) {
        oldAdminPrograms[i] = oldAdminPrograms[oldAdminPrograms.length - 1];
        oldAdminPrograms.pop();
        break;
      }
    }
    
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
  
  function updateArbiters(uint256 pid, address[] calldata arbiters) external {
    require(msg.sender == _programs[pid].admin, "Not admin");
    require(arbiters.length >= 3, ">=3 arbiters");
    disputeResolver.updateProgramArbiters(pid, arbiters);
    emit ArbitersUpdated(pid, arbiters);
  }

  // === Additional UX Helper Functions ===

  function deactivateProgram(uint256 pid) external {
    require(msg.sender == _programs[pid].admin, "Not admin");
    _programs[pid].active = false;
    emit ProgramUpdated(pid, false);
  }

  function isAdmin(uint256 pid, address addr) external view returns (bool) {
    return _programs[pid].admin == addr;
  }

  function isProgramValid(uint256 pid) external view returns (bool) {
    return pid < programCount && _programs[pid].admin != address(0);
  }

  function getInactivePrograms() external view returns (uint256[] memory) {
    uint256 count;
    for (uint256 i = 0; i < programCount; i++) {
      if (!_programs[i].active) count++;
    }
    uint256[] memory ids = new uint256[](count);
    uint256 j;
    for (uint256 i = 0; i < programCount; i++) {
      if (!_programs[i].active) ids[j++] = i;
    }
    return ids;
  }

  function getProgramsByTier(ReputationTier tier) external view returns (uint256[] memory) {
    uint256 count;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].minTier == tier && _programs[i].active) count++;
    }
    uint256[] memory ids = new uint256[](count);
    uint256 j;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].minTier == tier && _programs[i].active) ids[j++] = i;
    }
    return ids;
  }

  function getProgramsWithMinPool(uint256 minPool) external view returns (uint256[] memory) {
    uint256 count;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].totalPool >= minPool && _programs[i].active) count++;
    }
    uint256[] memory ids = new uint256[](count);
    uint256 j;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].totalPool >= minPool && _programs[i].active) ids[j++] = i;
    }
    return ids;
  }

  function getBatchPrograms(uint256[] calldata pids) external view returns (BountyProgram[] memory) {
    BountyProgram[] memory programs = new BountyProgram[](pids.length);
    for (uint256 i = 0; i < pids.length; i++) {
      programs[i] = _programs[pids[i]];
    }
    return programs;
  }

  function getTotalStats() external view returns (
    uint256 totalPrograms,
    uint256 activePrograms,
    uint256 totalPoolAcrossAll,
    uint256 totalSubmissions
  ) {
    totalPrograms = programCount;
    for (uint256 i = 0; i < programCount; i++) {
      if (_programs[i].active) activePrograms++;
      totalPoolAcrossAll += _programs[i].totalPool;
      totalSubmissions += _programs[i].submissionCount;
    }
  }

  function getProgramContracts(uint256 pid) external view returns (
    address bugBounty,
    address vault,
    address merkleTree
  ) {
    return (
      _programs[pid].bugBountyContract,
      _programs[pid].vaultContract,
      _programs[pid].merkleTreeContract
    );
  }
}
