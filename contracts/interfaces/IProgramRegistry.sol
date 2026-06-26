// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IProgramRegistry — Public program directory & factory interface
interface IProgramRegistry {
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

  /// @notice Create a new bug bounty program (deploys BugBountyProgram + Vault).
  function createProgram(
    string calldata name,
    string calldata description,
    string calldata websiteUrl,
    ReputationTier minTier,
    address[] calldata arbiters,
    uint256 initialPool
  )
    external
    returns (uint256 programId);

  /// @notice Check if a reporter's commitment meets program tier requirements.
  function canSubmit(uint256 programId, bytes32 commitment) external view returns (bool);

  /// @notice Increment submission count (called by BugBountyProgram).
  function incrementSubmissionCount(uint256 programId) external;

  /// @notice Sync pool size from vault (called by BountyVault).
  function updatePoolSize(uint256 programId, uint256 newSize) external;

  /// @notice Get all active programs for browsing.
  function getActivePrograms() external view returns (BountyProgram[] memory);

  /// @notice Get single program details.
  function getProgram(uint256 programId) external view returns (BountyProgram memory);

  function getAdminPrograms(address admin) external view returns (uint256[] memory);
}
