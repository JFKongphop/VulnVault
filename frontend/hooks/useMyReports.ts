'use client';

import { useAccount, useReadContract } from 'wagmi';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';

export function useMyReports() {
  const { address } = useAccount();

  // Fetch user's submission IDs
  const { data: submissionIds, isLoading } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getMySubmissionIds',
    query: {
      enabled: !!address,
    },
  });

  return {
    submissionIds: (submissionIds as `0x${string}`[]) || [],
    isLoading,
  };
}

// Hook to fetch encrypted report data for a specific submission
export function useMyReportData(submissionId: `0x${string}` | undefined) {
  const { address } = useAccount();

  const { data: encryptedData, isLoading } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getMyEncryptedReportData',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!address && !!submissionId,
    },
  });

  return {
    encryptedData: encryptedData as [string, string, string, string, string, string, string] | undefined,
    isLoading,
  };
}

// Hook to get reporter address for a submission
export function useReporter(submissionId: `0x${string}` | undefined) {
  const { data: reporter } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getReporter',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!submissionId,
    },
  });

  return reporter as `0x${string}` | undefined;
}

// Hook to get review timestamp
export function useReviewedAt(submissionId: `0x${string}` | undefined) {
  const { data: reviewedAt } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getReviewedAt',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!submissionId,
    },
  });

  return reviewedAt as bigint | undefined;
}
