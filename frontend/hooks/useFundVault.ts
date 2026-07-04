'use client';

import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { bytesToHex } from 'viem';
import { useEncrypt } from '@zama-fhe/react-sdk';
import { CONTRACTS, CONFIDENTIAL_TOKEN_ABI } from '@/lib/contracts';

export type FundStep = 'idle' | 'encrypting' | 'confirming' | 'done' | 'error';

export function useFundVault() {
  const { address } = useAccount();
  const [step, setStep] = useState<FundStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();

  const fund = async (amountStr: string) => {
    if (!address) { setError('Wallet not connected'); return; }
    setError(null);
    setStep('encrypting');
    try {
      // cUSDT has 6 decimals (same as USDC)
      const amountMicro = parseUnits(amountStr, 6);

      // Encrypt the amount for the cUSDT token contract
      const enc = await encrypt.mutateAsync({
        values: [{ value: amountMicro, type: 'euint64' as const }],
        contractAddress: CONTRACTS.CONFIDENTIAL_TOKEN,
        userAddress: address,
      });
      const encAmount = bytesToHex(enc.handles[0]!);
      const inputProof = bytesToHex(enc.inputProof);

      setStep('confirming');

      // Call confidentialTransferAndCall: transfer encrypted cUSDT to the vault
      // The vault's onConfidentialTransferReceived callback fires automatically
      const hash = await writeContractAsync({
        address: CONTRACTS.CONFIDENTIAL_TOKEN,
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: 'confidentialTransferAndCall',
        args: [CONTRACTS.BOUNTY_VAULT, encAmount, inputProof, '0x'],
        gas: 8_000_000n,
      });

      setTxHash(hash);
      setStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      setStep('error');
    }
  };

  const reset = () => {
    setStep('idle');
    setError(null);
    setTxHash(undefined);
  };

  return { step, error, txHash, fund, reset };
}
