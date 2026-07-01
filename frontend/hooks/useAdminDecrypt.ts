'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';
import { ReportDecryption, decryptSymmetricKey, fromHexString } from '@/lib/encryption';

interface DecryptedReport {
  protocol: string;
  contractAddress: string;
  title: string;
  description: string;
  poc: string;
  gistLink: string;
  attachments: string;
}

export function useAdminDecrypt(submissionId: `0x${string}` | undefined) {
  const { address } = useAccount();
  const [decryptedReport, setDecryptedReport] = useState<DecryptedReport | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch encrypted symmetric key (admin only)
  const { data: encryptedSymmetricKey, isLoading: isLoadingKey } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getEncryptedSymmetricKey',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!address && !!submissionId,
    },
  });

  // Fetch encrypted report data (admin only)
  const { data: encryptedReportData, isLoading: isLoadingData } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getEncryptedReportData',
    args: submissionId ? [submissionId] : undefined,
    query: {
      enabled: !!address && !!submissionId,
    },
  });

  const decryptReport = async (adminPrivateKeyHex: string) => {
    if (!encryptedSymmetricKey || !encryptedReportData) {
      setError('Missing encrypted data');
      return;
    }

    try {
      setIsDecrypting(true);
      setError(null);

      // Step 1: Decrypt the symmetric key with admin's RSA private key
      const symmetricKeyHex = await decryptSymmetricKey(
        encryptedSymmetricKey as string,
        adminPrivateKeyHex,
      );

      // Step 2: Initialize AES decryption with the recovered symmetric key
      const decryption = new ReportDecryption();
      await decryption.initialize(symmetricKeyHex);

      // Decrypt all 7 fields
      const reportData = encryptedReportData as [string, string, string, string, string, string, string];
      const decrypted = await decryption.decryptReport({
        encryptedProtocol: fromHexString(reportData[0]),
        encryptedContractAddress: fromHexString(reportData[1]),
        encryptedTitle: fromHexString(reportData[2]),
        encryptedDescription: fromHexString(reportData[3]),
        encryptedPoC: fromHexString(reportData[4]),
        encryptedGistLink: fromHexString(reportData[5]),
        encryptedAttachments: fromHexString(reportData[6]),
      });

      setDecryptedReport(decrypted as DecryptedReport);
      setIsDecrypting(false);
    } catch (err) {
      console.error('Decryption failed:', err);
      setError(err instanceof Error ? err.message : 'Decryption failed');
      setIsDecrypting(false);
    }
  };

  // Decrypt with backed-up symmetric key (reporter can use this)
  const decryptWithSymmetricKey = async (symmetricKeyHex: string) => {
    if (!encryptedReportData) {
      setError('Missing encrypted data');
      return;
    }

    try {
      setIsDecrypting(true);
      setError(null);

      const reportData = encryptedReportData as [string, string, string, string, string, string, string];

      // Initialize decryption with symmetric key directly
      const decryption = new ReportDecryption();
      await decryption.initialize(symmetricKeyHex);

      // Decrypt all 7 fields
      const decrypted = await decryption.decryptReport({
        encryptedProtocol: fromHexString(reportData[0]),
        encryptedContractAddress: fromHexString(reportData[1]),
        encryptedTitle: fromHexString(reportData[2]),
        encryptedDescription: fromHexString(reportData[3]),
        encryptedPoC: fromHexString(reportData[4]),
        encryptedGistLink: fromHexString(reportData[5]),
        encryptedAttachments: fromHexString(reportData[6]),
      });

      setDecryptedReport(decrypted as DecryptedReport);
      setIsDecrypting(false);
    } catch (err) {
      console.error('Decryption failed:', err);
      setError(err instanceof Error ? err.message : 'Decryption failed');
      setIsDecrypting(false);
    }
  };

  return {
    encryptedSymmetricKey: encryptedSymmetricKey as string | undefined,
    encryptedReportData: encryptedReportData as [string, string, string, string, string, string, string] | undefined,
    decryptedReport,
    isLoading: isLoadingKey || isLoadingData,
    isDecrypting,
    error,
    decryptReport,
    decryptWithSymmetricKey,
  };
}
