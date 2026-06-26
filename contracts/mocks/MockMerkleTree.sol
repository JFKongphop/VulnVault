// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMerkleTree} from "../interfaces/IMerkleTree.sol";

/// @title MockMerkleTree — Placeholder Merkle tree for testing
/// @notice The real MerkleTree.sol is built separately by the ZK developer.
///         This mock accepts any root as valid for integration tests.
contract MockMerkleTree is IMerkleTree {
  mapping(bytes32 => bool) public knownRoots;
  bytes32 public currentRoot;

  function insertCommitment(
    bytes32 /* commitment */
  )
    external {
    // no-op in mock
  }

  function insertApprovedLeaf(bytes32 leaf) external {
    currentRoot = keccak256(abi.encode(leaf, block.timestamp));
    knownRoots[currentRoot] = true;
  }

  function isKnownRoot(bytes32 root) external view returns (bool) {
    return knownRoots[root] || root == currentRoot;
  }

  function getRoot() external view returns (bytes32) {
    return currentRoot;
  }
}
