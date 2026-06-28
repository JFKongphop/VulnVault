// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title MockConfidentialUSDT — ERC7984 confidential token for testing
/// @notice Wraps MockERC20 USDT into confidential token at 1:1 for BountyVault tests
contract MockConfidentialUSDT is ZamaEthereumConfig, ERC7984ERC20Wrapper {
  constructor(
    IERC20 underlying
  ) ERC7984("Confidential USDT", "cUSDT", "") ERC7984ERC20Wrapper(underlying) {}
}
