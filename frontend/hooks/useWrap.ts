'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { CONTRACTS, CONFIDENTIAL_TOKEN_ABI } from '@/lib/contracts';

export function useWrap() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
  const [step, setStep] = useState<'idle' | 'minting' | 'unwrapping' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const { isLoading: isTxPending } = useWaitForTransactionReceipt({
    hash: pendingTx,
    query: { enabled: !!pendingTx },
  });

  // Mint cUSDT directly — no ERC20 needed (uses MockConfidentialUSDT.mint)
  const mint = async (amountStr: string) => {
    if (!address) return;
    setError(null);
    setStep('minting');
    try {
      const amount = parseUnits(amountStr, 6); // 6 decimals
      const hash = await writeContractAsync({
        address: CONTRACTS.CONFIDENTIAL_TOKEN,
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: 'mint',
        args: [address, amount],
      });
      setPendingTx(hash);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mint failed');
      setStep('error');
    }
  };

  // Unwrap cUSDT → underlying ERC20
  const unwrap = async (amountStr: string) => {
    if (!address) return;
    setError(null);
    setStep('unwrapping');
    try {
      const amount = parseUnits(amountStr, 6);
      const hash = await writeContractAsync({
        address: CONTRACTS.CONFIDENTIAL_TOKEN,
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: 'withdrawTo',
        args: [address, amount],
      });
      setPendingTx(hash);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unwrap failed');
      setStep('error');
    }
  };

  const reset = () => {
    setStep('idle');
    setError(null);
    setPendingTx(undefined);
  };

  return { step, error, isTxPending, mint, unwrap, reset };
}
