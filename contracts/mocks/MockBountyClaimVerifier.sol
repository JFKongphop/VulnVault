// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBountyClaimVerifier} from "../interfaces/IBountyClaimVerifier.sol";

/// @title MockBountyClaimVerifier - Always returns true for testing
/// @notice Used in tests to bypass ZK verification (real verification tested separately)
contract MockBountyClaimVerifier is IBountyClaimVerifier {
  function verifyProof(
    uint256[2] calldata /* _pA */,
    uint256[2][2] calldata /* _pB */,
    uint256[2] calldata /* _pC */,
    uint256[2] calldata /* _pubSignals */
  )
    external
    pure
    override
    returns (bool)
  {
    return true; // Always accept for testing
  }
}
