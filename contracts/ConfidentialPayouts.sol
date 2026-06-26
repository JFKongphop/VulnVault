// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConfidentialPayouts} from "./interfaces/IConfidentialPayouts.sol";
import {IMerkleTree} from "./interfaces/IMerkleTree.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";

/// @title ConfidentialPayouts — ZK withdrawal engine (skeleton)
/// @notice Verifies ZK proofs and releases bounties to fresh wallets.
///         The ZK proof proves: "I know secret + nullifier whose commitment
///         is an approved leaf in the Merkle tree. Pay amount to recipient."
///
///         This is a SKELETON. The ZK proof verification is a placeholder.
///         Developer will replace with a real Circom verifier.
///
/// Privacy guarantees:
///   - Reporter's submission wallet is never connected to recipient wallet
///   - Bounty amount never appears on-chain as plaintext in relation to report
///   - Nullifier prevents double-spend
contract ConfidentialPayouts is IConfidentialPayouts {
  // ── State
  // ──────────────────────────────────────────────────────────────

  IMerkleTree public merkleTree;
  IBountyVault public vault;

  /// @dev Tracks spent nullifiers to prevent double withdrawals.
  mapping(bytes32 => bool) public nullifierSpent;

  /// @dev Latest valid Merkle root (updated by BugBountyProgram on approval).
  bytes32 public currentRoot;

  uint256 public programId;
  address public admin;

  // ── Modifiers
  // ──────────────────────────────────────────────────────────

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not admin");
    _;
  }

  // ── Constructor
  // ────────────────────────────────────────────────────────

  constructor(address adminAddr, uint256 pid) {
    require(adminAddr != address(0), "Zero admin");
    admin = adminAddr;
    programId = pid;
  }

  // ── Setters
  // ────────────────────────────────────────────────────────────

  function setMerkleTree(address addr) external {
    require(address(merkleTree) == address(0), "Already set");
    merkleTree = IMerkleTree(addr);
  }

  function setVault(address addr) external {
    require(address(vault) == address(0), "Already set");
    vault = IBountyVault(addr);
  }

  // ── Update Merkle Root
  // ─────────────────────────────────────────────────

  function updateMerkleRoot(bytes32 newRoot) external {
    // Called by BugBountyProgram after each approval
    currentRoot = newRoot;
    emit MerkleRootUpdated(newRoot);
  }

  // ── Withdraw (ZK Proof)
  // ────────────────────────────────────────────────

  function withdraw(
    bytes32 root,
    bytes32 nullifierHash,
    address recipient,
    uint256 amount,
    bytes calldata /* zkProof */
  )
    external
  {
    // 1. Root must be from a real approval batch
    require(merkleTree.isKnownRoot(root), "Invalid root");

    // 2. Prevent double withdrawal
    require(!nullifierSpent[nullifierHash], "Already withdrawn");

    // 3. Verify ZK proof
    // TODO: Replace with real ZK verifier (Circom + snarkjs)
    // The proof proves:
    //   "I know (secret, nullifier) such that:
    //     a) keccak256(secret, nullifier) = commitment
    //     b) commitment is an approved leaf in the Merkle tree with `root`
    //     c) nullifierHash = keccak256(nullifier)
    //     d) amount matches the approved leaf"
    bool proofValid = true; // placeholder
    require(proofValid, "Invalid proof");

    // 4. Mark nullifier spent
    nullifierSpent[nullifierHash] = true;

    // 5. Pull from vault and pay reporter's fresh wallet
    vault.releaseBounty(programId, nullifierHash, recipient, amount);

    // 6. Emit — reveals nothing sensitive
    emit Withdrawal(nullifierHash, root);
  }

  // ── Views
  // ──────────────────────────────────────────────────────────────

  function isNullifierSpent(bytes32 nullifier) external view returns (bool) {
    return nullifierSpent[nullifier];
  }

  // ── Events
  // ─────────────────────────────────────────────────────────────

  /// @notice Intentionally minimal — reveals nothing about reporter or amount.
  event Withdrawal(bytes32 indexed nullifierHash, bytes32 indexed root);
  event MerkleRootUpdated(bytes32 indexed newRoot);
}
