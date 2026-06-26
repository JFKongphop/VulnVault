// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBountyVault — Timelocked fund custody interface
/// @notice Holds cUSDT, locks funds on approval, releases via ZK withdrawal.
interface IBountyVault {
  /// @notice Deposit cUSDT into a program's vault.
  function deposit(uint256 programId, uint256 amount) external;

  /// @notice Lock funds for an approved report (called by BugBountyProgram).
  function lockFunds(uint256 programId, bytes32 submissionId, uint256 amount) external;

  /// @notice Release locked funds to reporter's fresh wallet (called by
  ///         ConfidentialPayouts after ZK verification).
  function releaseBounty(uint256 programId, bytes32 submissionId, address recipient, uint256 amount) external;

  /// @notice Unlock funds back to available (called by DisputeResolver when
  ///         admin wins dispute).
  function unlockFunds(uint256 programId, bytes32 submissionId) external;

  /// @notice Admin initiates a timelocked withdrawal of available balance.
  function initiateWithdrawal(uint256 programId, uint256 amount) external;

  /// @notice Admin executes withdrawal after timelock expires.
  function executeWithdrawal(uint256 programId) external;

  /// @notice Admin cancels a pending withdrawal.
  function cancelWithdrawal(uint256 programId) external;

  function getAvailableBalance(uint256 programId) external view returns (uint256);

  function getLockedBalance(uint256 programId) external view returns (uint256);

  function getPendingWithdrawal(uint256 programId) external view returns (uint256 amount, uint256 readyAt);

  function getLockedForReport(bytes32 submissionId) external view returns (uint256);
}
