// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBugBountyProgram — Core FHE-encrypted report storage interface
interface IBugBountyProgram {
  enum ReportStatus {
    Pending,
    UnderReview,
    Approved,
    Rejected,
    Disputed
  }

  struct DecryptedReport {
    string protocol;
    string contractAddress;
    uint8 impactType;
    uint8 severity;
    string title;
    string description;
    string poC;
    string gistLink;
  }

  /// @notice Submit an encrypted bug report.
  function submitReport(
    bytes32 commitment,
    bytes calldata encryptedProtocol,
    bytes calldata encryptedContractAddress,
    bytes calldata encryptedImpactType,
    bytes calldata encryptedSeverity,
    bytes calldata encryptedTitle,
    bytes calldata encryptedDescription,
    bytes calldata encryptedPoC,
    bytes calldata encryptedGistLink,
    bytes calldata encryptedAttachments
  )
    external
    returns (bytes32 submissionId);

  /// @notice Admin reviews and decrypts a specific report.
  function reviewReport(bytes32 submissionId, bytes calldata adminProof) external returns (DecryptedReport memory);

  /// @notice Admin approves report with encrypted bounty.
  function approveReport(bytes32 submissionId, uint256 bountyAmount, bytes calldata encryptedNotes) external;

  /// @notice Admin rejects report with encrypted notes.
  function rejectReport(bytes32 submissionId, bytes calldata encryptedNotes) external;

  /// @notice Reporter decrypts their own report (ownership proof required).
  function decryptMyReport(
    bytes32 submissionId,
    bytes calldata ownershipProof
  )
    external
    view
    returns (DecryptedReport memory);

  /// @notice DisputeResolver forces approval when reporter wins.
  function overrideApprove(bytes32 submissionId) external;

  /// @notice Freeze a report during active dispute.
  function freezeReport(bytes32 submissionId) external;

  /// @notice Unfreeze a report after dispute resolved.
  function unfreezeReport(bytes32 submissionId) external;

  /// @notice Verify reporter owns a commitment.
  function verifyOwnership(bytes32 submissionId, bytes calldata ownershipProof) external view returns (bool);

  /// @notice Get report metadata (no sensitive fields).
  function getSubmissionMeta(bytes32 submissionId)
    external
    view
    returns (uint256 submittedAt, ReportStatus status, bool autoEscalated, bool frozen);

  /// @notice Get report status.
  function getStatus(bytes32 submissionId) external view returns (ReportStatus);

  /// @notice Get the program ID this report belongs to.
  function getProgramId(bytes32 submissionId) external view returns (uint256);

  /// @notice List all submission IDs.
  function getAllSubmissionIds() external view returns (bytes32[] memory);

  /// @notice List submission IDs for the caller's reports.
  function getMySubmissionIds() external view returns (bytes32[] memory);

  /// @notice Get the reporter address for a submission.
  function getReporter(bytes32 submissionId) external view returns (address);

  /// @notice Get the review timestamp for a submission.
  function getReviewedAt(bytes32 submissionId) external view returns (uint256);

  /// @notice Get encrypted admin notes (reporter or admin only).
  function getAdminNotes(bytes32 submissionId) external view returns (bytes memory);

  /// @notice Retrieve own encrypted report data (reporter only).
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
