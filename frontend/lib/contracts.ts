// Contract addresses - Update these after deployment
export const CONTRACTS = {
  BUG_BOUNTY_PROGRAM: (process.env.NEXT_PUBLIC_BUG_BOUNTY_PROGRAM || '0x') as `0x${string}`,
  BOUNTY_VAULT: (process.env.NEXT_PUBLIC_BOUNTY_VAULT || '0x') as `0x${string}`,
  CONFIDENTIAL_PAYOUTS: (process.env.NEXT_PUBLIC_CONFIDENTIAL_PAYOUTS || '0x') as `0x${string}`,
  VERIFIER: (process.env.NEXT_PUBLIC_VERIFIER || '0x') as `0x${string}`,
  WHITEHAT_REPUTATION: (process.env.NEXT_PUBLIC_WHITEHAT_REPUTATION || '0x') as `0x${string}`,
  DISPUTE_RESOLVER: (process.env.NEXT_PUBLIC_DISPUTE_RESOLVER || '0x') as `0x${string}`,
  PROGRAM_REGISTRY: (process.env.NEXT_PUBLIC_PROGRAM_REGISTRY || '0x') as `0x${string}`,
  MOCK_USDT: (process.env.NEXT_PUBLIC_MOCK_USDT || '0x') as `0x${string}`,
  CONFIDENTIAL_TOKEN: (process.env.NEXT_PUBLIC_CONFIDENTIAL_TOKEN || '0x') as `0x${string}`,
} as const;

// MockERC20 ABI (underlying USDT token)
export const MOCK_ERC20_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

// ERC7984ERC20Wrapper ABI (MockConfidentialUSDT — wraps ERC20 → confidential token)
export const CONFIDENTIAL_TOKEN_ABI = [
  // confidentialBalanceOf returns a bytes32 handle to the encrypted euint64 balance
  { inputs: [{ name: 'account', type: 'address' }], name: 'confidentialBalanceOf', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  // Direct mint (demo only) — no ERC20 needed
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint64' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  // Wrap: approve underlying first, then call depositFor
  { inputs: [{ name: 'account', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'depositFor', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  // Unwrap: burns confidential token and returns underlying
  { inputs: [{ name: 'account', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'withdrawTo', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'underlying', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const;

// ABIs matching actual contract functions
export const BUG_BOUNTY_PROGRAM_ABI = [
  // Public state variable getters
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'programId', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'adminPublicKey', outputs: [{ name: '', type: 'bytes' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'getSubmissionCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'encryptedProtocol', type: 'bytes' },
      { name: 'encryptedContractAddress', type: 'bytes' },
      { name: 'inImpactType', type: 'bytes' },
      { name: 'inSeverity', type: 'bytes' },
      { name: 'inputProof', type: 'bytes' },
      { name: 'encryptedTitle', type: 'bytes' },
      { name: 'encryptedDescription', type: 'bytes' },
      { name: 'encryptedPoC', type: 'bytes' },
      { name: 'encryptedGistLink', type: 'bytes' },
      { name: 'encryptedAttachments', type: 'bytes' },
      { name: 'encryptedSymmetricKey', type: 'bytes' },
      { name: 'encryptedSymmetricKeyForReporter', type: 'bytes' },
    ],
    name: 'submitReport',
    outputs: [{ name: 'submissionId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'adminPublicKey',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'pubkey', type: 'bytes' }],
    name: 'setAdminPublicKey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'reviewReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'submissionId', type: 'bytes32' },
      { name: 'inBountyAmount', type: 'bytes' },
      { name: 'finalSeverity', type: 'uint8' },
      { name: 'inputProof', type: 'bytes' },
      { name: 'notes', type: 'bytes' },
    ],
    name: 'approveReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'rejectReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'decryptMyReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllSubmissionIds',
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMySubmissionIds',
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getReporter',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getReviewedAt',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'submissionId', type: 'bytes32' },
      { name: 'ownershipProof', type: 'bytes' },
    ],
    name: 'verifyOwnership',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getAdminNotes',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getEncryptedSymmetricKey',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getEncryptedSymmetricKeyForReporter',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getEncryptedReportData',
    outputs: [
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getMyEncryptedReportData',
    outputs: [
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
      { name: '', type: 'bytes' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const BOUNTY_VAULT_ABI = [
  {
    inputs: [],
    name: 'confidentialPayouts',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAvailableBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getLockedBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'getLockedForReport',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'programId', type: 'uint256' }],
    name: 'getPendingWithdrawal',
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'programId', type: 'uint256' },
      { name: 'amountPlaintext', type: 'uint256' },
    ],
    name: 'initiateWithdrawal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'programId', type: 'uint256' }],
    name: 'executeWithdrawal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'programId', type: 'uint256' }],
    name: 'cancelWithdrawal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const CONFIDENTIAL_PAYOUTS_ABI = [
  {
    inputs: [
      { name: 'proof', type: 'uint256[8]' },
      { name: 'root', type: 'uint256' },
      { name: 'nullifier', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'nullifiers',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const MERKLE_TREE_ABI = [
  {
    inputs: [],
    name: 'getRoot',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'commitments',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const DISPUTE_RESOLVER_ABI = [
  {
    inputs: [
      { name: 'submissionId', type: 'bytes32' },
      { name: 'reason', type: 'uint8' },
      { name: 'evidence', type: 'string' },
    ],
    name: 'raiseDispute',
    outputs: [{ name: 'disputeId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'approve', type: 'bool' },
      { name: 'notes', type: 'string' },
    ],
    name: 'submitVote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    name: 'resolveDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'submissionId', type: 'bytes32' }],
    name: 'isDisputed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    name: 'getDisputeStatus',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    name: 'getDisputeInfo',
    outputs: [
      { name: 'submissionId', type: 'bytes32' },
      { name: 'reporter', type: 'address' },
      { name: 'reason', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'outcome', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'resolvedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'arbiter', type: 'address' },
    ],
    name: 'hasArbiterVoted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    name: 'getVoteCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const PROGRAM_REGISTRY_ABI = [
  {
    inputs: [{ name: 'pid', type: 'uint256' }],
    name: 'getProgramContracts',
    outputs: [
      { name: 'bugBounty', type: 'address' },
      { name: 'vault', type: 'address' },
      { name: 'merkleTree', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getActivePrograms',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'admin', type: 'address' }],
    name: 'getAdminPrograms',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'pid', type: 'uint256' }],
    name: 'getProgram',
    outputs: [
      { name: 'admin', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'minReputationTier', type: 'uint8' },
      { name: 'active', type: 'bool' },
      { name: 'poolSize', type: 'uint256' },
      { name: 'submissionCount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'pid', type: 'uint256' },
      { name: 'addr', type: 'address' },
    ],
    name: 'isAdmin',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'pid', type: 'uint256' }],
    name: 'isProgramValid',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalStats',
    outputs: [
      { name: 'totalPrograms', type: 'uint256' },
      { name: 'activePrograms', type: 'uint256' },
      { name: 'totalSubmissions', type: 'uint256' },
      { name: 'totalPoolSize', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const WHITEHAT_REPUTATION_ABI = [
  {
    inputs: [],
    name: 'getMyScoreHandle',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMyEarningsHandle',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllTierThresholds',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const MOCK_USDT_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Export for convenience
export type ContractName = keyof typeof CONTRACTS;
