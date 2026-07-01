'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useSignMessage } from 'wagmi';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';
import { BugReportEncryption, ReportDecryption, fromHexString } from '@/lib/encryption';

// Same message used during submission — must be identical to re-derive the key
const ENCRYPTION_KEY_MESSAGE = 'VulnVault: Authorize report encryption key access';

interface DecryptedReport {
  protocol: string;
  contractAddress: string;
  title: string;
  description: string;
  poc: string;
  gistLink: string;
  attachments: string;
}

export function useReporterDecrypt(submissionId: `0x${string}` | undefined) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [decryptedReport, setDecryptedReport] = useState<DecryptedReport | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch reporter's encrypted symmetric key (only callable by the reporter)
  const { data: encryptedSymmetricKeyForReporter } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getEncryptedSymmetricKeyForReporter',
    args: submissionId ? [submissionId] : undefined,
    query: { enabled: !!address && !!submissionId },
  });

  // Fetch encrypted report fields (reporter only)
  const { data: encryptedReportData, isLoading } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getMyEncryptedReportData',
    args: submissionId ? [submissionId] : undefined,
    query: { enabled: !!address && !!submissionId },
  });

  // One-click decrypt: wallet signs → key derived → report decrypted
  const decryptMyReport = async () => {
    if (!encryptedSymmetricKeyForReporter || !encryptedReportData) {
      setError('Report data not loaded yet');
      return;
    }

    try {
      setIsDecrypting(true);
      setError(null);

      // Step 1: Sign deterministic message (same as submission time)
      const signature = await signMessageAsync({ message: ENCRYPTION_KEY_MESSAGE });

      // Step 2: Derive AES key from signature and decrypt the stored symmetric key
      const aesKeyHex = await BugReportEncryption.decryptKeyForReporter(
        signature,
        encryptedSymmetricKeyForReporter as string,
      );

      // Step 3: Decrypt all report fields with the recovered AES key
      const decryption = new ReportDecryption();
      await decryption.initialize(aesKeyHex);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed');
    } finally {
      setIsDecrypting(false);
    }
  };

  return {
    decryptedReport,
    isDecrypting,
    isLoading,
    error,
    decryptMyReport,
  };
}
