// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";
import {IBugBountyProgram} from "./interfaces/IBugBountyProgram.sol";
import {IWhitehatReputation} from "./interfaces/IWhitehatReputation.sol";

/// @title DisputeResolver — FHE-encrypted voting for report escalation
/// @notice Arbiters review and vote using FHE-encrypted ballots.
///         Individual votes are never revealed — only the final tally
///         is made publicly decryptable via the oracle.
contract DisputeResolver is ZamaEthereumConfig {
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

  uint256 public constant VOTING_PERIOD = 5 days;
  uint256 public constant MIN_ARBITERS = 3;
  uint256 public constant REQUIRED_QUORUM = 2;

  uint256 public disputeCount;
  struct Dispute {
    uint256 disputeId;
    bytes32 submissionId;
    uint256 programId;
    uint256 raisedAt;
    uint256 votingDeadline;
    DisputeStatus status;
    bytes32 reporterCommitment;
    bytes encryptedReason;
    bytes encryptedEvidence;
    mapping(address => euint8) encryptedVotes;
    mapping(address => bool) hasVoted;
  }

  mapping(uint256 => Dispute) private _disputes;
  mapping(bytes32 => uint256) public submissionDispute;
  mapping(uint256 => address[]) public programArbiters;

  // Stored handles from resolveDispute — publicly decryptable via oracle
  mapping(uint256 => bytes32) private _forReporterHandle;
  mapping(uint256 => bytes32) private _forAdminHandle;
  mapping(uint256 => bytes32) private _reporterWonHandle;

  address public bugBountyProgram;
  IBountyVault public vault;
  address public reputation;


  event DisputeRaised(uint256 indexed disputeId, bytes32 indexed submissionId);
  event DisputeWindowOpen(bytes32 indexed submissionId, uint256 deadline);
  event VoteSubmitted(uint256 indexed disputeId, address indexed arbiter);
  event DisputeResolved(
    uint256 indexed disputeId, 
    bytes32 forReporterHandle, 
    bytes32 forAdminHandle, 
    bytes32 reporterWonHandle
  );
  event OutcomeExecuted(uint256 indexed disputeId, bool reporterWon);
  event BugBountyProgramSet(address indexed program);
  event VaultSet(address indexed vault);
  event ReputationSet(address indexed reputation);
  event ArbitersSet(uint256 indexed programId, address[] arbiters);

  modifier onlyArbiter(uint256 disputeId) {
    Dispute storage d = _disputes[disputeId];
    address[] storage arbiters = programArbiters[d.programId];
    bool found;
    for (uint256 i = 0; i < arbiters.length; i++) {
      if (arbiters[i] == msg.sender) {
        found = true;
        break;
      }
    }
    require(found, "Not an arbiter");
    _;
  }

  modifier onlyBugBountyProgram() {
    require(msg.sender == bugBountyProgram, "Not BugBountyProgram");
    _;
  }

  modifier onlyProgramAdmin(uint256 disputeId) {
    address admin = IBugBountyProgram(bugBountyProgram).admin();
    require(msg.sender == admin, "Only program admin");
    _;
  }

  function setBugBountyProgram(address addr) external {
    require(bugBountyProgram == address(0), "Already set");
    bugBountyProgram = addr;
    emit BugBountyProgramSet(addr);
  }

  function setVault(address addr) external {
    require(address(vault) == address(0), "Already set");
    vault = IBountyVault(addr);
    emit VaultSet(addr);
  }

  function setReputation(address addr) external {
    require(reputation == address(0), "Already set");
    reputation = addr;
    emit ReputationSet(addr);
  }

  function setProgramArbiters(uint256 programId, address[] calldata arbiters) external {
    require(programArbiters[programId].length == 0, "Already set");
    require(arbiters.length >= MIN_ARBITERS, "Need at least 3 arbiters");
    programArbiters[programId] = arbiters;
    emit ArbitersSet(programId, arbiters);
  }

  function raiseDispute(
    bytes32 submissionId,
    bytes calldata encryptedReason,
    bytes calldata encryptedEvidence,
    bytes calldata
  )
    external
    returns (uint256 disputeId)
  {
    require(
      IBugBountyProgram(bugBountyProgram).getStatus(submissionId) == IBugBountyProgram.ReportStatus.Rejected,
      "Report not rejected"
    );
    require(submissionDispute[submissionId] == 0, "Already disputed");

    disputeId = disputeCount++;
    Dispute storage d = _disputes[disputeId];
    d.disputeId = disputeId;
    d.submissionId = submissionId;
    d.programId = IBugBountyProgram(bugBountyProgram).getProgramId(submissionId);
    d.raisedAt = block.timestamp;
    d.votingDeadline = block.timestamp + VOTING_PERIOD;
    d.status = DisputeStatus.Voting;
    d.encryptedReason = encryptedReason;
    d.encryptedEvidence = encryptedEvidence;
    d.reporterCommitment = IBugBountyProgram(bugBountyProgram).getCommitment(submissionId);
    submissionDispute[submissionId] = disputeId;
    IBugBountyProgram(bugBountyProgram).freezeReport(submissionId);
    IBugBountyProgram(bugBountyProgram).markDisputed(submissionId);
    emit DisputeRaised(disputeId, submissionId);
  }

  function submitVote(
    uint256 disputeId, 
    externalEuint8 encryptedVote,
    bytes calldata inputProof
  ) external onlyArbiter(disputeId) {
    Dispute storage d = _disputes[disputeId];
    require(d.status == DisputeStatus.Voting, "Not in voting phase");
    require(block.timestamp < d.votingDeadline, "Voting closed");
    require(!d.hasVoted[msg.sender], "Already voted");
    d.encryptedVotes[msg.sender] = FHE.fromExternal(encryptedVote, inputProof);
    d.hasVoted[msg.sender] = true;
    FHE.allowThis(d.encryptedVotes[msg.sender]);
    emit VoteSubmitted(disputeId, msg.sender);
  }

  function resolveDispute(uint256 disputeId) external {
    Dispute storage d = _disputes[disputeId];
    require(d.status == DisputeStatus.Voting, "Already resolved");
    require(block.timestamp >= d.votingDeadline || _allVotesIn(disputeId), "Voting still open");

    address[] storage arbiters = programArbiters[d.programId];
    euint8 forReporter = FHE.asEuint8(0);
    euint8 forAdmin = FHE.asEuint8(0);

    for (uint256 i = 0; i < arbiters.length; i++) {
      address arbiter = arbiters[i];
      if (!d.hasVoted[arbiter]) continue;
      euint8 vote = d.encryptedVotes[arbiter];
      ebool votedForReporter = FHE.eq(vote, FHE.asEuint8(1));
      ebool votedForAdmin = FHE.eq(vote, FHE.asEuint8(2));
      forReporter = FHE.add(forReporter, FHE.select(votedForReporter, FHE.asEuint8(1), FHE.asEuint8(0)));
      forAdmin = FHE.add(forAdmin, FHE.select(votedForAdmin, FHE.asEuint8(1), FHE.asEuint8(0)));
    }

    FHE.makePubliclyDecryptable(forReporter);
    FHE.makePubliclyDecryptable(forAdmin);

    ebool reporterWonEnc = FHE.gt(forReporter, forAdmin);
    FHE.makePubliclyDecryptable(reporterWonEnc);

    d.status = DisputeStatus.Resolved;
    _forReporterHandle[disputeId] = euint8.unwrap(forReporter);
    _forAdminHandle[disputeId] = euint8.unwrap(forAdmin);
    _reporterWonHandle[disputeId] = ebool.unwrap(reporterWonEnc);
    emit DisputeResolved(disputeId, euint8.unwrap(forReporter), euint8.unwrap(forAdmin), ebool.unwrap(reporterWonEnc));
  }

  /// @notice Execute dispute outcome based on vote result.
  ///         Admin must check off-chain decrypted vote result before calling.
  ///         If vote favors reporter: bountyAmount MUST be > 0
  ///         If vote favors admin: bountyAmount MUST be 0
  /// @param disputeId The dispute ID
  /// @param reporterWon The decrypted vote result (true = reporter won, false = admin won)
  /// @param bountyAmount Bounty to pay if reporter won (must be > 0 if reporterWon)
  /// @param severity Severity level if reporter won
  function executeOutcome(
    uint256 disputeId, 
    bool reporterWon,
    uint256 bountyAmount, 
    uint8 severity
  ) external onlyProgramAdmin(disputeId) {
    Dispute storage d = _disputes[disputeId];
    require(d.status == DisputeStatus.Resolved, "Not yet resolved");

    if (reporterWon) {
      // Vote result: Reporter wins → Admin MUST approve with bounty
      require(bountyAmount > 0, "Bounty required if reporter won");
      require(severity > 0, "Severity required if reporter won");
      
      IBugBountyProgram(bugBountyProgram).overrideApprove(d.submissionId, bountyAmount, severity);
      if (reputation != address(0)) {
        IWhitehatReputation(reputation).incrementScore(d.reporterCommitment, 2, 0);
      }
      emit OutcomeExecuted(disputeId, true);
    } else {
      // Vote result: Admin wins → No payment allowed
      require(bountyAmount == 0, "Cannot pay bounty if admin won");
      
      IBugBountyProgram(bugBountyProgram).unfreezeReport(d.submissionId);
      if (address(vault) != address(0)) {
        vault.unlockFunds(d.programId, d.submissionId);
      }
      emit OutcomeExecuted(disputeId, false);
    }
    d.status = DisputeStatus.Executed;
  }

  function onReportRejected(bytes32 submissionId, uint256) external onlyBugBountyProgram {
    emit DisputeWindowOpen(submissionId, block.timestamp + VOTING_PERIOD);
  }

  function isDisputed(bytes32 submissionId) external view returns (bool) {
    return submissionDispute[submissionId] != 0;
  }

  function getDisputeStatus(uint256 disputeId) external view returns (DisputeStatus) {
    return _disputes[disputeId].status;
  }

  /// @notice Returns the FHE handles emitted at resolution.
  ///         Handles are publicly decryptable via oracle after resolveDispute.
  function getDisputeOutcome(uint256 disputeId)
    external
    view
    returns (DisputeStatus status, bytes32 forReporter, bytes32 forAdmin, bytes32 reporterWon)
  {
    Dispute storage d = _disputes[disputeId];
    status = d.status;
    forReporter = _forReporterHandle[disputeId];
    forAdmin = _forAdminHandle[disputeId];
    reporterWon = _reporterWonHandle[disputeId];
  }

  function _allVotesIn(uint256 disputeId) internal view returns (bool) {
    Dispute storage d = _disputes[disputeId];
    address[] storage arbiters = programArbiters[d.programId];
    uint256 count;
    for (uint256 i = 0; i < arbiters.length; i++) {
      if (d.hasVoted[arbiters[i]]) count++;
    }
    return count >= REQUIRED_QUORUM;
  }

  // ── UX View Functions
  // ─────────────────────────────────────────────────────

  /// @notice Get comprehensive dispute information for frontend/arbiters
  function getDisputeInfo(uint256 disputeId)
    external
    view
    returns (
      bytes32 submissionId,
      uint256 programId,
      uint256 raisedAt,
      uint256 votingDeadline,
      DisputeStatus status,
      address[] memory arbiters
    )
  {
    Dispute storage d = _disputes[disputeId];
    return (
      d.submissionId,
      d.programId,
      d.raisedAt,
      d.votingDeadline,
      d.status,
      programArbiters[d.programId]
    );
  }

  /// @notice Check if a specific arbiter has voted (avoids revert)
  function hasArbiterVoted(uint256 disputeId, address arbiter) external view returns (bool) {
    return _disputes[disputeId].hasVoted[arbiter];
  }

  /// @notice Get encrypted dispute materials for arbiter review
  function getDisputeEvidence(uint256 disputeId)
    external
    view
    returns (bytes memory encryptedReason, bytes memory encryptedEvidence)
  {
    Dispute storage d = _disputes[disputeId];
    return (d.encryptedReason, d.encryptedEvidence);
  }

  /// @notice Get vote count for a dispute (after resolution)
  function getVoteCount(uint256 disputeId) external view returns (uint256) {
    Dispute storage d = _disputes[disputeId];
    address[] storage arbiters = programArbiters[d.programId];
    uint256 count;
    for (uint256 i = 0; i < arbiters.length; i++) {
      if (d.hasVoted[arbiters[i]]) count++;
    }
    return count;
  }
}
