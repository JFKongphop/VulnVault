'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useAllow, useIsAllowed, useUserDecrypt } from '@zama-fhe/react-sdk';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useFundVault } from '@/hooks/useFundVault';
import { CONTRACTS, BOUNTY_VAULT_ABI, BUG_BOUNTY_PROGRAM_ABI, CONFIDENTIAL_TOKEN_ABI } from '@/lib/contracts';

const NULL_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

function BalanceCard({ label, handle }: { label: string; handle: `0x${string}` | undefined }) {
  const [clicked, setClicked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const vaultContracts: [`0x${string}`] = [CONTRACTS.BOUNTY_VAULT];
  const isHandleValid = !!handle && handle !== NULL_HANDLE;

  const { mutateAsync: allow, isPending: isAllowing } = useAllow();
  const { data: isAllowed } = useIsAllowed({ contractAddresses: vaultContracts });

  const { data: decrypted, isPending: isDecrypting, isError: isDecryptError } = useUserDecrypt(
    { handles: [{ handle: handle ?? NULL_HANDLE, contractAddress: CONTRACTS.BOUNTY_VAULT }] },
    { enabled: clicked && !!isAllowed && isHandleValid },
  );

  useEffect(() => {
    if (!isDecrypting || decrypted !== undefined) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, [isDecrypting, decrypted]);

  const decryptedValue = handle ? decrypted?.[handle] : undefined;

  let displayValue: string;
  let displayColor: string;
  if (decryptedValue !== undefined) {
    displayValue = (Number(decryptedValue) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' cUSDT';
    displayColor = 'var(--cyan)';
  } else if (handle === undefined) {
    displayValue = '…'; displayColor = 'var(--text-dim)';
  } else if (!isHandleValid) {
    displayValue = '0 cUSDT'; displayColor = 'var(--text-muted)';
  } else if (isDecryptError) {
    displayValue = '⚠️ No ACL access'; displayColor = 'var(--red, #ff4f4f)';
  } else if (clicked && isDecrypting && timedOut) {
    displayValue = '⏱ Oracle slow…'; displayColor = 'var(--yellow)';
  } else if (clicked && isDecrypting) {
    displayValue = 'Decrypting…'; displayColor = 'var(--yellow)';
  } else {
    displayValue = '🔒 FHE Encrypted'; displayColor = 'var(--yellow)';
  }

  return (
    <Card style={{ padding: '24px 20px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '10px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: decryptedValue !== undefined ? '24px' : '18px', fontWeight: 700, color: displayColor, marginBottom: '12px' }}>
        {displayValue}
      </div>
      {isHandleValid && decryptedValue === undefined && !isDecryptError && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          {!isAllowed && (
            <button onClick={() => allow([...vaultContracts])} disabled={isAllowing}
              style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.25)', color: 'var(--yellow)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', opacity: isAllowing ? 0.5 : 1 }}>
              {isAllowing ? 'Authorizing…' : '① Authorize'}
            </button>
          )}
          {isAllowed && (
            <button
              onClick={() => { setTimedOut(false); setClicked(false); setTimeout(() => setClicked(true), 50); }}
              disabled={isDecrypting && !timedOut}
              style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'rgba(0,255,198,0.08)', border: '1px solid rgba(0,255,198,0.2)', color: 'var(--cyan)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', opacity: (isDecrypting && !timedOut) ? 0.5 : 1 }}>
              {isDecrypting && !timedOut ? 'Decrypting…' : timedOut ? '↺ Retry' : '🔓 Decrypt'}
            </button>
          )}
          {isDecrypting && !timedOut && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Waiting for Zama oracle…</div>
          )}
          {timedOut && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', maxWidth: '160px' }}>Oracle timeout — click Retry</div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function VaultPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState('2000');

  const { step, error, txHash, fund, reset } = useFundVault();

  const { data: programData } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'programId',
  });
  const pid = programData !== undefined ? (programData as bigint) : undefined;

  const { data: availableRaw } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getAvailableBalance',
    args: pid !== undefined ? [pid] : undefined,
    query: { enabled: pid !== undefined },
  });
  const { data: lockedRaw } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getLockedBalance',
    args: pid !== undefined ? [pid] : undefined,
    query: { enabled: pid !== undefined },
  });

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div><Navbar /></div>;

  const isFunding = step === 'encrypting' || step === 'confirming';
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  const labelStyle: React.CSSProperties = { ...mono, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', display: 'block', marginBottom: '8px' };
  const stepLabel: Record<typeof step, string> = {
    idle: 'Fund Vault',
    encrypting: 'Encrypting…',
    confirming: 'Confirm in MetaMask…',
    done: '✓ Funded!',
    error: 'Try Again',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px' }}>

        <button onClick={() => router.push('/admin')} style={{ ...mono, fontSize: '12px', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '24px', padding: 0 }}>
          ← Back to Dashboard
        </button>
        <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Vault Management</h1>
        <p style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)', marginBottom: '40px' }}>{CONTRACTS.BOUNTY_VAULT}</p>

        {/* Balances */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
          <BalanceCard label="Available Balance" handle={availableRaw as `0x${string}` | undefined} />
          <BalanceCard label="Locked Funds" handle={lockedRaw as `0x${string}` | undefined} />
        </div>

        {/* Fund Vault */}
        <Card style={{ padding: '32px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Deposit cUSDT to Vault</h2>
          <p style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.7 }}>
            The amount is FHE-encrypted client-side before transfer. The vault's <code>onConfidentialTransferReceived</code> callback updates the encrypted available balance automatically.
          </p>

          <div style={{ background: 'rgba(0,255,198,0.04)', border: '1px solid rgba(0,255,198,0.12)', borderRadius: '8px', padding: '14px 18px', marginBottom: '24px' }}>
            <div style={{ ...mono, fontSize: '11px', fontWeight: 600, color: 'var(--cyan)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Flow</div>
            <ol style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)', margin: 0, paddingLeft: '18px', lineHeight: 2 }}>
              <li>Amount encrypted → <code>externalEuint64</code> handle + proof</li>
              <li><code>cUSDT.confidentialTransferAndCall(vault, encAmount, proof, &quot;0x&quot;)</code></li>
              <li>Vault receives tokens → <code>availableBalance += encAmount</code></li>
              <li>Admin can now approve bounties up to this amount</li>
            </ol>
          </div>

          {step === 'done' ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>✓</div>
              <div style={{ ...mono, fontSize: '14px', color: 'var(--cyan)', marginBottom: '14px' }}>Vault funded successfully</div>
              {txHash && (
                <div style={{ ...mono, fontSize: '11px', color: 'var(--text-dim)', marginBottom: '18px', wordBreak: 'break-all' }}>
                  tx:{' '}
                  <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>
                    {txHash.slice(0, 18)}…{txHash.slice(-8)}
                  </a>
                </div>
              )}
              <Button variant="secondary" onClick={reset}>Fund Again</Button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Amount (cUSDT)</label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isFunding}
                    placeholder="e.g. 2000"
                    style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text)', fontSize: '16px', ...mono, outline: 'none', boxSizing: 'border-box', opacity: isFunding ? 0.6 : 1 }}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => fund(amount)}
                  disabled={isFunding || !isConnected || !amount || Number(amount) <= 0}
                  style={{ padding: '12px 28px', whiteSpace: 'nowrap', opacity: isFunding ? 0.7 : 1 }}
                >
                  {stepLabel[step]}
                </Button>
              </div>
              {step === 'encrypting' && (
                <div style={{ marginTop: '10px', ...mono, fontSize: '11px', color: 'var(--text-dim)' }}>FHE-encrypting amount client-side…</div>
              )}
              {step === 'confirming' && (
                <div style={{ marginTop: '10px', ...mono, fontSize: '11px', color: 'var(--text-dim)' }}>Check MetaMask to confirm the transaction.</div>
              )}
            </>
          )}

          {error && (
            <div style={{ marginTop: '14px', padding: '12px 16px', background: 'rgba(255,79,79,0.08)', border: '1px solid rgba(255,79,79,0.25)', borderRadius: '8px', ...mono, fontSize: '12px', color: '#ff6b6b' }}>
              ⚠ {error}
            </div>
          )}
        </Card>

        <div style={{ ...mono, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 2 }}>
          <div>cUSDT: <span style={{ color: 'var(--text-muted)' }}>{CONTRACTS.CONFIDENTIAL_TOKEN}</span></div>
          <div>BugBountyProgram: <span style={{ color: 'var(--text-muted)' }}>{CONTRACTS.BUG_BOUNTY_PROGRAM}</span></div>
          <div>Need more cUSDT? <a href="/wrap" style={{ color: 'var(--cyan)' }}>Mint on the Wrap page →</a></div>
        </div>

      </div>
    </div>
  );
}
