'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';

export function useProgramInfo() {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getProgramInfo',
  });

  return {
    programInfo: data ? {
      admin: data[0],
      name: data[1],
      description: data[2],
      totalPaid: data[3],
    } : null,
    isLoading,
    error,
  };
}

export function useSubmissionCount() {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getSubmissionCount',
  });

  return {
    count: data ? Number(data) : 0,
    isLoading,
    error,
  };
}

export function useAdminPublicKey() {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'adminPublicKey',
  });

  return {
    publicKey: data || '',
    isLoading,
    error,
  };
}
