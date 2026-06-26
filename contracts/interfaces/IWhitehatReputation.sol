// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWhitehatReputation — Confidential reputation scoring via FHE
/// @notice Scores are stored encrypted; only the reporter can decrypt their
///         own score. Programs query threshold gates and receive bool only.
interface IWhitehatReputation {
  /// @notice Increment score after a report is approved.
  function incrementScore(bytes32 commitment, uint8 severity, uint256 bountyAmount) external;

  /// @notice Check whether a commitment meets a minimum reputation threshold.
  /// @return True if score >= minReputation (or minReputation == 0).
  function meetsRequirement(bytes32 commitment, uint32 minReputation) external view returns (bool);

  /// @notice Reporter decrypts their own score (ownership proof required).
  function getMyScore(bytes32 commitment, bytes calldata ownershipProof) external view returns (uint32);

  /// @notice Reporter decrypts their own total earnings.
  function getMyEarnings(bytes32 commitment, bytes calldata ownershipProof) external view returns (uint256);

  /// @notice Check whether a commitment has ever been registered.
  function isRegisteredCommitment(bytes32 commitment) external view returns (bool);

  /// @notice Get the plaintext approved report count (no score info).
  function getApprovedCount(bytes32 commitment) external view returns (uint32);
}
