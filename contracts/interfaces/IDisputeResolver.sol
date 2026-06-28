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

  function raiseDispute(
    bytes32 submissionId,
    bytes calldata encryptedReason,
    bytes calldata encryptedEvidence,
    bytes calldata ownershipProof
  )
    external
    returns (uint256 disputeId);

  function submitVote(uint256 disputeId, bytes calldata encryptedVote, bytes calldata inputProof) external;

  function resolveDispute(uint256 disputeId) external;

  function executeOutcome(uint256 disputeId, uint256 bountyAmount, uint8 severity) external;

  function onReportRejected(bytes32 submissionId, uint256 programId) external;

  function isDisputed(bytes32 submissionId) external view returns (bool);

  function getDisputeOutcome(uint256 disputeId)
    external
    view
    returns (DisputeStatus status, bytes32 forReporter, bytes32 forAdmin, bytes32 reporterWon);

  function getDisputeStatus(uint256 disputeId) external view returns (DisputeStatus);

  function submissionDispute(bytes32 submissionId) external view returns (uint256);
}
