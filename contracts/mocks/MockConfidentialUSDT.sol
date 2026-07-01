// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title MockConfidentialUSDT — ERC7984 confidential token for testing
/// @notice Wraps MockERC20 USDT into confidential token at 1:1, OR admin can mint directly.
contract MockConfidentialUSDT is ZamaEthereumConfig, ERC7984ERC20Wrapper {
  constructor(
    IERC20 underlying
  ) ERC7984("Confidential USDT", "cUSDT", "") ERC7984ERC20Wrapper(underlying) {}

  /// @notice Mint cUSDT directly without needing underlying ERC20. Demo/test only.
  /// @param to Recipient address
  /// @param amount Amount in token units (6 decimals, e.g. 1000_000000 = $1000)
  function mint(address to, uint64 amount) external {
    _mint(to, FHE.asEuint64(amount));
  }
}
