'use client';

import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { useState, useEffect } from 'react';
import { useAllow, useIsAllowed, useUserDecrypt } from '@zama-fhe/react-sdk';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Hash } from '@/components/ui/Hash';
import { StatusBadge } from '@/components/ui/Badge';
import { useProgramInfo, useSubmissionCount } from '@/hooks/useProgramData';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI, BOUNTY_VAULT_ABI } from '@/lib/contracts';

// Maps on-chain uint8 status to label
const STATUS_LABELS = ['Pending', 'UnderReview', 'Approved', 'Rejected', 'Withdrawn'] as const;
type ReportStatus = typeof STATUS_LABELS[number];
const NULL_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

function useAllSubmissions() {
  const { data: ids } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getAllSubmissionIds',
  });
  return (ids as `0x${string}`[]) ?? [];
}

function useVaultHandles() {
  // programId is confirmed to be 0 on deployed contract; fetch dynamically for robustness
  const { data: programData } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'programId',
  });
  const pid = programData !== undefined ? (programData as bigint) : undefined;

  const { data: available } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getAvailableBalance',
    args: pid !== undefined ? [pid] : undefined,
    query: { enabled: pid !== undefined },
  });
  const { data: locked } = useReadContract({
    address: CONTRACTS.BOUNTY_VAULT,
    abi: BOUNTY_VAULT_ABI,
    functionName: 'getLockedBalance',
    args: pid !== undefined ? [pid] : undefined,
    query: { enabled: pid !== undefined },
  });

  return {
    availableHandle: available as `0x${string}` | undefined,
    lockedHandle: locked as `0x${string}` | undefined,
  };
}

