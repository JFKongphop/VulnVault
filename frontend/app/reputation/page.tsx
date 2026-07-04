'use client';

import { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/Loading';
import { useReputation } from '@/hooks/useReputation';

const TIER_INFO = [
  { name: 'Unranked', threshold: 0,    color: 'var(--text-dim)', emoji: '?' },
  { name: 'Bronze',   threshold: 50,   color: '#cd7f32',         emoji: '🥉' },
  { name: 'Silver',   threshold: 150,  color: '#c0c0c0',         emoji: '🥈' },
  { name: 'Gold',     threshold: 400,  color: '#ffd700',         emoji: '🥇' },
  { name: 'Elite',    threshold: 1000, color: '#e5e4e2',         emoji: '💎' },
];

export default function ReputationPage() {
  const [secret0, setSecret0] = useState('');
  const [secret1, setSecret1] = useState('');
  const [impactType, setImpactType] = useState('');
  const [severity, setSeverity] = useState('');
  const [commitment, setCommitment] = useState<`0x${string}` | undefined>();
  const [commitError, setCommitError] = useState('');

  const {
    isRegistered,
    score,
    earnings,
    approvedCount,
    tier,
    grantDecryptPermission,
    isAllowing,
    allowConfirmed,
    isDecrypting,
    decryptError,
    hasHandles,
  } = useReputation(commitment);

  const handleDeriveCommitment = async () => {
    setCommitError('');
    try {
      if (!secret0 || !secret1 || !impactType || !severity) {
        setCommitError('All fields are required');
        return;
      }
      const { poseidon4 } = await import('poseidon-lite');
      const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      const c = poseidon4([
        BigInt(secret0) % FIELD,
        BigInt(secret1) % FIELD,
        BigInt(impactType),
        BigInt(severity),
      ]);
      setCommitment(`0x${c.toString(16).padStart(64, '0')}` as `0x${string}`);
    } catch {
      setCommitError('Invalid input — enter the exact secrets from your report submission');
    }
  };

  const currentTier = TIER_INFO[tier] ?? TIER_INFO[0];
  const nextTier = TIER_INFO[tier + 1];
  const progress = score && nextTier
    ? Math.min(100, Number((score - BigInt(currentTier.threshold)) * 100n / BigInt(nextTier.threshold - currentTier.threshold)))
    : tier >= TIER_INFO.length - 1 ? 100 : 0;

  return (
    <div>
      <Navbar />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner" style={{ maxWidth: '800px', margin: '0 auto' }}>

          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
            My Reputation
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '40px', lineHeight: 1.6 }}>
            FHE-encrypted on-chain. Enter your report secrets to derive your commitment and decrypt your score.
          </p>

          {/* Step 1: Enter secrets */}
          <Card style={{ padding: '32px', marginBottom: '24px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>
              STEP 1 — ENTER REPORT SECRETS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Secret 0</label>
                <Input placeholder="From your saved secrets" value={secret0} onChange={e => setSecret0(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Secret 1</label>
                <Input placeholder="From your saved secrets" value={secret1} onChange={e => setSecret1(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Impact Type (1–4)</label>
                <Input placeholder="e.g. 1" value={impactType} onChange={e => setImpactType(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Severity (1–4)</label>
                <Input placeholder="e.g. 2" value={severity} onChange={e => setSeverity(e.target.value)} />
              </div>
            </div>
            {commitError && (
              <p style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>⚠ {commitError}</p>
            )}
            <Button variant="secondary" onClick={handleDeriveCommitment}>
              Derive Commitment
            </Button>
            {commitment && (
              <p style={{ marginTop: '12px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                Commitment: <span style={{ color: 'var(--text)' }}>{commitment}</span>
              </p>
            )}
          </Card>

          {/* Step 2: Status + Grant Permission */}
          {commitment && (
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>
                STEP 2 — GRANT DECRYPT PERMISSION
              </div>

              {!isRegistered ? (
                <p style={{ fontSize: '14px', color: 'var(--red)' }}>
                  ⚠ This commitment is not registered. Make sure you entered the correct secrets, impactType, and severity.
                </p>
              ) : allowConfirmed ? (
                <p style={{ fontSize: '14px', color: 'var(--green)' }}>
                  ✓ Permission granted — decrypting score…
                </p>
              ) : (
                <>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                    Commitment found on-chain ({approvedCount} approved report{approvedCount !== 1 ? 's' : ''}).
                    Sign a transaction to grant your wallet FHE decrypt permission.
                  </p>
                  <Button variant="primary" onClick={grantDecryptPermission} disabled={isAllowing}>
                    {isAllowing ? <><LoadingSpinner size={14} /> Confirming…</> : '🔓 Grant Decrypt Permission'}
                  </Button>
                </>
              )}
            </Card>
          )}

          {/* Step 3: Score display */}
          {allowConfirmed && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                {/* Score */}
                <Card style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '16px' }}>
                    REPUTATION SCORE
                  </div>
                  {isDecrypting ? (
                    <LoadingSpinner size={32} />
                  ) : score !== null ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '64px', fontWeight: 700, color: currentTier.color }}>
                      {score.toString()}
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--red)' }}>{decryptError?.message ?? 'Decryption pending…'}</p>
                  )}
                </Card>

                {/* Earnings */}
                <Card style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '16px' }}>
                    TOTAL EARNINGS
                  </div>
                  {isDecrypting ? (
                    <LoadingSpinner size={32} />
                  ) : earnings !== null ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '48px', fontWeight: 700, color: 'var(--cyan)' }}>
                      {(Number(earnings) / 1_000_000).toFixed(2)} <span style={{ fontSize: '20px' }}>cUSDT</span>
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--red)' }}>{decryptError?.message ?? 'Decryption pending…'}</p>
                  )}
                </Card>
              </div>

              {/* Tier + progress */}
              <Card style={{ padding: '32px', marginBottom: '24px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>
                  CURRENT TIER
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: 700, color: currentTier.color, marginBottom: '4px' }}>{currentTier.name}</h3>
                    <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>≥ {currentTier.threshold} points</div>
                  </div>
                  <div style={{ fontSize: '56px' }}>{currentTier.emoji}</div>
                </div>
                {nextTier && score !== null && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Progress to {nextTier.name}</span>
                      <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{score.toString()} / {nextTier.threshold}</span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: 'var(--bg-input)', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier.color})`, transition: 'width 0.5s ease' }} />
                    </div>
                  </>
                )}
              </Card>

              {/* Tier table */}
              <Card style={{ padding: '32px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>
                  ALL TIERS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {TIER_INFO.slice(1).map((t, i) => (
                    <div key={i} style={{ padding: '16px 20px', border: `${i + 1 === tier ? '2px' : '1px'} solid ${i + 1 === tier ? t.color : 'var(--border)'}`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{t.emoji}</span>
                        <span style={{ fontWeight: 700, color: t.color, fontSize: '16px' }}>{t.name}</span>
                        {i + 1 === tier && <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: t.color, color: '#000', padding: '2px 8px', borderRadius: '4px' }}>CURRENT</span>}
                      </div>
                      <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>≥ {t.threshold} pts</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

        </div>
      </section>
    </div>
  );
}

