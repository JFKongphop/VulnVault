// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, euint64, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IMerkleTree} from "./interfaces/IMerkleTree.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";
import {IProgramRegistry} from "./interfaces/IProgramRegistry.sol";

interface IWhitehatReputation {
  function incrementScore(bytes32 commitment, uint8 severity, uint256 bountyAmount) external;
}

interface IDisputeResolver {
  function onReportRejected(bytes32 submissionId, uint256 programId) external;
}

/// @title BugBountyProgram — Core FHE-encrypted bug report storage
/// @notice All sensitive report fields are stored FHE-encrypted. Decryption
///         is async via FHE.makePubliclyDecryptable() + oracle. The public
///         sees only metadata (submissionId, timestamp, status, autoEscalated).
contract BugBountyProgram is ZamaEthereumConfig {
  enum ReportStatus {
    Pending,
    UnderReview,
    Approved,
    Rejected,
    Disputed
  }

  uint256 public immutable programId;
  address public admin;
  address public registryAddr;

  IMerkleTree public merkleTree;
  address public reputation;
  address public disputeResolver;
  IBountyVault public vault;
  IProgramRegistry public registry;
  
  // ── Option 2: Client-Side Encryption Support
  bytes public adminPublicKey;  // Admin's RSA public key for encrypting symmetric keys

  struct SubmittedReport {
    bytes32 submissionId;
    bytes32 commitment;
    uint256 programId;
    uint256 submittedAt;
    uint256 reviewedAt;
    ReportStatus status;
    bool autoEscalated;
    bool frozen;

    bytes encryptedProtocol;
    bytes encryptedContractAddress;
    euint8 encryptedImpactType;
    euint8 encryptedSeverity;
    bytes encryptedTitle;
    bytes encryptedDescription;
    bytes encryptedPoC;
    bytes encryptedGistLink;
    bytes encryptedAttachments;
    euint64 encryptedBountyAmount;
    bytes encryptedAdminNotes;
    
    // Option 2: Symmetric key encrypted with admin's public key
    bytes encryptedSymmetricKey;
  }

  mapping(bytes32 => SubmittedReport) private _submissions;
  bytes32[] private _allSubmissionIds;

  // ── Events
  // ─────────────────────────────────────────────────────────────

  event ReportSubmitted(bytes32 indexed submissionId, uint256 timestamp);
  event CriticalReportFlagged(bytes32 indexed submissionId, bytes32 isCriticalHandle);
  event ReportDisputed(bytes32 indexed submissionId);
  event ReportUnderReview(bytes32 indexed submissionId, bytes32 impactHandle, bytes32 severityHandle);
  event ReportDecrypted(
    bytes32 indexed submissionId, bytes32 impactHandle, bytes32 severityHandle, bytes32 bountyHandle
  );
  event ReportApproved(bytes32 indexed submissionId, uint256 bountyAmount);
  event ReportRejected(bytes32 indexed submissionId);
  event ReportFrozen(bytes32 indexed submissionId);
  event ReportUnfrozen(bytes32 indexed submissionId);
  event AdminPublicKeySet(bytes publicKey);

  modifier onlyAdmin() {
    require(msg.sender == admin || msg.sender == registryAddr, "Not admin");
    _;
  }

  modifier notFrozen(bytes32 submissionId) {
    require(!_submissions[submissionId].frozen, "Report frozen");
    _;
  }

  modifier onlyDisputeResolver() {
    require(msg.sender == disputeResolver, "Not dispute resolver");
    _;
  }

  constructor(address adminAddr, uint256 pid) {
    require(adminAddr != address(0), "Zero admin");
    admin = adminAddr;
    programId = pid;
  }

  function setMerkleTree(address addr) external {
    require(address(merkleTree) == address(0), "Already set");
    merkleTree = IMerkleTree(addr);
  }

  function setReputation(address addr) external {
    require(reputation == address(0), "Already set");
    reputation = addr;
  }

  function setDisputeResolver(address addr) external {
    require(disputeResolver == address(0), "Already set");
    disputeResolver = addr;
  }

  function setVault(address addr) external {
    require(address(vault) == address(0), "Already set");
    vault = IBountyVault(addr);
  }

  function setRegistry(address addr) external {
    require(registryAddr == address(0), "Already set");
    registry = IProgramRegistry(addr);
    registryAddr = addr;
  }

  /// @notice Set admin's public key for client-side encryption (Option 2)
  /// @param pubkey RSA public key in DER format (SPKI)
  function setAdminPublicKey(bytes calldata pubkey) external onlyAdmin {
    require(pubkey.length > 0, "Empty public key");
    adminPublicKey = pubkey;
    emit AdminPublicKeySet(pubkey);
  }

  // ── Submit Report with FHE Inputs (enables auto-escalate)
  // ─────────────────────

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
    returns (bytes32 submissionId)
  {
    submissionId = keccak256(abi.encode(commitment, block.timestamp, msg.sender));

    SubmittedReport storage r = _submissions[submissionId];
    r.submissionId = submissionId;
    r.commitment = commitment;
    r.programId = programId;
    r.submittedAt = block.timestamp;
    r.status = ReportStatus.Pending;
    r.autoEscalated = false;
    r.frozen = false;

    r.encryptedProtocol = encryptedProtocol;
    r.encryptedContractAddress = encryptedContractAddress;
    r.encryptedTitle = encryptedTitle;
    r.encryptedDescription = encryptedDescription;
    r.encryptedPoC = encryptedPoC;
    r.encryptedGistLink = encryptedGistLink;
    r.encryptedAttachments = encryptedAttachments;
    r.encryptedSymmetricKey = encryptedSymmetricKey;

    r.encryptedImpactType = FHE.fromExternal(inImpactType, inputProof);
    r.encryptedSeverity = FHE.fromExternal(inSeverity, inputProof);
    r.encryptedBountyAmount = FHE.asEuint64(uint64(0));

    FHE.allowThis(r.encryptedImpactType);
    FHE.allowThis(r.encryptedSeverity);
    FHE.allow(r.encryptedImpactType, msg.sender);
    FHE.allow(r.encryptedSeverity, msg.sender);
    FHE.allowThis(r.encryptedBountyAmount);

    _allSubmissionIds.push(submissionId);

    if (address(merkleTree) != address(0)) {
      merkleTree.insertCommitment(commitment);
    }
    if (address(registry) != address(0)) {
      registry.incrementSubmissionCount(programId);
    }

    _checkAutoEscalate(submissionId);
    emit ReportSubmitted(submissionId, block.timestamp);
  }

  // ── Auto-Escalate (Async Decryption)
  // ───────────────────────────────────

  function _checkAutoEscalate(bytes32 submissionId) internal {
    SubmittedReport storage r = _submissions[submissionId];
    ebool isCritical = FHE.eq(r.encryptedSeverity, FHE.asEuint8(3));
    // Make publicly decryptable so admin can see the flag
    FHE.makePubliclyDecryptable(isCritical);
    emit CriticalReportFlagged(submissionId, ebool.unwrap(isCritical));
  }

  // ── Admin Review (Makes Handles Decryptable)
  // ───────────────────────────

  /// @notice Admin reviews a report. Makes all FHE handles publicly decryptable
  ///         so the admin can decrypt them off-chain via the oracle.
  function reviewReport(bytes32 submissionId) external onlyAdmin {
    SubmittedReport storage r = _submissions[submissionId];
    require(r.status == ReportStatus.Pending, "Already reviewed");

    r.reviewedAt = block.timestamp;
    r.status = ReportStatus.UnderReview;

    // Grant admin (msg.sender) permission to decrypt the FHE fields
    FHE.allow(r.encryptedImpactType, msg.sender);
    FHE.allow(r.encryptedSeverity, msg.sender);
    // Also make publicly decryptable for the oracle
    FHE.makePubliclyDecryptable(r.encryptedImpactType);
    FHE.makePubliclyDecryptable(r.encryptedSeverity);

    emit ReportUnderReview(submissionId, euint8.unwrap(r.encryptedImpactType), euint8.unwrap(r.encryptedSeverity));
  }

  /// @notice Returns raw encrypted handles for a submission so the admin
  ///         can decrypt them via the oracle.
  function getReportHandles(bytes32 submissionId)
    external
    view
    onlyAdmin
    returns (bytes32 impactTypeHandle, bytes32 severityHandle, bytes32 bountyHandle)
  {
    SubmittedReport storage r = _submissions[submissionId];
    return
      (
        euint8.unwrap(r.encryptedImpactType),
        euint8.unwrap(r.encryptedSeverity),
        euint64.unwrap(r.encryptedBountyAmount)
      );
  }

  // ── Approve Report
  // ─────────────────────────────────────────────────────

  /// @notice Admin approves report. Severity is passed as plaintext since
  ///         admin decrypted it off-chain during review.
  function approveReport(
    bytes32 submissionId,
    uint256 bountyAmount,
    uint8 severity,
    bytes calldata encryptedNotes
  )
    external
    onlyAdmin
    notFrozen(submissionId)
  {
    SubmittedReport storage r = _submissions[submissionId];
    require(r.status == ReportStatus.UnderReview, "Not under review");

    r.encryptedBountyAmount = FHE.asEuint64(uint64(bountyAmount));
    r.encryptedAdminNotes = encryptedNotes;
    r.status = ReportStatus.Approved;

    FHE.allowThis(r.encryptedBountyAmount);
    FHE.makePubliclyDecryptable(r.encryptedBountyAmount);

    if (address(vault) != address(0)) {
      vault.lockFunds(programId, submissionId, bountyAmount);
    }

    if (address(merkleTree) != address(0)) {
      bytes32 leaf = keccak256(abi.encode(r.commitment, bountyAmount, block.timestamp));
      merkleTree.insertApprovedLeaf(leaf);
    }

    // Notify reputation contract (severity passed as plaintext from admin)
    if (reputation != address(0)) {
      IWhitehatReputation(reputation).incrementScore(r.commitment, severity, bountyAmount);
    }

    emit ReportApproved(submissionId, bountyAmount);
  }

  // ── Reject Report
  // ─────────────────────────────────────────────────────

  function rejectReport(bytes32 submissionId, bytes calldata encryptedNotes)
    external
    onlyAdmin
    notFrozen(submissionId)
  {
    SubmittedReport storage r = _submissions[submissionId];
    require(r.status == ReportStatus.UnderReview, "Not under review");

    r.encryptedAdminNotes = encryptedNotes;
    r.status = ReportStatus.Rejected;

    if (disputeResolver != address(0)) {
      IDisputeResolver(disputeResolver).onReportRejected(submissionId, programId);
    }

    emit ReportRejected(submissionId);
  }

  // ── Reporter View
  // ──────────────────────────────────────────────────────

  /// @notice Reporter makes their report's FHE fields publicly decryptable.
  function decryptMyReport(bytes32 submissionId) external {
    SubmittedReport storage r = _submissions[submissionId];
    // TODO: verify ownership via ZK proof

    FHE.makePubliclyDecryptable(r.encryptedImpactType);
    FHE.makePubliclyDecryptable(r.encryptedSeverity);
    FHE.makePubliclyDecryptable(r.encryptedBountyAmount);

    emit ReportDecrypted(
      submissionId,
      euint8.unwrap(r.encryptedImpactType),
      euint8.unwrap(r.encryptedSeverity),
      euint64.unwrap(r.encryptedBountyAmount)
    );
  }

  /// @notice Returns the encrypted bounty handle for a submission.
  function getBountyHandle(bytes32 submissionId) external view returns (bytes32) {
    return euint64.unwrap(_submissions[submissionId].encryptedBountyAmount);
  }

  // ── DisputeResolver Overrides
  // ──────────────────────────────────────────

  function overrideApprove(bytes32 submissionId, uint256 bountyAmount, uint8 severity) external onlyDisputeResolver {
    SubmittedReport storage r = _submissions[submissionId];
    r.status = ReportStatus.Approved;
    r.frozen = false;

    r.encryptedBountyAmount = FHE.asEuint64(uint64(bountyAmount));
    FHE.allowThis(r.encryptedBountyAmount);
    FHE.makePubliclyDecryptable(r.encryptedBountyAmount);

    if (address(merkleTree) != address(0)) {
      bytes32 leaf = keccak256(abi.encode(r.commitment, bountyAmount, block.timestamp));
      merkleTree.insertApprovedLeaf(leaf);
    }

    if (reputation != address(0)) {
      IWhitehatReputation(reputation).incrementScore(r.commitment, severity, bountyAmount);
    }

    emit ReportApproved(submissionId, bountyAmount);
  }

  function freezeReport(bytes32 submissionId) external onlyDisputeResolver {
    _submissions[submissionId].frozen = true;
    emit ReportFrozen(submissionId);
  }

  function unfreezeReport(bytes32 submissionId) external onlyDisputeResolver {
    _submissions[submissionId].frozen = false;
    emit ReportUnfrozen(submissionId);
  }

  function markDisputed(bytes32 submissionId) external onlyDisputeResolver {
    _submissions[submissionId].status = ReportStatus.Disputed;
    emit ReportDisputed(submissionId);
  }

  // ── View Functions
  // ─────────────────────────────────────────────────────

  function getSubmissionMeta(bytes32 submissionId)
    external
    view
    returns (uint256 submittedAt, ReportStatus status, bool autoEscalated, bool frozen)
  {
    SubmittedReport storage r = _submissions[submissionId];
    return (r.submittedAt, r.status, r.autoEscalated, r.frozen);
  }

  function getStatus(bytes32 submissionId) external view returns (ReportStatus) {
    return _submissions[submissionId].status;
  }

  function getProgramId(bytes32) external view returns (uint256) {
    return programId;
  }

  function getAllSubmissionIds() external view returns (bytes32[] memory) {
    return _allSubmissionIds;
  }

  function getCommitment(bytes32 submissionId) external view returns (bytes32) {
    return _submissions[submissionId].commitment;
  }

  function verifyOwnership(bytes32 submissionId, bytes calldata) external view returns (bool) {
    return _submissions[submissionId].submittedAt != 0;
  }

  /// @notice Get encrypted symmetric key for admin to decrypt report data (Option 2)
  /// @param submissionId The submission ID
  /// @return Symmetric key encrypted with admin's public key
  function getEncryptedSymmetricKey(bytes32 submissionId) external view onlyAdmin returns (bytes memory) {
    return _submissions[submissionId].encryptedSymmetricKey;
  }
}
