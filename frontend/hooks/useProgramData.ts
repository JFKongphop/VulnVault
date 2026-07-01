'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';

export function useProgramInfo() {
  const { data: adminAddr, isLoading: l1 } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'admin',
  });

  const { data: pid, isLoading: l2 } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'programId',
  });

  return {
    programInfo: adminAddr ? {
      admin: adminAddr as string,
      programId: pid ? Number(pid) : 0,
      name: 'VulnVault Bug Bounty',
      description: 'Privacy-preserving bug bounty program. Reports are FHE-encrypted on-chain — only the admin can decrypt.',
    } : null,
    isLoading: l1 || l2,
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
