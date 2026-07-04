'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useUserDecrypt } from '@zama-fhe/react-sdk';
import { CONTRACTS, WHITEHAT_REPUTATION_ABI } from '@/lib/contracts';

export function useReputation(commitment: `0x${string}` | undefined) {
  const { address } = useAccount();
  const [allowTxHash, setAllowTxHash] = useState<`0x${string}` | undefined>();

  // Step 1: Check if commitment is registered
  const { data: isRegistered } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'isRegisteredCommitment',
    args: commitment ? [commitment] : undefined,
    query: { enabled: !!commitment },
  });

  // Step 2: Read score + earnings handles (raw bytes32 from contract)
  const { data: scoreHandle } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getMyScoreHandle',
    args: commitment ? [commitment] : undefined,
    query: { enabled: !!commitment && !!isRegistered },
  });

  const { data: earningsHandle } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getMyEarningsHandle',
    args: commitment ? [commitment] : undefined,
    query: { enabled: !!commitment && !!isRegistered },
  });

  // Step 3: Public (non-encrypted) approved report count
  const { data: approvedCount } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getApprovedCount',
    args: commitment ? [commitment] : undefined,
    query: { enabled: !!commitment && !!isRegistered },
  });

  // Step 4: Tier thresholds (public)
  const { data: tierThresholds } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getAllTierThresholds',
  });

  // Step 5: Send allowScoreDecrypt + allowEarningsDecrypt tx so FHE.allow(handle, msg.sender)
  const { writeContractAsync, isPending: isAllowing } = useWriteContract();
  const { isSuccess: allowConfirmed, isLoading: allowPending } = useWaitForTransactionReceipt({
    hash: allowTxHash,
  });

  const grantDecryptPermission = async () => {
    if (!commitment) throw new Error('No commitment');
    // Call allowScoreDecrypt — grants FHE.allow(scoreHandle, msg.sender)
    const hash = await writeContractAsync({
      address: CONTRACTS.WHITEHAT_REPUTATION,
      abi: WHITEHAT_REPUTATION_ABI,
      functionName: 'allowScoreDecrypt',
      args: [commitment],
    });
    setAllowTxHash(hash);
    // Also grant earnings decrypt in a second tx
    await writeContractAsync({
      address: CONTRACTS.WHITEHAT_REPUTATION,
      abi: WHITEHAT_REPUTATION_ABI,
      functionName: 'allowEarningsDecrypt',
      args: [commitment],
    });
  };

  // Step 6: Use Zama SDK user-decrypt — runs automatically once handles are available
  // and permission has been granted (allowConfirmed)
  const scoreDecrypt = useUserDecrypt(
    {
      handles: scoreHandle
        ? [{ handle: scoreHandle as `0x${string}`, contractAddress: CONTRACTS.WHITEHAT_REPUTATION }]
        : [],
    },
    { enabled: !!scoreHandle && allowConfirmed },
  );

  const earningsDecrypt = useUserDecrypt(
    {
      handles: earningsHandle
        ? [{ handle: earningsHandle as `0x${string}`, contractAddress: CONTRACTS.WHITEHAT_REPUTATION }]
        : [],
    },
    { enabled: !!earningsHandle && allowConfirmed },
  );

  // Extract decrypted values from the Record<Handle, ClearValueType> result
  const score = scoreHandle && scoreDecrypt.data
    ? (scoreDecrypt.data[scoreHandle as `0x${string}`] as bigint ?? null)
    : null;

  const earnings = earningsHandle && earningsDecrypt.data
    ? (earningsDecrypt.data[earningsHandle as `0x${string}`] as bigint ?? null)
    : null;

  // Tier calculation
  const getTier = (s: bigint | null): number => {
    if (!s || !tierThresholds) return 0;
    const thresholds = tierThresholds as readonly number[];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (s >= BigInt(thresholds[i])) return i;
    }
    return 0;
  };

  return {
    // State
    isRegistered: !!isRegistered,
    score,
    earnings,
    approvedCount: approvedCount as number | undefined,
    tier: getTier(score),
    tierThresholds: tierThresholds as readonly number[] | undefined,
    // Allow flow
    grantDecryptPermission,
    isAllowing: isAllowing || allowPending,
    allowConfirmed,
    // Decrypt state
    isDecrypting: scoreDecrypt.isLoading || earningsDecrypt.isLoading,
    decryptError: scoreDecrypt.error || earningsDecrypt.error,
    hasHandles: !!scoreHandle && !!earningsHandle,
  };
}

