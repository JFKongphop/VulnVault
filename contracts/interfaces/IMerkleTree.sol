// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMerkleTree — ZK commitment Merkle tree interface
/// @notice Managed by the ZK developer. Tracks commitments and approved
///         bounty leaves for ZK proof generation.
interface IMerkleTree {
  /// @notice Insert a reporter commitment (called on submission).
  function insertCommitment(bytes32 commitment) external;

  /// @notice Insert an approved leaf (called on approval).
  function insertApprovedLeaf(bytes32 leaf) external;

  /// @notice Check whether a root belongs to a valid historical tree.
  function isKnownRoot(bytes32 root) external view returns (bool);

  /// @notice Return the current Merkle root.
  function getRoot() external view returns (bytes32);
}
