// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBugBountyProgram} from "./IBugBountyProgram.sol";

/// @title IDisputeResolver — FHE-encrypted voting dispute resolution
interface IDisputeResolver {
  enum DisputeStatus {
    Raised,
    Voting,
    Resolved,
    Executed
  }

  enum Vote {
    Abstain,
    ForReporter,
    ForAdmin
  }

  /// @notice Reporter escalates a rejected report.
  function raiseDispute(
    bytes32 submissionId,
    bytes calldata encryptedReason,
    bytes calldata encryptedEvidence,
    bytes calldata ownershipProof
  )
    external
    returns (uint256 disputeId);

  /// @notice Arbiter decrypts report + dispute details to vote.
  function viewDisputeDetails(
    uint256 disputeId,
    bytes calldata arbiterProof
  )
    external
    view
    returns (IBugBountyProgram.DecryptedReport memory report, string memory reason, string memory evidence);

  /// @notice Arbiter submits encrypted vote.
  function submitVote(uint256 disputeId, Vote vote, bytes calldata arbiterProof) external;

  /// @notice Tally encrypted votes and reveal final count.
  function resolveDispute(uint256 disputeId) external;

  /// @notice Enforce dispute outcome on-chain.
  function executeOutcome(uint256 disputeId) external;

  /// @notice Called by BugBountyProgram when admin rejects.
  function onReportRejected(bytes32 submissionId, uint256 programId) external;

  /// @notice Check if a submission has an active dispute.
  function isDisputed(bytes32 submissionId) external view returns (bool);

  function getDisputeOutcome(uint256 disputeId)
    external
    view
    returns (DisputeStatus status, bool reporterWon, uint8 votesForReporter, uint8 votesForAdmin);
}
