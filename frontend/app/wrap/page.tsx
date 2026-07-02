'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useAllow, useIsAllowed, useUserDecrypt } from '@zama-fhe/react-sdk';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useWrap } from '@/hooks/useWrap';
import { CONTRACTS, CONFIDENTIAL_TOKEN_ABI } from '@/lib/contracts';

const NULL_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const TOKEN_CONTRACTS: [`0x${string}`] = [CONTRACTS.CONFIDENTIAL_TOKEN];

export default function WrapPage() {
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [mintAmount, setMintAmount] = useState('1000');
  const [clicked, setClicked] = useState(false);

  const { step, error, isTxPending, mint, reset } = useWrap();

  // --- cUSDT balance decrypt ---
  const { data: balanceHandleRaw } = useReadContract({
    address: CONTRACTS.CONFIDENTIAL_TOKEN,
    abi: CONFIDENTIAL_TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: [address!],
    query: { enabled: !!address },
  });
  const balanceHandle = balanceHandleRaw as `0x${string}` | undefined;
  const isHandleValid = !!balanceHandle && balanceHandle !== NULL_HANDLE;

  const { mutateAsync: allow, isPending: isAllowing } = useAllow();
  const { data: isAllowed } = useIsAllowed({ contractAddresses: TOKEN_CONTRACTS });

  const { data: decrypted, isPending: isDecrypting, isError: isDecryptError } = useUserDecrypt(
    { handles: [{ handle: balanceHandle ?? NULL_HANDLE, contractAddress: CONTRACTS.CONFIDENTIAL_TOKEN }] },
    { enabled: clicked && !!isAllowed && isHandleValid },
  );

  const decryptedBalance = balanceHandle ? decrypted?.[balanceHandle] : undefined;

  async function handleRevealBalance() {
    if (!isAllowed) {
      await allow([...TOKEN_CONTRACTS]);
    }
    setClicked(true);
  }
  // --- end balance decrypt ---

  useEffect(() => { setMounted(true); }, []);

  const isLoading = isTxPending || step === 'minting';

  const labelStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'var(--text-dim)',
    marginBottom: '8px',
    display: 'block',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: '16px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  if (!mounted) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner" style={{ maxWidth: '560px' }}>

          {/* Header */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--cyan)',
              marginBottom: '12px',
            }}>
              cUSDT
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
              Get cUSDT
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Mint confidential USDT for demo. After withdrawing a bounty, use <strong style={{ color: 'var(--text)' }}>Reveal Balance</strong> below to decrypt and verify your received cUSDT.
            </p>
          </div>

          {/* Balance card — shown when connected */}
          {isConnected && (
            <Card style={{ padding: '20px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '4px' }}>Your cUSDT Balance (incl. bounty payouts)</div>
                {!clicked ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                    Encrypted on-chain (ERC-7984)
                  </span>
                ) : decryptedBalance !== undefined ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(decryptedBalance) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>cUSDT</span>
                    <button
                      onClick={() => setClicked(false)}
                      style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}
                    >↻</button>
                  </div>
                ) : isDecryptError ? (
                  <span style={{ fontSize: '13px', color: 'var(--red)' }}>Decrypt failed — check console</span>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Decrypting…</span>
                )}
              </div>
              {!clicked && (
                <Button
                  variant="secondary"
                  onClick={handleRevealBalance}
                  disabled={isAllowing}
                  style={{ fontSize: '12px', padding: '8px 14px', whiteSpace: 'nowrap' }}
                >
                  🔓 Reveal Balance
                </Button>
              )}
              {isAllowing && (
                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Signing…</span>
              )}
            </Card>
          )}

          {!isConnected ? (
            <Card style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔌</div>
              <div style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
                Connect your wallet to continue
              </div>
            </Card>
          ) : (
            <Card style={{ padding: '28px' }}>
              <div style={{
                padding: '14px',
                background: 'rgba(0,255,200,0.05)',
                border: '1px solid rgba(0,255,200,0.15)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '20px',
                fontSize: '13px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
              }}>
                <strong style={{ color: 'var(--cyan)' }}>Demo mode:</strong> Mints cUSDT directly via FHE — no ERC20 swap needed.
                Balances are encrypted on-chain (ERC-7984).
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Amount (cUSDT)</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  placeholder="1000"
                />
              </div>
              <Button
                variant="primary"
                style={{ width: '100%' }}
                onClick={() => { reset(); mint(mintAmount); }}
                disabled={isLoading}
              >
                {step === 'minting' ? 'Minting...' : `Mint ${mintAmount} cUSDT`}
              </Button>

              {/* Status */}
              {step !== 'idle' && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: step === 'error' ? 'rgba(255,80,80,0.08)' : step === 'done' ? 'rgba(0,255,150,0.08)' : 'var(--bg-base)',
                  border: `1px solid ${step === 'error' ? 'rgba(255,80,80,0.3)' : step === 'done' ? 'rgba(0,255,150,0.3)' : 'var(--border)'}`,
                  color: step === 'error' ? '#ff5050' : step === 'done' ? '#00ff96' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {step === 'error'
                    ? `❌ ${error}`
                    : step === 'done'
                    ? '✅ Transaction confirmed!'
                    : '⏳ Minting cUSDT...'}
                </div>
              )}
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}


