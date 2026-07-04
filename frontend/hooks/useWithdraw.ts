'use client';

import { useState } from 'react';
import { usePublicClient, useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { CONTRACTS, CONFIDENTIAL_PAYOUTS_ABI, MERKLE_TREE_ABI } from '@/lib/contracts';
import { computeMerklePath, TREE_LEVELS } from '@/lib/merkleUtils';

interface WithdrawParams {
  secret0: bigint;
  secret1: bigint;
  impactType: number;
  severity: number;
  recipient: `0x${string}`;
  amount: bigint; // in micro-USDT (6 decimals)
}

export function useWithdraw(programId: bigint) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [proofStatus, setProofStatus] = useState<string>('');

  // Use direct contract addresses from env (no ProgramRegistry needed)
  const merkleTreeAddress = CONTRACTS.MERKLE_TREE as `0x${string}`;
  const confidentialPayoutsAddress = CONTRACTS.CONFIDENTIAL_PAYOUTS as `0x${string}`;

  // Read current Merkle root
  const { data: currentRoot } = useReadContract({
    address: merkleTreeAddress,
    abi: MERKLE_TREE_ABI,
    functionName: 'getRoot',
    query: { enabled: !!merkleTreeAddress && merkleTreeAddress !== '0x' },
  });

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  /**
   * Fetch all inserted leaves from the Merkle tree contract.
   * Returns them as BigInt field elements in insertion order.
   */
  const fetchLeaves = async (treeAddress: `0x${string}`): Promise<bigint[]> => {
    if (!publicClient) throw new Error('No public client');

    // Get total leaf count
    const nextIndex = await publicClient.readContract({
      address: treeAddress,
      abi: MERKLE_TREE_ABI,
      functionName: 'nextIndex',
    }) as number;

    // Fetch each leaf
    const leafPromises: Promise<`0x${string}`>[] = [];
    for (let i = 0; i < nextIndex; i++) {
      leafPromises.push(
        publicClient.readContract({
          address: treeAddress,
          abi: MERKLE_TREE_ABI,
          functionName: 'leaves',
          args: [BigInt(i)],
        }) as Promise<`0x${string}`>,
      );
    }
    const rawLeaves = await Promise.all(leafPromises);
    return rawLeaves.map((l) => BigInt(l));
  };

  const withdraw = async ({
    secret0,
    secret1,
    impactType,
    severity,
    recipient,
    amount,
  }: WithdrawParams) => {
    if (!address) throw new Error('Wallet not connected');
    if (!currentRoot) throw new Error('Could not fetch Merkle root');
    if (confidentialPayoutsAddress === '0x') throw new Error('ConfidentialPayouts address not configured');
    if (merkleTreeAddress === '0x') throw new Error('Merkle tree address not configured');

    try {
      setIsGeneratingProof(true);
      setProofStatus('Computing commitment…');

      // Step 1: Compute commitment = poseidon4(s0, s1, impact, severity)
      // The circuit constraint is: nullifier === commitmentHash.out
      // So nullifier IS the commitment (not a separate poseidon2 hash).
      const { poseidon4 } = await import('poseidon-lite');
      const commitment = poseidon4([secret0, secret1, BigInt(impactType), BigInt(severity)]);
      // nullifier = commitment (per circuit: nullifier === commitmentHash.out)
      const nullifier = commitment;

      // Step 2: Fetch all leaves and find the leaf index for this commitment
      setProofStatus('Fetching Merkle tree state…');
      const leaves = await fetchLeaves(merkleTreeAddress as `0x${string}`);

      // BugBountyMerkleTree reduces commitment mod field size before storing.
      // poseidon4 output is already in BN254 field, so it matches directly.
      const leafIndex = leaves.findIndex((l) => l === commitment);
      if (leafIndex === -1) {
        throw new Error(
          'Your commitment was not found in the Merkle tree. ' +
          'Make sure you entered the correct secrets, impactType, and severity.',
        );
      }

      // Step 3: Compute Merkle inclusion proof
      setProofStatus('Computing Merkle proof path…');
      const { pathElements, pathIndices } = computeMerklePath(leaves, leafIndex);

      // Step 4: Build circuit inputs
      // currentRoot is a bytes32 hex string ("0x...") — convert to decimal for snarkjs
      const rootDecimal = BigInt(currentRoot as string).toString();
      const circuitInputs = {
        root: rootDecimal,
        nullifier: nullifier.toString(),
        secret: [secret0.toString(), secret1.toString()],
        impactType: impactType.toString(),
        severity: severity.toString(),
        pathElements: pathElements.map((e) => e.toString()),
        pathIndices: pathIndices.map((i) => i.toString()),
      };

      // Step 5: Load wasm and zkey from public directory
      setProofStatus('Loading ZK circuit (2.3 MB)…');
      const [wasmBuffer, zkeyBuffer] = await Promise.all([
        fetch('/bountyClaim.wasm').then((r) => r.arrayBuffer()),
        fetch('/bountyClaim.zkey').then((r) => r.arrayBuffer()),
      ]);

      // Step 6: Generate Groth16 proof in browser
      setProofStatus('Generating ZK proof (this takes ~10 s)…');
      const snarkjs = await import('snarkjs');
      const { proof, publicSignals: _ps } = await snarkjs.groth16.fullProve(
        circuitInputs,
        new Uint8Array(wasmBuffer),
        new Uint8Array(zkeyBuffer),
      );

      // Step 7: Format proof for the Solidity verifier (BN254 Groth16)
      // pB inner pairs are in reversed order for the Solidity pairing precompile.
      const pA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
      const pB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ];
      const pC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

      // Convert nullifier to bytes32 (the contract expects bytes32)
      const nullifierBytes32 = `0x${nullifier.toString(16).padStart(64, '0')}` as `0x${string}`;

      setIsGeneratingProof(false);
      setProofStatus('Submitting withdrawal transaction…');

      // Step 8: Submit to ConfidentialPayouts.withdraw
      await writeContractAsync({
        address: confidentialPayoutsAddress as `0x${string}`,
        abi: CONFIDENTIAL_PAYOUTS_ABI,
        functionName: 'withdraw',
        args: [
          currentRoot as `0x${string}`,
          nullifierBytes32,
          recipient,
          amount,
          pA,
          pB,
          pC,
        ],
        gas: 3_000_000n,
      });
    } catch (error) {
      setIsGeneratingProof(false);
      setProofStatus('');
      console.error('Withdrawal failed:', error);
      throw error;
    }
  };

  return {
    withdraw,
    isGeneratingProof,
    proofStatus,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
    currentRoot,
    merkleTreeAddress,
    confidentialPayoutsAddress,
  };
}
