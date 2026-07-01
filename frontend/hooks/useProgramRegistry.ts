'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, PROGRAM_REGISTRY_ABI } from '@/lib/contracts';

export function useProgramRegistry() {
  // Get all active programs
  const { data: activePrograms, isLoading: isLoadingPrograms } = useReadContract({
    address: CONTRACTS.PROGRAM_REGISTRY,
    abi: PROGRAM_REGISTRY_ABI,
    functionName: 'getActivePrograms',
  });

  // Get total stats
  const { data: totalStats, isLoading: isLoadingStats } = useReadContract({
    address: CONTRACTS.PROGRAM_REGISTRY,
    abi: PROGRAM_REGISTRY_ABI,
    functionName: 'getTotalStats',
  });

  return {
    activePrograms: (activePrograms as bigint[]) || [],
    totalStats: totalStats as [bigint, bigint, bigint, bigint] | undefined,
    isLoading: isLoadingPrograms || isLoadingStats,
  };
}

// Hook to get single program info
export function useProgramInfo(programId: number | undefined) {
  const { data: programInfo, isLoading } = useReadContract({
    address: CONTRACTS.PROGRAM_REGISTRY,
    abi: PROGRAM_REGISTRY_ABI,
    functionName: 'getProgram',
    args: programId !== undefined ? [BigInt(programId)] : undefined,
    query: {
      enabled: programId !== undefined,
    },
  });

  return {
    programInfo: programInfo as [string, string, string, number, boolean, bigint, bigint] | undefined,
    isLoading,
  };
}

// Hook to check if address is program admin
export function useIsAdmin(programId: number | undefined, address: `0x${string}` | undefined) {
  const { data: isAdmin } = useReadContract({
    address: CONTRACTS.PROGRAM_REGISTRY,
    abi: PROGRAM_REGISTRY_ABI,
    functionName: 'isAdmin',
    args: programId !== undefined && address ? [BigInt(programId), address] : undefined,
    query: {
      enabled: programId !== undefined && !!address,
    },
  });

  return isAdmin as boolean | undefined;
}
