'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useEncrypt } from '@zama-fhe/react-sdk';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';
import { generateSecrets, generateCommitment } from '@/lib/poseidon';
import { BugReportEncryption, toHexString } from '@/lib/encryption';

interface SubmitReportParams {
  protocol: string;
  contractAddress: string;
  title: string;
  description: string;
  poc: string;
  gistLink?: string;
  attachments?: string;
  impactType: number;
  severity: number;
}

export function useSubmitReport() {
  const { address } = useAccount();
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [secrets, setSecrets] = useState<{ 
    secret0: bigint; 
    secret1: bigint;
    symmetricKey: string; // Backup for report decryption
  } | null>(null);

  // FHE hooks
  const encrypt = useEncrypt();

  // Contract write hooks
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const submitReport = async (params: SubmitReportParams) => {
    if (!address) throw new Error('Wallet not connected');

    try {
      setIsEncrypting(true);

      // Step 1: Generate commitment secrets for ZK withdrawal
      const newSecrets = generateSecrets();

      // Step 3: Initialize AES-256-GCM encryption
      const reportEncryption = new BugReportEncryption();
      await reportEncryption.initialize();

      // Step 4: Encrypt all text fields with AES
      const encryptedReport = await reportEncryption.encryptReport({
        protocol: params.protocol,
        contractAddress: params.contractAddress,
        title: params.title,
        description: params.description,
        poc: params.poc,
        gistLink: params.gistLink || '',
        attachments: params.attachments || '',
      });

      // Step 5: Get admin's public RSA key from contract
      // TODO: Fetch from contract - for now using placeholder
      const adminPublicKey = process.env.NEXT_PUBLIC_ADMIN_RSA_KEY || '';
      if (!adminPublicKey) {
        throw new Error('Admin public key not configured');
      }

      // Step 6: Encrypt symmetric key for admin
      const encryptedSymmetricKey = await reportEncryption.encryptKeyForAdmin(adminPublicKey);

      // Step 7: FHE encrypt numeric fields (impactType, severity) in one call
      const enc = await encrypt.mutateAsync({
        values: [
          { value: BigInt(params.impactType), type: 'euint8' as const },
          { value: BigInt(params.severity), type: 'euint8' as const },
        ],
        contractAddress: CONTRACTS.BUG_BOUNTY_PROGRAM,
        userAddress: address,
      });
      // encryptedValues and inputProof are already 0x-prefixed hex strings
      const encryptedImpact = enc.encryptedValues[0]!;
      const encryptedSeverity = enc.encryptedValues[1]!;
      const inputProof = enc.inputProof;

      // Step 8: Generate commitment for ZK withdrawal
      const commitment = generateCommitment(
        newSecrets.secret0,
        newSecrets.secret1,
        params.impactType,
        params.severity
      );

      // Step 10: Save secrets (including symmetric key) for user backup
      setSecrets({
        secret0: newSecrets.secret0,
        secret1: newSecrets.secret1,
        symmetricKey: reportEncryption.getSymmetricKeyHex(),
      });

      setIsEncrypting(false);

      // Step 11: Submit to contract
      writeContract({
        address: CONTRACTS.BUG_BOUNTY_PROGRAM,
        abi: BUG_BOUNTY_PROGRAM_ABI,
        functionName: 'submitReport',
        args: [
          `0x${commitment.toString(16).padStart(64, '0')}`,
          toHexString(encryptedReport.encryptedProtocol),
          toHexString(encryptedReport.encryptedContractAddress),
          encryptedImpact,
          encryptedSeverity,
          inputProof,
          toHexString(encryptedReport.encryptedTitle),
          toHexString(encryptedReport.encryptedDescription),
          toHexString(encryptedReport.encryptedPoC),
          toHexString(encryptedReport.encryptedGistLink),
          toHexString(encryptedReport.encryptedAttachments),
          toHexString(encryptedSymmetricKey),
        ],
      });
    } catch (error) {
      setIsEncrypting(false);
      console.error('Failed to submit report:', error);
      throw error;
    }
  };

  return {
    submitReport,
    isEncrypting,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
    secrets, // Return all secrets for user to save (needed for withdrawal + decryption)
  };
}
