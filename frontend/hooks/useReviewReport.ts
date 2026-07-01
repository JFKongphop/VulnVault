'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useEncrypt } from '@zama-fhe/react-sdk';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';

export function useReviewReport() {
  const { address } = useAccount();
  const encrypt = useEncrypt();
  
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Mark report as under review
  const reviewReport = async (submissionId: `0x${string}`) => {
    if (!address) throw new Error('Wallet not connected');

    writeContract({
      address: CONTRACTS.BUG_BOUNTY_PROGRAM,
      abi: BUG_BOUNTY_PROGRAM_ABI,
      functionName: 'reviewReport',
      args: [submissionId],
    });
  };

  // Approve report with bounty amount
  const approveReport = async (
    submissionId: `0x${string}`,
    bountyAmount: bigint,
    finalSeverity: number,
    notes: string
  ) => {
    if (!address) throw new Error('Wallet not connected');

    try {
      // FHE encrypt bounty amount
      const enc = await encrypt.mutateAsync({
        values: [{ value: bountyAmount, type: 'euint64' as const }],
        contractAddress: CONTRACTS.BUG_BOUNTY_PROGRAM,
        userAddress: address,
      });
      const encryptedBounty = enc.encryptedValues[0]!;
      const inputProof = enc.inputProof;

      // Convert notes to bytes
      const notesBytes = `0x${Buffer.from(notes).toString('hex')}` as `0x${string}`;

      writeContract({
        address: CONTRACTS.BUG_BOUNTY_PROGRAM,
        abi: BUG_BOUNTY_PROGRAM_ABI,
        functionName: 'approveReport',
        args: [
          submissionId,
          encryptedBounty,
          finalSeverity,
          inputProof,
          notesBytes,
        ],
      });
    } catch (error) {
      console.error('Failed to approve report:', error);
      throw error;
    }
  };

  // Reject report
  const rejectReport = async (submissionId: `0x${string}`) => {
    if (!address) throw new Error('Wallet not connected');

    writeContract({
      address: CONTRACTS.BUG_BOUNTY_PROGRAM,
      abi: BUG_BOUNTY_PROGRAM_ABI,
      functionName: 'rejectReport',
      args: [submissionId],
    });
  };

  return {
    reviewReport,
    approveReport,
    rejectReport,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
  };
}

// Hook to fetch admin notes for a submission
export function useAdminNotes(submissionId: `0x${string}` | undefined) {
  const { address } = useAccount();
  const [notes, setNotes] = useState<string>('');

  // In a real implementation, this would use useReadContract
  // For now, placeholder since notes are bytes that need decoding

  return {
    notes,
    isLoading: false,
  };
}
