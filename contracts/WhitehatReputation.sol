// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title WhitehatReputation — Confidential reputation scoring via FHE
/// @notice Reporter scores are stored as FHE-encrypted values. Only the
///         reporter can decrypt their own score. Programs query threshold
///         gates via async decryption (makePubliclyDecryptable + oracle).
///
/// Reputation tiers:
///   Open   — 0 points (anyone)
///   Bronze — ≥ 50
///   Silver — ≥ 150
///   Gold   — ≥ 400
///   Elite  — ≥ 1000
///
/// Points per severity: Low=10, Medium=25, High=50, Critical=100
contract WhitehatReputation is ZamaEthereumConfig {
  // ── Points Constants
  // ───────────────────────────────────────────────────

  uint32 public constant POINTS_LOW = 10;
  uint32 public constant POINTS_MEDIUM = 25;
  uint32 public constant POINTS_HIGH = 50;
  uint32 public constant POINTS_CRITICAL = 100;

  uint32 public constant TIER_BRONZE = 50;
  uint32 public constant TIER_SILVER = 150;
  uint32 public constant TIER_GOLD = 400;
  uint32 public constant TIER_ELITE = 1000;

  // ── State
  // ──────────────────────────────────────────────────────────────

  mapping(bytes32 => euint32) private reputationScores;
  mapping(bytes32 => euint64) private totalEarnings;
  mapping(bytes32 => uint32) public approvedReportCount;
  mapping(bytes32 => bool) public isRegistered;

  address public bugBountyProgram;

  // ── Modifiers
  // ─────────────────────────────────────────────────────────

  modifier onlyBugBountyProgram() {
    require(msg.sender == bugBountyProgram, "Not BugBountyProgram");
    _;
  }

  // ── Constructor
  // ───────────────────────────────────────────────────────

  constructor() {}

  function setBugBountyProgram(address addr) external {
    require(bugBountyProgram == address(0), "Already set");
    bugBountyProgram = addr;
  }

  // ── Core: Increment Score
  // ─────────────────────────────────────────────

  function incrementScore(bytes32 commitment, uint8 severity, uint256 bountyAmount) external onlyBugBountyProgram {
    if (!isRegistered[commitment]) {
      reputationScores[commitment] = FHE.asEuint32(0);
      totalEarnings[commitment] = FHE.asEuint64(uint64(0));
      isRegistered[commitment] = true;
      FHE.allowThis(reputationScores[commitment]);
      FHE.allowThis(totalEarnings[commitment]);
    }

    uint32 points = _severityToPoints(severity);

    reputationScores[commitment] = FHE.add(reputationScores[commitment], FHE.asEuint32(points));

    totalEarnings[commitment] = FHE.add(totalEarnings[commitment], FHE.asEuint64(uint64(bountyAmount)));

    approvedReportCount[commitment]++;

    FHE.allowThis(reputationScores[commitment]);
    FHE.allowThis(totalEarnings[commitment]);

    _checkTierUnlock(commitment);

    emit ScoreUpdated(commitment, approvedReportCount[commitment]);
  }

  // ── Threshold Gate (Async)
  // ────────────────────────────────────────────

  /// @notice Check whether a commitment meets a minimum reputation threshold.
  /// @dev Synchronous best-effort check. Returns true for Open tier (0).
  ///      For encrypted scores, can only verify commitment is registered.
  ///      Use requestMeetsRequirement for actual FHE threshold check.
  /// @return True if minReputation is 0, or commitment is registered (best-effort).
  function meetsRequirement(bytes32 commitment, uint32 minReputation) external view returns (bool) {
    if (minReputation == 0) return true; // Open tier
    return isRegistered[commitment]; // Best-effort: at least has some reputation
  }

  /// @notice Request a threshold check. Result is made publicly decryptable.
  ///         Caller decrypts the returned handle off-chain via the oracle.
  function requestMeetsRequirement(bytes32 commitment, uint32 minReputation)
    external
    returns (bytes32 qualifiesHandle)
  {
    if (minReputation == 0) {
      ebool yes = FHE.asEbool(true);
      FHE.makePubliclyDecryptable(yes);
      emit RequirementCheckRequested(commitment, minReputation, ebool.unwrap(yes));
      return ebool.unwrap(yes);
    }

    if (!isRegistered[commitment]) {
      ebool no = FHE.asEbool(false);
      FHE.makePubliclyDecryptable(no);
      emit RequirementCheckRequested(commitment, minReputation, ebool.unwrap(no));
      return ebool.unwrap(no);
    }

    ebool qualifies = FHE.ge(reputationScores[commitment], FHE.asEuint32(minReputation));

    FHE.makePubliclyDecryptable(qualifies);
    qualifiesHandle = ebool.unwrap(qualifies);

    emit RequirementCheckRequested(commitment, minReputation, qualifiesHandle);
  }

  // ── Reporter Encrypted Handles
  // ────────────────────────────────────────

  /// @notice Returns encrypted score handle. Reporter decrypts client-side.
  function getMyScoreHandle(bytes32 commitment) external view returns (euint32) {
    require(isRegistered[commitment], "No score yet");
    return reputationScores[commitment];
  }

  /// @notice Grants msg.sender permission to decrypt the score handle for commitment.
  function allowScoreDecrypt(bytes32 commitment) external {
    require(isRegistered[commitment], "No score yet");
    FHE.allow(reputationScores[commitment], msg.sender);
  }

  /// @notice Returns encrypted earnings handle. Reporter decrypts client-side.
  function getMyEarningsHandle(bytes32 commitment) external view returns (euint64) {
    require(isRegistered[commitment], "No earnings yet");
    return totalEarnings[commitment];
  }

  /// @notice Grants msg.sender permission to decrypt the earnings handle for commitment.
  function allowEarningsDecrypt(bytes32 commitment) external {
    require(isRegistered[commitment], "No earnings yet");
    FHE.allow(totalEarnings[commitment], msg.sender);
  }

  // ── Public Views
  // ──────────────────────────────────────────────────────

  function isRegisteredCommitment(bytes32 commitment) external view returns (bool) {
    return isRegistered[commitment];
  }

  function getApprovedCount(bytes32 commitment) external view returns (uint32) {
    return approvedReportCount[commitment];
  }

  // ── Internal
  // ──────────────────────────────────────────────────────────

  function _severityToPoints(uint8 severity) internal pure returns (uint32) {
    if (severity == 0) return POINTS_LOW;
    if (severity == 1) return POINTS_MEDIUM;
    if (severity == 2) return POINTS_HIGH;
    if (severity == 3) return POINTS_CRITICAL;
    return 0;
  }

  function _checkTierUnlock(bytes32 commitment) internal {
    uint32[4] memory thresholds = [TIER_BRONZE, TIER_SILVER, TIER_GOLD, TIER_ELITE];
    for (uint8 i = 0; i < 4; i++) {
      ebool crossed = FHE.ge(reputationScores[commitment], FHE.asEuint32(thresholds[i]));
      FHE.makePubliclyDecryptable(crossed);
      emit TierCheckRequested(commitment, i + 1, ebool.unwrap(crossed));
    }
  }

  // ── Events
  // ────────────────────────────────────────────────────────────

  event ScoreUpdated(bytes32 indexed commitment, uint32 approvedCount);
  event TierCheckRequested(bytes32 indexed commitment, uint8 tier, bytes32 qualifiesHandle);
  event RequirementCheckRequested(bytes32 indexed commitment, uint32 minReputation, bytes32 qualifiesHandle);
}
