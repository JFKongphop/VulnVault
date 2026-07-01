'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { CONTRACTS, BOUNTY_VAULT_ABI, CONFIDENTIAL_PAYOUTS_ABI, MERKLE_TREE_ABI, PROGRAM_REGISTRY_ABI } from '@/lib/contracts';

interface WithdrawParams {
  secret0: bigint;
  secret1: bigint;
  impactType: number;
  severity: number;
  recipient: `0x${string}`;
}

export function useWithdraw(programId: bigint) {
  const { address } = useAccount();
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);

  // Fetch per-program contract addresses from ProgramRegistry
  // getProgramContracts returns (bugBounty[0], vault[1], merkleTree[2])
  const { data: programContracts } = useReadContract({
    address: CONTRACTS.PROGRAM_REGISTRY,
    abi: PROGRAM_REGISTRY_ABI,
    functionName: 'getProgramContracts',
    args: [programId],
    query: { enabled: programId !== undefined },
  });

  const vaultAddress = programContracts?.[1] as `0x${string}` | undefined;
  const merkleTreeAddress = programContracts?.[2] as `0x${string}` | undefined;

  // ConfidentialPayouts address lives on BountyVault as a public state variable
  const { data: confidentialPayoutsAddress } = useReadContract({
    address: vaultAddress,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'confidentialPayouts',
    query: { enabled: !!vaultAddress },
  });

  // Read current Merkle root from the program-specific tree
  const { data: currentRoot } = useReadContract({
    address: merkleTreeAddress,
    abi: MERKLE_TREE_ABI,
    functionName: 'getRoot',
    query: { enabled: !!merkleTreeAddress },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const withdraw = async ({ secret0, secret1, impactType, severity, recipient }: WithdrawParams) => {
    if (!address) throw new Error('Wallet not connected');
    if (!currentRoot) throw new Error('Could not fetch Merkle root');
    if (!confidentialPayoutsAddress) throw new Error('Program contracts not loaded');

    try {
      setIsGeneratingProof(true);

      // Step 1: Calculate commitment (same as submission)
      const { poseidon4 } = await import('poseidon-lite');
      const commitment = poseidon4([secret0, secret1, BigInt(impactType), BigInt(severity)]);

      // Step 2: Calculate nullifier (prevents double-spending)
      const { poseidon2 } = await import('poseidon-lite');
      const nullifier = poseidon2([commitment, secret0]);

      // Step 3: Generate ZK proof
      // In production:
      // const { proof, publicSignals } = await groth16.fullProve(
      //   { secret0, secret1, impactType, severity, recipient, root: currentRoot },
      //   'circuits/bountyClaim.wasm',
      //   'circuits/bountyClaim.zkey'
      // );

      // Placeholder proof (8 uint256 values for Groth16)
      const placeholderProof = [
        BigInt(0), BigInt(0), BigInt(0), BigInt(0),
        BigInt(0), BigInt(0), BigInt(0), BigInt(0),
      ] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      setIsGeneratingProof(false);

      // Step 4: Submit withdrawal to this program's ConfidentialPayouts
      writeContract({
        address: confidentialPayoutsAddress as `0x${string}`,
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