// FHE-decryptable balance card
// Two-step UX: [Authorize] → isAllowed=true → [Decrypt] → oracle call
// Keeping them separate ensures each MetaMask prompt comes from a direct user gesture.
function FheBalanceCard({ label, handle }: { label: string; handle: `0x${string}` | undefined }) {
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

  // Timeout: if oracle hasn't responded in 60s, show retry
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
    displayValue = '…';
    displayColor = 'var(--text-dim)';
  } else if (!isHandleValid) {
    displayValue = '0 cUSDT';
    displayColor = 'var(--text-muted)';
  } else if (isDecryptError) {
    displayValue = '⚠️ No ACL access';
    displayColor = 'var(--red, #ff4f4f)';
  } else if (clicked && isDecrypting && timedOut) {
    displayValue = '⏱ Oracle slow…';
    displayColor = 'var(--yellow)';
  } else if (clicked && isDecrypting) {
    displayValue = 'Decrypting…';
    displayColor = 'var(--yellow)';
  } else {
    displayValue = '🔒 FHE Encrypted';
    displayColor = 'var(--yellow)';
  }

  // Step 1: Authorize vault contract (first MetaMask interaction)
  const handleAuthorize = async () => {
    await allow([...vaultContracts]);
  };

  // Step 2: Decrypt — direct user gesture → MetaMask sign for oracle
  const handleDecrypt = () => {
    setTimedOut(false);
    setClicked(false);
    // Small tick to reset hook then re-enable
    setTimeout(() => setClicked(true), 50);
  };

  return (
    <Card style={{ padding: '28px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '12px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: decryptedValue !== undefined ? '28px' : '20px', fontWeight: 700, color: displayColor, marginBottom: '16px', wordBreak: 'break-all' }}>
        {displayValue}
      </div>
      {isHandleValid && decryptedValue === undefined && !isDecryptError && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {/* Step 1: shown only if not yet authorized */}
          {!isAllowed && (
            <button
              onClick={handleAuthorize}
              disabled={isAllowing}
              style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.25)', color: 'var(--yellow)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', opacity: isAllowing ? 0.5 : 1 }}
            >
              {isAllowing ? 'Authorizing…' : '① Authorize'}
            </button>
          )}
          {/* Step 2: shown once authorized */}
          {isAllowed && (
            <button
              onClick={handleDecrypt}
              disabled={isDecrypting && !timedOut}
              style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'rgba(0,255,198,0.08)', border: '1px solid rgba(0,255,198,0.2)', color: 'var(--cyan)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', opacity: (isDecrypting && !timedOut) ? 0.5 : 1 }}
            >
              {isDecrypting && !timedOut ? 'Decrypting…' : timedOut ? '↺ Retry' : '🔓 Decrypt'}
            </button>
          )}
          {isAllowed && !isAllowing && !clicked && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              ✓ Authorized — click Decrypt to reveal
            </div>
          )}
          {isDecrypting && !timedOut && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Waiting for Zama oracle…
            </div>
          )}
          {timedOut && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', maxWidth: '180px' }}>
              Oracle timeout — click Retry or wait a moment
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SubmissionRow({ id, router }: { id: `0x${string}`; router: ReturnType<typeof useRouter> }) {
  const { data: meta } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getSubmissionMeta',
    args: [id],
  });

  const submittedAt = meta ? new Date(Number(meta[0]) * 1000).toLocaleDateString() : '…';
  const statusIdx = meta ? Number(meta[1]) : 0;
  const status = STATUS_LABELS[statusIdx] ?? 'Pending';

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 140px', gap: '16px', padding: '20px 24px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--cyan)', wordBreak: 'break-all' }}>{id}</div>
      <div><StatusBadge status={status as ReportStatus} /></div>
      <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{submittedAt}</div>
      <div>
        <Button variant="primary" onClick={() => router.push(`/admin/review/${id}`)} style={{ fontSize: '12px', padding: '8px 16px' }}>
          Review →
        </Button>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { programInfo, isLoading } = useProgramInfo();
  const { count } = useSubmissionCount();
  const allIds = useAllSubmissions();
  const { availableHandle, lockedHandle } = useVaultHandles();

  const isAdmin =
    !!address &&
    !!programInfo?.admin &&
    address.toLowerCase() === programInfo.admin.toLowerCase();

  if (!mounted) return <div><Navbar /></div>;

  if (!address) {
    return (
      <div>
        <Navbar />
        <section className="section" style={{ paddingTop: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔌</div>
          <div style={{ fontSize: '16px', color: 'var(--text-muted)' }}>Connect your wallet to continue</div>
        </section>
      </div>
    );
  }

  if (!isLoading && !isAdmin) {
    return (
      <div>
        <Navbar />
        <section className="section" style={{ paddingTop: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Access Denied</div>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '24px' }}>
            Connected: {address}<br />
            Required: {programInfo?.admin}
          </div>
          <Button variant="secondary" onClick={() => router.push('/')}>← Back to Programs</Button>
        </section>
      </div>
    );
  }

  return (
    <div>
      <Navbar />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, color: 'var(--text)', marginBottom: '12px' }}>
              Admin Dashboard
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '12px' }}>
              {isLoading ? 'Loading…' : programInfo?.name}
            </p>
            <Hash value={CONTRACTS.BUG_BOUNTY_PROGRAM} />
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            <FheBalanceCard label="AVAILABLE BALANCE" handle={availableHandle} />
            <FheBalanceCard label="LOCKED FUNDS" handle={lockedHandle} />
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>TOTAL REPORTS</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--text)' }}>{count}</div>
            </Card>
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>PROGRAM ID</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--cyan)' }}>#{programInfo?.programId ?? '…'}</div>
            </Card>
          </div>
          {/* Shortcut to vault management */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-16px', marginBottom: '32px' }}>
            <button
              onClick={() => router.push('/admin/vault')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              💰 Deposit cUSDT to Vault →
            </button>
          </div>

          {/* Quick Actions */}
          <Card style={{ padding: '24px', marginBottom: '32px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>⚡ QUICK ACTIONS</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => router.push('/admin/vault')}>💰 Manage Vault</Button>
              <Button variant="secondary" onClick={() => router.push('/disputes')}>⚖️ View Disputes</Button>
            </div>
          </Card>

          {/* All Submissions Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>ALL SUBMISSIONS</div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{allIds.length} reports</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 140px', gap: '16px', padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              <div>SUBMISSION ID</div><div>STATUS</div><div>SUBMITTED</div><div>ACTION</div>
            </div>
            {allIds.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                No submissions yet
              </div>
            ) : (
              allIds.map((id) => <SubmissionRow key={id} id={id} router={router} />)
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

