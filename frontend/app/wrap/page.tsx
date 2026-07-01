'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useDecryptValues, useZamaSDK } from '@zama-fhe/react-sdk';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useWrap } from '@/hooks/useWrap';
import { CONTRACTS, CONFIDENTIAL_TOKEN_ABI } from '@/lib/contracts';

export default function WrapPage() {
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [mintAmount, setMintAmount] = useState('1000');
  const [unwrapAmount, setUnwrapAmount] = useState('100');
  const [activeTab, setActiveTab] = useState<'mint' | 'unwrap'>('mint');
  const sdk = useZamaSDK();

  const { step, error, isTxPending, mint, unwrap, reset } = useWrap();

  // --- cUSDT balance decrypt ---
  const [decryptInputs, setDecryptInputs] = useState<{ encryptedValue: `0x${string}`; contractAddress: `0x${string}` }[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const { data: decrypted, isError: isDecryptError } = useDecryptValues(
    decryptInputs,
    { enabled: decryptInputs.length > 0 },
  );
  const decryptedBalance = decryptInputs[0] ? decrypted?.[decryptInputs[0].encryptedValue] : undefined;

  async function handleRevealBalance() {
    if (!address || !sdk) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const handle = await sdk.provider.readContract({
        address: CONTRACTS.CONFIDENTIAL_TOKEN,
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: 'confidentialBalanceOf',
        args: [address],
      }) as `0x${string}`;
      setDecryptInputs([{ encryptedValue: handle, contractAddress: CONTRACTS.CONFIDENTIAL_TOKEN }]);
    } catch (e) {
      setRevealError(e instanceof Error ? e.message : 'Failed to read balance');
    } finally {
      setIsRevealing(false);
    }
  }
  // --- end balance decrypt ---

  useEffect(() => { setMounted(true); }, []);

  const isLoading = isTxPending || step === 'minting' || step === 'unwrapping';

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
              Token Management
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
              cUSDT Manager
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Mint confidential USDT directly for demo or unwrap back to ERC20.
            </p>
          </div>

          {/* Balance card — shown when connected */}
          {isConnected && (
            <Card style={{ padding: '20px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '4px' }}>Your cUSDT Balance</div>
                {decryptInputs.length === 0 && !isRevealing ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                    {revealError ? <span style={{ color: 'var(--red)' }}>❌ {revealError}</span> : 'Encrypted on-chain (ERC-7984)'}
                  </span>
                ) : decryptedBalance !== undefined ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(decryptedBalance) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>cUSDT</span>
                    <button
                      onClick={() => { setDecryptInputs([]); setRevealError(null); }}
                      style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}
                    >↻</button>
                  </div>
                ) : isDecryptError ? (
                  <span style={{ fontSize: '13px', color: 'var(--red)' }}>Decrypt failed — check console</span>
                ) : decryptInputs.length > 0 ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Waiting for MetaMask…</span>
                ) : null}
              </div>
              {decryptInputs.length === 0 && !isRevealing && (
                <Button
                  variant="secondary"
                  onClick={handleRevealBalance}
                  style={{ fontSize: '12px', padding: '8px 14px', whiteSpace: 'nowrap' }}
                >
                  🔓 Reveal Balance
                </Button>
              )}
              {isRevealing && (
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
              {/* Tabs */}
              <div style={{
                display: 'flex',
                gap: '0',
                marginBottom: '28px',
                background: 'var(--bg-base)',
                borderRadius: 'var(--radius-md)',
                padding: '4px',
              }}>
                {(['mint', 'unwrap'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); reset(); }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
                      color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: activeTab === tab ? 700 : 500,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab === 'mint' ? '🪙 Mint cUSDT' : '↑ Unwrap to ERC20'}
                  </button>
                ))}
              </div>

              {activeTab === 'mint' ? (
                <>
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
                    Balances are encrypted on-chain (ERC7984).
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
                </>
              ) : (
                <>
                  <div style={{
                    padding: '14px',
                    background: 'var(--bg-base)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '20px',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                  }}>
                    Burns cUSDT and returns the equivalent underlying ERC20 to your wallet.
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Amount (cUSDT)</label>
                    <input
                      style={inputStyle}
                      type="number"
                      value={unwrapAmount}
                      onChange={(e) => setUnwrapAmount(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    style={{ width: '100%' }}
                    onClick={() => { reset(); unwrap(unwrapAmount); }}
                    disabled={isLoading}
                  >
                    {step === 'unwrapping' ? 'Unwrapping...' : `Unwrap ${unwrapAmount} cUSDT → ERC20`}
                  </Button>
                </>
              )}

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
                    : `⏳ ${step === 'minting' ? 'Minting cUSDT...' : 'Unwrapping...'}`}
                </div>
              )}
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}


