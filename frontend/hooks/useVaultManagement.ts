'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, BOUNTY_VAULT_ABI } from '@/lib/contracts';

export function useVaultManagement(programId?: number) {
  const { address } = useAccount();

  // Read vault balances
  const { data: availableBalance, isLoading: isLoadingAvailable } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getAvailableBalance',
  });

  const { data: lockedBalance, isLoading: isLoadingLocked } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getLockedBalance',
  });

  // Read pending withdrawal
  const { data: pendingWithdrawal } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getPendingWithdrawal',
    args: programId ? [BigInt(programId)] : undefined,
    query: {
      enabled: !!programId,
    },
  });

  // Contract write
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Initiate withdrawal (with timelock)
  const initiateWithdrawal = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected');
    if (!programId) throw new Error('Program ID required');

    writeContract({
      address: CONTRACTS.BOUNTY_VAULT,
      abi: BOUNTY_VAULT_ABI,
      functionName: 'initiateWithdrawal',
      args: [BigInt(programId), amount],
    });
  };

  // Execute withdrawal (after timelock)
  const executeWithdrawal = async () => {
    if (!address) throw new Error('Wallet not connected');
    if (!programId) throw new Error('Program ID required');

    writeContract({
      address: CONTRACTS.BOUNTY_VAULT,
      abi: BOUNTY_VAULT_ABI,
      functionName: 'executeWithdrawal',
      args: [BigInt(programId)],
    });
  };

  // Cancel pending withdrawal
  const cancelWithdrawal = async () => {
    if (!address) throw new Error('Wallet not connected');
    if (!programId) throw new Error('Program ID required');

    writeContract({
      address: CONTRACTS.BOUNTY_VAULT,
      abi: BOUNTY_VAULT_ABI,
      functionName: 'cancelWithdrawal',
      args: [BigInt(programId)],
    });
  };

  return {
    availableBalance: availableBalance as bigint | undefined,
    lockedBalance: lockedBalance as bigint | undefined,
    pendingWithdrawal: pendingWithdrawal as [bigint, bigint] | undefined,
    isLoading: isLoadingAvailable || isLoadingLocked,
    isPending: isPending || isTxPending,
    isSuccess,
    txHash,
    initiateWithdrawal,
    executeWithdrawal,
    cancelWithdrawal,
  };
}
