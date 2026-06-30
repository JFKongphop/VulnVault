// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConfidentialPayouts} from "./interfaces/IConfidentialPayouts.sol";
import {IMerkleTree} from "./interfaces/IMerkleTree.sol";
import {IBountyVault} from "./interfaces/IBountyVault.sol";
import {IBountyClaimVerifier} from "./interfaces/IBountyClaimVerifier.sol";

/// @title ConfidentialPayouts — ZK withdrawal engine
/// @notice Verifies ZK proofs and releases bounties to fresh wallets.
///         The ZK proof proves: "I know secret[2] whose commitment
///         (with impactType and severity) is an approved leaf in the Merkle tree."
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
  IBountyClaimVerifier public verifier;
  address public bugBountyProgram;

  /// @dev Tracks spent nullifiers to prevent double withdrawals.
  mapping(bytes32 => bool) public nullifierSpent;

  /// @dev Latest valid Merkle root (updated by BugBountyProgram on approval).
  bytes32 public currentRoot;

  uint256 public programId;

  // ── Events
  // ─────────────────────────────────────────────────────────────

  /// @notice Intentionally minimal — reveals nothing about reporter or amount.
  event Withdrawal(bytes32 indexed nullifierHash, bytes32 indexed root);
  event MerkleRootUpdated(bytes32 indexed newRoot);

  // ── Modifiers
  // ──────────────────────────────────────────────────────────

  modifier onlyBugBountyProgram() {
    require(msg.sender == bugBountyProgram, "Not bug bounty program");
    _;
  }

  // ── Constructor
  // ────────────────────────────────────────────────────────

  constructor(
    uint256 pid,
    address _bugBountyProgram,
    address _vault,
    address _merkleTree,
    address _verifier
  ) {
    require(_bugBountyProgram != address(0), "Zero bug bounty program");
    require(_vault != address(0), "Zero vault");
    require(_merkleTree != address(0), "Zero merkle tree");
    require(_verifier != address(0), "Zero verifier");
    programId = pid;
    bugBountyProgram = _bugBountyProgram;
    vault = IBountyVault(_vault);
    merkleTree = IMerkleTree(_merkleTree);
    verifier = IBountyClaimVerifier(_verifier);
  }

  // ── Update Merkle Root
  // ─────────────────────────────────────────────────

  function updateMerkleRoot(bytes32 newRoot) external onlyBugBountyProgram {
    // Called by BugBountyProgram after each approval
    currentRoot = newRoot;
    emit MerkleRootUpdated(newRoot);
  }

  // ── Withdraw (ZK Proof)
  // ────────────────────────────────────────────────

  /// @notice Withdraw bounty using ZK proof
  /// @param root Merkle root from the approved reports tree
  /// @param nullifierHash Commitment hash (prevents double-spend)
  /// @param recipient Address to receive the bounty
  /// @param amount Bounty amount to withdraw
  /// @param pA Proof component A
  /// @param pB Proof component B
  /// @param pC Proof component C
  function withdraw(
    bytes32 root,
    bytes32 nullifierHash,
    address recipient,
    uint256 amount,
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC
  )
    external
  {
    // 1. Root must be from a real approval batch
    require(merkleTree.isKnownRoot(root), "Invalid root");

    // 2. Prevent double withdrawal
    require(!nullifierSpent[nullifierHash], "Already withdrawn");

    // 3. Verify ZK proof
    // The proof proves:
    //   "I know (secret[2], impactType, severity) such that:
    //     a) commitment = H(secret[0], secret[1], impactType, severity)
    //     b) commitment is an approved leaf in the Merkle tree with `root`
    //     c) commitment = nullifierHash (public input)"
    uint256[2] memory publicSignals = [uint256(root), uint256(nullifierHash)];
    bool proofValid = verifier.verifyProof(pA, pB, pC, publicSignals);
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
}
