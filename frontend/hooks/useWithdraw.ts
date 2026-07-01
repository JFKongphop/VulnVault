'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { CONTRACTS, CONFIDENTIAL_PAYOUTS_ABI, MERKLE_TREE_ABI } from '@/lib/contracts';

// Note: In production, you would import from snarkjs
// import { groth16 } from 'snarkjs';

interface WithdrawParams {
  secret0: bigint;
  secret1: bigint;
  impactType: number;
  severity: number;
  recipient: `0x${string}`;
}

export function useWithdraw() {
  const { address } = useAccount();
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);

  // Read current Merkle root
  const { data: currentRoot } = useReadContract({
    address: CONTRACTS.MERKLE_TREE,
    abi: MERKLE_TREE_ABI,
    functionName: 'getRoot',
  });

  // Contract write
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const withdraw = async ({ secret0, secret1, impactType, severity, recipient }: WithdrawParams) => {
    if (!address) throw new Error('Wallet not connected');
    if (!currentRoot) throw new Error('Could not fetch Merkle root');

    try {
      setIsGeneratingProof(true);

      // Step 1: Calculate commitment (same as submission)
      const { poseidon4 } = await import('poseidon-lite');
      const commitment = poseidon4([secret0, secret1, BigInt(impactType), BigInt(severity)]);

      // Step 2: Calculate nullifier (to prevent double-spending)
      const { poseidon2 } = await import('poseidon-lite');
      const nullifier = poseidon2([commitment, secret0]);

      // Step 3: Generate ZK proof
      // In production, this would use:
      // const { proof, publicSignals } = await groth16.fullProve(
      //   {
      //     secret0,
      //     secret1,
      //     impactType,
      //     severity,
      //     recipient,
      //     root: currentRoot
      //   },
      //   'circuits/bountyClaim.wasm',
      //   'circuits/bountyClaim.zkey'
      // );

      // For now, use placeholder proof (8 uint256 values for Groth16)
      const placeholderProof = [
        BigInt(0), BigInt(0), BigInt(0), BigInt(0),
        BigInt(0), BigInt(0), BigInt(0), BigInt(0),
      ] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      setIsGeneratingProof(false);

      // Step 4: Submit withdrawal
      writeContract({
        address: CONTRACTS.CONFIDENTIAL_PAYOUTS,
        abi: CONFIDENTIAL_PAYOUTS_ABI,
        functionName: 'withdraw',
        args: [
          placeholderProof,
          currentRoot as bigint,
          nullifier,
          recipient,
        ],
      });
    } catch (error) {
      setIsGeneratingProof(false);
      console.error('Failed to generate proof or withdraw:', error);
      throw error;
    }
  };

  const checkNullifier = async (nullifier: bigint): Promise<boolean> => {
    // Check if nullifier has been used (prevent double-spending)
    // This would be a contract read
    return false; // Placeholder
  };

  return {
    withdraw,
    isGeneratingProof,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
    currentRoot,
    checkNullifier,
  };
}
