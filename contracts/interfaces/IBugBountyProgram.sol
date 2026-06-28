// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {externalEuint8} from "@fhevm/solidity/lib/FHE.sol";

/// @title IBugBountyProgram — Core FHE-encrypted bug report storage
/// @notice All sensitive report fields are stored FHE-encrypted.
interface IBugBountyProgram {
  enum ReportStatus {
    Pending,
    UnderReview,
    Approved,
    Rejected,
    Disputed
  }

  // ── Setters
  // ─────────────────────────────────────────────────────

  function setAdminPublicKey(bytes calldata pubkey) external;

  function submitReport(
    bytes32 commitment,
    bytes calldata encryptedProtocol,
    bytes calldata encryptedContractAddress,
    externalEuint8 inImpactType,
    externalEuint8 inSeverity,
    bytes calldata inputProof,
    bytes calldata encryptedTitle,
    bytes calldata encryptedDescription,
    bytes calldata encryptedPoC,
    bytes calldata encryptedGistLink,
    bytes calldata encryptedAttachments,
    bytes calldata encryptedSymmetricKey
  )
    external
    returns (bytes32 submissionId);

  function reviewReport(bytes32 submissionId) external;

  function approveReport(
    bytes32 submissionId,
    uint256 bountyAmount,
    uint8 severity,
    bytes calldata encryptedNotes
  )
    external;

  function rejectReport(bytes32 submissionId, bytes calldata encryptedNotes) external;

  function decryptMyReport(bytes32 submissionId) external;

  function overrideApprove(bytes32 submissionId, uint256 bountyAmount, uint8 severity) external;

  function freezeReport(bytes32 submissionId) external;

  function unfreezeReport(bytes32 submissionId) external;

  function markDisputed(bytes32 submissionId) external;

  // ── View Functions
  // ─────────────────────────────────────────────────────

  function getSubmissionMeta(bytes32 submissionId)
    external
    view
    returns (uint256 submittedAt, ReportStatus status, bool autoEscalated, bool frozen);

  function getStatus(bytes32 submissionId) external view returns (ReportStatus);

  function getProgramId(bytes32) external view returns (uint256);

  function admin() external view returns (address);

  function getAllSubmissionIds() external view returns (bytes32[] memory);

  function getMySubmissionIds() external view returns (bytes32[] memory);

  function getCommitment(bytes32 submissionId) external view returns (bytes32);

  function getReporter(bytes32 submissionId) external view returns (address);

  function getReviewedAt(bytes32 submissionId) external view returns (uint256);

  function getAdminNotes(bytes32 submissionId) external view returns (bytes memory);

  function getBountyHandle(bytes32 submissionId) external view returns (bytes32);

  function getReportHandles(bytes32 submissionId)
    external
    view
    returns (bytes32 impactTypeHandle, bytes32 severityHandle, bytes32 bountyHandle);

  function verifyOwnership(bytes32 submissionId, bytes calldata ownershipProof) external view returns (bool);

  function getEncryptedSymmetricKey(bytes32 submissionId) external view returns (bytes memory);

  function getEncryptedReportData(bytes32 submissionId)
    external
    view
    returns (
      bytes memory encryptedProtocol,
      bytes memory encryptedContractAddress,
      bytes memory encryptedTitle,
      bytes memory encryptedDescription,
      bytes memory encryptedPoC,
      bytes memory encryptedGistLink,
      bytes memory encryptedAttachments
    );

  function getMyEncryptedReportData(bytes32 submissionId)
    external
    view
    returns (
      bytes memory encryptedProtocol,
      bytes memory encryptedContractAddress,
      bytes memory encryptedTitle,
      bytes memory encryptedDescription,
      bytes memory encryptedPoC,
      bytes memory encryptedGistLink,
      bytes memory encryptedAttachments
    );
}

