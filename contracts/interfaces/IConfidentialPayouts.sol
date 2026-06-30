// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IConfidentialPayouts — ZK withdrawal engine interface
/// @notice Verifies ZK proofs and releases bounties to fresh wallets.
interface IConfidentialPayouts {
  /// @notice Withdraw bounty via ZK proof. Reporter proves knowledge of
  ///         secret[2] whose commitment (with impactType, severity) is in the Merkle tree.
  function withdraw(
    bytes32 root,
    bytes32 nullifierHash,
    address recipient,
    uint256 amount,
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC
  )
    external;

  /// @notice Register a new Merkle root after approval batch.
  function updateMerkleRoot(bytes32 newRoot) external;

  /// @notice Check whether a nullifier has already been spent.
  function isNullifierSpent(bytes32 nullifier) external view returns (bool);
}
