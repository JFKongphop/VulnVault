// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTree} from "./MerkleTree.sol";
import {IMerkleTree} from "./interfaces/IMerkleTree.sol";

/// @title BugBountyMerkleTree — Real Poseidon Merkle tree for VulnVault
/// @notice Wraps the Tornado Cash-style MerkleTree with the IMerkleTree interface
///         and access control. Only the authorised BugBountyProgram contract may
///         insert leaves; the owner (ProgramRegistry) may authorise addresses.
///
/// Hardcoded to 20 levels (2^20 = ~1M leaves) matching the ZK circuit.
contract BugBountyMerkleTree is MerkleTree, IMerkleTree {
  address public immutable owner;
  mapping(address => bool) public authorised;

  // BN254 scalar field — keccak256 outputs can exceed this, so we reduce.
  uint256 private constant _FIELD =
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

  modifier onlyAuthorised() {
    require(authorised[msg.sender] || msg.sender == owner, "Not authorised");
    _;
  }

  constructor() MerkleTree(20) {
    owner = msg.sender;
  }

  function authorise(address account) external {
    require(msg.sender == owner, "Not owner");
    authorised[account] = true;
  }

  /// @dev Reduce an arbitrary bytes32 into a BN254 field element so
  ///      Poseidon hash never rejects it.
  function _toField(bytes32 value) internal pure returns (bytes32) {
    return bytes32(uint256(value) % _FIELD);
  }

  // ── IMerkleTree
  // ─────────────────────────────────────────────────────────

  /// @inheritdoc IMerkleTree
  function insertCommitment(bytes32 commitment) external override onlyAuthorised {
    bytes32 fieldCommitment = _toField(commitment);
    _commitments[fieldCommitment] = true;
    _insert(fieldCommitment);
  }

  /// @inheritdoc IMerkleTree
  function insertApprovedLeaf(bytes32 leaf) external override onlyAuthorised {
    _insert(_toField(leaf));
  }

  /// @inheritdoc IMerkleTree
  function commitments(bytes32 commitment) external view override returns (bool) {
    return _commitments[commitment];
  }

  /// @inheritdoc IMerkleTree
  function isKnownRoot(bytes32 root) public view override(MerkleTree, IMerkleTree) returns (bool) {
    return MerkleTree.isKnownRoot(root);
  }

  /// @inheritdoc IMerkleTree
  function getRoot() external view override returns (bytes32) {
    return getLastRoot();
  }
}
