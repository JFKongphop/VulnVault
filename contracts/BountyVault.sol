// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";
import {IProgramRegistry} from "./interfaces/IProgramRegistry.sol";

/// @title BountyVault — Timelocked custody with ERC7984 confidential tokens
/// @notice Fully encrypted vault using FHE.select() for graceful degradation.
///         All balances are euint64 (encrypted). Operations use FHE.select() to clamp
///         to available amounts - no reverts for insufficient funds, but silent partial operations.
///         Admin deposits via token.confidentialTransferAndCall(vault, encAmount, proof, "").
///
/// Fund state machine:
///   DEPOSIT           → availableBalance += amount (encrypted)
///   REPORT APPROVED   → availableBalance -= amount, lockedBalance += amount (clamped)
///   ZK WITHDRAWAL     → confidentialTransfer(reporter, encAmount)
///   DISPUTE:ADMIN WINS → lockedBalance -= amount, availableBalance += amount (clamped)
///   ADMIN WITHDRAW    → confidentialTransfer(admin, encAmount) (48h timelock)
contract BountyVault is ZamaEthereumConfig, IERC7984Receiver, IBountyVault {
  IERC7984 public immutable cUSDT;

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
    euint64 totalDeposited;      // Encrypted
    euint64 availableBalance;    // Encrypted
    euint64 lockedBalance;       // Encrypted
    euint64 pendingWithdrawal;   // Encrypted
    uint256 withdrawalReadyAt;   // Plaintext (timestamp)
  }

  VaultState internal _state;
  mapping(bytes32 => euint64) public lockedForReport;  // Encrypted per-report locks

  // ── Events
  // ─────────────────────────────────────────────────────────────

  event Deposited(uint256 indexed programId, uint256 amount);
  event FundsLocked(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event BountyReleased(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event FundsUnlocked(uint256 indexed programId, bytes32 indexed submissionId, uint256 amount);
  event WithdrawalInitiated(uint256 indexed programId, uint256 amount, uint256 readyAt);
  event WithdrawalExecuted(uint256 indexed programId, uint256 amount);
  event WithdrawalCancelled(uint256 indexed programId, uint256 amount);

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
    cUSDT = IERC7984(cUSDTAddr);
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

  // ── Deposit (ERC7984 Callback)
  // ────────────────────────────────────────────────────────────

  /// @notice ERC7984 receiver - admin calls token.confidentialTransferAndCall(vault, encAmount, proof, "")
  /// @param from Must be program admin
  /// @param amount Encrypted amount - added directly to encrypted state
  function onConfidentialTransferReceived(
    address /* operator */,
    address from,
    euint64 amount,
    bytes calldata
  )
    external
    override
    returns (ebool)
  {
    require(msg.sender == address(cUSDT), "Only token");
    require(from == programAdmin, "Only admin");
    
    // Initialize encrypted state if first deposit
    if (!FHE.isInitialized(_state.totalDeposited)) {
      _state.totalDeposited = amount;
      _state.availableBalance = amount;
      _state.lockedBalance = FHE.asEuint64(0);
      _state.pendingWithdrawal = FHE.asEuint64(0);
    } else {
      _state.totalDeposited = FHE.add(_state.totalDeposited, amount);
      _state.availableBalance = FHE.add(_state.availableBalance, amount);
    }
    
    // Grant ACL permissions
    FHE.allowThis(_state.totalDeposited);
    FHE.allowThis(_state.availableBalance);
    FHE.allowThis(_state.lockedBalance);
    FHE.allowThis(_state.pendingWithdrawal);
    FHE.allow(_state.totalDeposited, programAdmin);
    FHE.allow(_state.availableBalance, programAdmin);
    FHE.allow(_state.lockedBalance, programAdmin);
    FHE.allow(_state.pendingWithdrawal, programAdmin);
    
    emit Deposited(programId, 0); // Cannot emit encrypted amount
    
    ebool success = FHE.asEbool(true);
    FHE.allowTransient(success, msg.sender);
    return success;
  }

  /// @notice Legacy deposit - REMOVED, use token.confidentialTransferAndCall
  function deposit(uint256, uint256) external pure {
    revert("Use token.confidentialTransferAndCall");
  }

  // ── Lock / Release
  // ─────────────────────────────────────────────────────

  /// @notice Lock funds for a report (production path - encrypted amount).
  ///         Uses FHE.select to clamp to available balance.
  ///         If insufficient funds, locks whatever is available (silent partial lock).
  /// @param submissionId The report submission ID
  /// @param encAmount Encrypted amount to lock (from BugBountyProgram)
  function lockFunds(
    uint256,
    /* pid */
    bytes32 submissionId,
    euint64 encAmount
  )
    external
    onlyBugBountyProgram
  {
    _lockFundsInternal(submissionId, encAmount);
  }

  /// @dev Internal helper for lock logic (DRY)
  function _lockFundsInternal(bytes32 submissionId, euint64 encAmount) private {
    // Clamp to available: actual = min(encAmount, availableBalance)
    euint64 actual = FHE.select(
      FHE.ge(_state.availableBalance, encAmount), 
      encAmount, 
      _state.availableBalance
    );
    
    _state.availableBalance = FHE.sub(_state.availableBalance, actual);
    _state.lockedBalance = FHE.add(_state.lockedBalance, actual);
    
    // Initialize or add to existing lock
    if (FHE.isInitialized(lockedForReport[submissionId])) {
      lockedForReport[submissionId] = FHE.add(lockedForReport[submissionId], actual);
    } else {
      lockedForReport[submissionId] = actual;
    }
    
    // Grant ACL permissions
    FHE.allowThis(_state.availableBalance);
    FHE.allowThis(_state.lockedBalance);
    FHE.allowThis(lockedForReport[submissionId]);
    FHE.allow(_state.availableBalance, programAdmin);
    FHE.allow(_state.lockedBalance, programAdmin);
    FHE.allow(lockedForReport[submissionId], programAdmin);
    
    emit FundsLocked(programId, submissionId, 0); // Amount hidden for privacy
  }

  /// @notice Release bounty to reporter. Uses FHE.select to clamp to locked amount.
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
    euint64 requested = FHE.asEuint64(uint64(amount));
    
    // Clamp to locked: actual = min(requested, lockedForReport[submissionId])
    euint64 actual = FHE.select(
      FHE.ge(lockedForReport[submissionId], requested),
      requested,
      lockedForReport[submissionId]
    );
    
    _state.lockedBalance = FHE.sub(_state.lockedBalance, actual);
    lockedForReport[submissionId] = FHE.sub(lockedForReport[submissionId], actual);
    
    // Grant ACL permissions
    FHE.allowThis(_state.lockedBalance);
    FHE.allowThis(lockedForReport[submissionId]);
    FHE.allow(_state.lockedBalance, programAdmin);
    FHE.allow(lockedForReport[submissionId], programAdmin);
    
    // Transfer encrypted amount to recipient
    FHE.allowTransient(actual, address(cUSDT));
    FHE.allow(actual, recipient);
    cUSDT.confidentialTransfer(recipient, actual);
    
    emit BountyReleased(programId, submissionId, amount);
  }

  /// @notice Unlock funds back to available (dispute admin wins).
  function unlockFunds(
    uint256,
    /* pid */
    bytes32 submissionId
  )
    external
    onlyDisputeResolver
  {
    euint64 amount = lockedForReport[submissionId];
    
    _state.lockedBalance = FHE.sub(_state.lockedBalance, amount);
    _state.availableBalance = FHE.add(_state.availableBalance, amount);
    lockedForReport[submissionId] = FHE.asEuint64(0);
    
    // Grant ACL permissions
    FHE.allowThis(_state.lockedBalance);
    FHE.allowThis(_state.availableBalance);
    FHE.allowThis(lockedForReport[submissionId]);
    FHE.allow(_state.lockedBalance, programAdmin);
    FHE.allow(_state.availableBalance, programAdmin);
    FHE.allow(lockedForReport[submissionId], programAdmin);
    
    emit FundsUnlocked(programId, submissionId, 0); // Cannot emit encrypted amount
  }

  // ── Admin Withdrawal (Timelocked)
  // ──────────────────────────────────────

  /// @notice Initiate withdrawal. Uses FHE.select to clamp to available balance.
  ///         If insufficient funds, withdraws whatever is available (silent partial).
  function initiateWithdrawal(
    uint256,
    /* pid */
    uint256 amount
  )
    external
    onlyProgramAdmin
  {
    // Note: Cannot check if pendingWithdrawal == 0 with encrypted value
    // This means multiple pending withdrawals could overlap (design tradeoff)
    
    euint64 requested = FHE.asEuint64(uint64(amount));
    
    // Clamp to available: actual = min(requested, availableBalance)
    euint64 actual = FHE.select(
      FHE.ge(_state.availableBalance, requested),
      requested,
      _state.availableBalance
    );
    
    _state.availableBalance = FHE.sub(_state.availableBalance, actual);
    _state.pendingWithdrawal = actual;
    _state.withdrawalReadyAt = block.timestamp + WITHDRAWAL_DELAY;
    
    // Grant ACL permissions
    FHE.allowThis(_state.availableBalance);
    FHE.allowThis(_state.pendingWithdrawal);
    FHE.allow(_state.availableBalance, programAdmin);
    FHE.allow(_state.pendingWithdrawal, programAdmin);
    
    emit WithdrawalInitiated(programId, amount, _state.withdrawalReadyAt);
  }

  /// @notice Execute pending withdrawal after timelock.
  function executeWithdrawal(
    uint256 /* pid */
  )
    external
    onlyProgramAdmin
  {
    // Note: Cannot check if pendingWithdrawal > 0 with encrypted value
    // If zero, transfer will just send zero (no harm)
    require(block.timestamp >= _state.withdrawalReadyAt, "Timelock active");
    
    euint64 amount = _state.pendingWithdrawal;
    _state.pendingWithdrawal = FHE.asEuint64(0);
    
    // Grant ACL permissions
    FHE.allowThis(_state.pendingWithdrawal);
    FHE.allow(_state.pendingWithdrawal, programAdmin);
    FHE.allowTransient(amount, address(cUSDT));
    FHE.allow(amount, msg.sender);
    cUSDT.confidentialTransfer(msg.sender, amount);
    
    emit WithdrawalExecuted(programId, 0); // Cannot emit encrypted amount
  }

  /// @notice Cancel pending withdrawal.
  function cancelWithdrawal(
    uint256 /* pid */
  )
    external
    onlyProgramAdmin
  {
    // Note: Cannot check if pendingWithdrawal > 0 with encrypted value
    euint64 amount = _state.pendingWithdrawal;
    _state.pendingWithdrawal = FHE.asEuint64(0);
    _state.withdrawalReadyAt = 0;
    _state.availableBalance = FHE.add(_state.availableBalance, amount);
    
    // Grant ACL permissions
    FHE.allowThis(_state.pendingWithdrawal);
    FHE.allowThis(_state.availableBalance);
    FHE.allow(_state.pendingWithdrawal, programAdmin);
    FHE.allow(_state.availableBalance, programAdmin);
    
    emit WithdrawalCancelled(programId, 0); // Cannot emit encrypted amount
  }

  // ── Views
  // ──────────────────────────────────────────────────────────────

  /// @notice Get encrypted available balance handle (decrypt client-side)
  function getAvailableBalance(
    uint256 /* pid */
  )
    external
    view
    returns (euint64)
  {
    return _state.availableBalance;
  }

  /// @notice Get encrypted locked balance handle (decrypt client-side)
  function getLockedBalance(
    uint256 /* pid */
  )
    external
    view
    returns (euint64)
  {
    return _state.lockedBalance;
  }

  /// @notice Get encrypted pending withdrawal info
  function getPendingWithdrawal(
    uint256 /* pid */
  )
    external
    view
    returns (euint64 amount, uint256 readyAt)
  {
    return (_state.pendingWithdrawal, _state.withdrawalReadyAt);
  }

  /// @notice Get encrypted lock amount for a specific report
  function getLockedForReport(bytes32 submissionId) external view returns (euint64) {
    return lockedForReport[submissionId];
  }
}
