'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, DISPUTE_RESOLVER_ABI } from '@/lib/contracts';

export function useDisputes() {
  const { address } = useAccount();

  // Contract write
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Raise a dispute
  const raiseDispute = async (
    submissionId: `0x${string}`,
    reason: number, // 0: Severity, 1: BountyAmount, 2: Rejection, 3: Other
    evidence: string
  ) => {
    if (!address) throw new Error('Wallet not connected');

    writeContract({
      address: CONTRACTS.DISPUTE_RESOLVER,
      abi: DISPUTE_RESOLVER_ABI,
      functionName: 'raiseDispute',
      args: [submissionId, reason, evidence],
    });
  };

  // Submit arbiter vote
  const submitVote = async (
    disputeId: number,
    approve: boolean,
    notes: string
  ) => {
    if (!address) throw new Error('Wallet not connected');

    writeContract({
      address: CONTRACTS.DISPUTE_RESOLVER,
      abi: DISPUTE_RESOLVER_ABI,
      functionName: 'submitVote',
      args: [BigInt(disputeId), approve, notes],
    });
  };

  // Resolve dispute (after all votes)
  const resolveDispute = async (disputeId: number) => {
    if (!address) throw new Error('Wallet not connected');

    writeContract({
      address: CONTRACTS.DISPUTE_RESOLVER,
      abi: DISPUTE_RESOLVER_ABI,
      functionName: 'resolveDispute',
      args: [BigInt(disputeId)],
    });
  };

  return {
    raiseDispute,
    submitVote,
    resolveDispute,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
  };
}

// Hook to fetch dispute info
export function useDisputeInfo(disputeId: number | undefined) {
  const { data: disputeInfo, isLoading } = useReadContract({
    address: CONTRACTS.DISPUTE_RESOLVER,
    abi: DISPUTE_RESOLVER_ABI,
    functionName: 'getDisputeInfo',
    args: disputeId !== undefined ? [BigInt(disputeId)] : undefined,
    query: {
      enabled: disputeId !== undefined,
    },
  });

  const { data: voteCount } = useReadContract({
    address: CONTRACTS.DISPUTE_RESOLVER,
    abi: DISPUTE_RESOLVER_ABI,
    functionName: 'getVoteCount',
    args: disputeId !== undefined ? [BigInt(disputeId)] : undefined,
    query: {
      enabled: disputeId !== undefined,
    },
  });

  return {
    disputeInfo: disputeInfo as [string, string, number, number, number, bigint, bigint] | undefined,
    voteCount: voteCount as bigint | undefined,
    isLoading,
  };
}

// Hook to check if submission is disputed
export function useIsDisputed(submissionId: `0x${string}` | undefined) {
  const { data: isDisputed } = useReadContract({
    address: CONTRACTS.DISPUTE_RESOLVER,
    abi: DISPUTE_RESOLVER_ABI,
    functionName: 'isDisputed',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!submissionId,
    },
  });

  return isDisputed as boolean | undefined;
}

// Hook to check if arbiter has voted
export function useHasVoted(disputeId: number | undefined, arbiterAddress: `0x${string}` | undefined) {
  const { data: hasVoted } = useReadContract({
    address: CONTRACTS.DISPUTE_RESOLVER,
    abi: DISPUTE_RESOLVER_ABI,
    functionName: 'hasArbiterVoted',
    args: disputeId !== undefined && arbiterAddress ? [BigInt(disputeId), arbiterAddress] : undefined,
    query: {
      enabled: disputeId !== undefined && !!arbiterAddress,
    },
  });

  return hasVoted as boolean | undefined;
}
