// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";
import {IProgramRegistry} from "./interfaces/IProgramRegistry.sol";
import {IProgramRegistry} from "./interfaces/IProgramRegistry.sol";

/// @title BountyVault — Timelocked custody for bug bounty funds
/// @notice Holds cUSDT per program. Locks funds on report approval so admin
///         cannot rug the pool. Admin withdrawals have a 48-hour timelock.
///
/// Fund state machine:
///   DEPOSIT           → availableBalance += amount
///   REPORT APPROVED   → availableBalance -= amount, lockedBalance += amount
///   ZK WITHDRAWAL     → lockedBalance -= amount, cUSDT → reporter
///   DISPUTE:ADMIN WINS → lockedBalance -= amount, availableBalance += amount
///   ADMIN WITHDRAW    → availableBalance -= amount (48h timelock)
contract BountyVault is IBountyVault {
  IERC20 public immutable cUSDT;

  /// @notice Program admin that deployed this vault (set at construction).
  address public immutable programAdmin;
  uint256 public immutable programId;

  /// @notice Authorized BugBountyProgram contract address.
  address public bugBountyProgram;

  /// @notice Authorized ConfidentialPayouts contract.
  address public confidentialPayouts;

  /// @notice Authorized DisputeResolver contract.
  address public disputeResolver;

  /// @notice Reference to the global registry.
  IProgramRegistry public registry;

  uint256 public constant WITHDRAWAL_DELAY = 48 hours;

  struct VaultState {
    uint256 totalDeposited;
    uint256 availableBalance;
    uint256 lockedBalance;
    uint256 pendingWithdrawal;
    uint256 withdrawalReadyAt;
  }

  VaultState internal _state;
  mapping(bytes32 => uint256) public lockedForReport;

  // ── Modifiers
  // ──────────────────────────────────────────────────────────

  modifier onlyProgramAdmin() {
    require(msg.sender == programAdmin, "Not program admin");
    _;
  }

  modifier onlyBugBountyProgram() {
    require(msg.sender == bugBountyProgram, "Not BugBountyProgram");
    _;
  }

  modifier onlyConfidentialPayouts() {
    require(msg.sender == confidentialPayouts, "Not ConfidentialPayouts");
    _;
  }

  modifier onlyDisputeResolver() {
    require(msg.sender == disputeResolver, "Not DisputeResolver");
    _;
  }

  // ── Constructor
  // ────────────────────────────────────────────────────────

  constructor(address cUSDTAddr, address adminAddr, uint256 pid) {
    require(cUSDTAddr != address(0), "Zero cUSDT");
    require(adminAddr != address(0), "Zero admin");
    cUSDT = IERC20(cUSDTAddr);
    programAdmin = adminAddr;
    programId = pid;
  }

  // ── Setters (called once by ProgramRegistry after deployment) ──────────

  function setBugBountyProgram(address addr) external {
    require(bugBountyProgram == address(0), "Already set");
    bugBountyProgram = addr;
  }

  function setConfidentialPayouts(address addr) external {
    require(confidentialPayouts == address(0), "Already set");
    confidentialPayouts = addr;
  }

  function setDisputeResolver(address addr) external {
    require(disputeResolver == address(0), "Already set");
    disputeResolver = addr;
  }

  function setRegistry(address addr) external {
    require(address(registry) == address(0), "Already set");
    registry = IProgramRegistry(addr);
  }

  // ── Deposit
  // ────────────────────────────────────────────────────────────

  function deposit(
    uint256,
    /* pid */
    uint256 amount
  )
    external
    onlyProgramAdmin
  {
    require(amount > 0, "Zero deposit");
    cUSDT.transferFrom(msg.sender, address(this), amount);
    _state.totalDeposited += amount;
    _state.availableBalance += amount;

    if (address(registry) != address(0)) {
      registry.updatePoolSize(programId, _state.availableBalance);
    }
    emit Deposited(programId, amount);
  }

  // ── Lock / Release
  // ─────────────────────────────────────────────────────

  function lockFunds(
    uint256,
    /* pid */
    bytes32 submissionId,
    uint256 amount
  )
    external
    onlyBugBountyProgram
  {
    require(_state.availableBalance >= amount, "Insufficient pool");
    _state.availableBalance -= amount;
    _state.lockedBalance += amount;
    lockedForReport[submissionId] = amount;
    emit FundsLocked(programId, submissionId, amount);
  }

  function releaseBounty(
    uint256,
    /* pid */
    bytes32 submissionId,
    address recipient,
    uint256 amount
  )
    external
    onlyConfidentialPayouts
  {
    uint256 locked = lockedForReport[submissionId];
    require(locked >= amount, "Exceeds locked");
    _state.lockedBalance -= amount;
    lockedForReport[submissionId] = locked - amount;
    cUSDT.transfer(recipient, amount);
    emit BountyReleased(programId, submissionId, amount);
  }

  function unlockFunds(
    uint256,
    /* pid */
    bytes32 submissionId
  )
    external
    onlyDisputeResolver
  {
    uint256 amount = lockedForReport[submissionId];
    require(amount > 0, "Nothing locked");
    _state.lockedBalance -= amount;
    _state.availableBalance += amount;
    lockedForReport[submissionId] = 0;
    emit FundsUnlocked(programId, submissionId, amount);
  }

  // ── Admin Withdrawal (Timelocked)
  // ──────────────────────────────────────

  function initiateWithdrawal(
    uint256,
    /* pid */
    uint256 amount
  )
    external
    onlyProgramAdmin
  {
    require(_state.availableBalance >= amount, "Insufficient available");
    require(_state.pendingWithdrawal == 0, "Pending exists");
    _state.availableBalance -= amount;
    _state.pendingWithdrawal = amount;
    _state.withdrawalReadyAt = block.timestamp + WITHDRAWAL_DELAY;
    emit WithdrawalInitiated(programId, amount, _state.withdrawalReadyAt);
  }

  function executeWithdrawal(
    uint256 /* pid */
  )
    external
    onlyProgramAdmin
  {
    require(_state.pendingWithdrawal > 0, "No pending withdrawal");
    require(block.timestamp >= _state.withdrawalReadyAt, "Timelock active");
    uint256 amount = _state.pendingWithdrawal;
    _state.pendingWithdrawal = 0;
    cUSDT.transfer(msg.sender, amount);
    emit WithdrawalExecuted(programId, amount);
  }

  function cancelWithdrawal(
    uint256 /* pid */
  )
    external
    onlyProgramAdmin
  {
    require(_state.pendingWithdrawal > 0, "No pending withdrawal");
    uint256 amount = _state.pendingWithdrawal;
    _state.pendingWithdrawal = 0;
    _state.withdrawalReadyAt = 0;
    _state.availableBalance += amount;
    emit WithdrawalCancelled(programId, amount);
  }

  // ── Views
  // ──────────────────────────────────────────────────────────────

  function getAvailableBalance(
    uint256 /* pid */
  )
    external
    view
    returns (uint256)
  {
    return _state.availableBalance;
  }

  function getLockedBalance(
    uint256 /* pid */
  )
    external
    view
    returns (uint256)
  {
    return _state.lockedBalance;
  }

  function getPendingWithdrawal(
    uint256 /* pid */
  )
    external
    view
    returns (uint256 amount, uint256 readyAt)
  {
    return (_state.pendingWithdrawal, _state.withdrawalReadyAt);
  }

  function getLockedForReport(bytes32 submissionId) external view returns (uint256) {
    return lockedForReport[submissionId];
  }

  // ── Events
  // ─────────────────────────────────────────────────────────────

  event Deposited(uint256 indexed programId, uint256 amount);
  event FundsLocked(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event BountyReleased(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event FundsUnlocked(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event WithdrawalInitiated(uint256 indexed programId, uint256 amount, uint256 readyAt);
  event WithdrawalExecuted(uint256 indexed programId, uint256 amount);
  event WithdrawalCancelled(uint256 indexed programId, uint256 amount);
}
