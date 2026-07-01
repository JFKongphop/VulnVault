'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACTS, WHITEHAT_REPUTATION_ABI } from '@/lib/contracts';

export function useReputation() {
  const { address } = useAccount();

  // Read encrypted score handle
  const { data: scoreHandle } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getMyScoreHandle',
  });

  // Read encrypted earnings handle
  const { data: earningsHandle } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getMyEarningsHandle',
  });

  // Read tier thresholds (public data)
  const { data: tierThresholds } = useReadContract({
    address: CONTRACTS.WHITEHAT_REPUTATION,
    abi: WHITEHAT_REPUTATION_ABI,
    functionName: 'getAllTierThresholds',
  });

  // Local state for decrypted values (FHE decryption done off-chain with user's key)
  const [score, setScore] = useState<bigint | null>(null);
  const [earnings, setEarnings] = useState<bigint | null>(null);

  // Calculate tier based on score
  const getTier = (s: bigint | null): number => {
    if (!s || !tierThresholds) return 0;
    const thresholds = tierThresholds as bigint[];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (s >= thresholds[i]) return i + 1;
    }
    return 0;
  };

  // Placeholder: in production this would use the Zama SDK's user-decrypt flow
  const loadReputation = async () => {
    // scoreHandle and earningsHandle are FHE ciphertext handles from the contract
    // Real decryption requires a Zama relayer + user signature (EIP-712)
    // For now, return null until the on-chain decryption completes
    setScore(null);
    setEarnings(null);
  };

  return {
    score,
    earnings,
    scoreHandle: scoreHandle as `0x${string}` | undefined,
    earningsHandle: earningsHandle as `0x${string}` | undefined,
    tier: getTier(score),
    tierThresholds: tierThresholds as bigint[] | undefined,
    isLoading: false,
    hasData: !!scoreHandle && !!earningsHandle,
    loadReputation,
  };
}
