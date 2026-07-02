'use client';

import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Hash } from '@/components/ui/Hash';
import { useRouter } from 'next/navigation';
import { useProgramInfo, useSubmissionCount } from '@/hooks/useProgramData';
import { CONTRACTS } from '@/lib/contracts';

export default function HomePage() {
  const router = useRouter();

  const { programInfo, isLoading: infoLoading } = useProgramInfo();
  const { count: reportsCount, isLoading: countLoading } = useSubmissionCount();
  const isLoading = infoLoading || countLoading;

  return (
    <div>
      <Navbar />

      {/* Hero Section */}
      <section className="section" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ textAlign: 'center', maxWidth: '1100px', margin: '0 auto' }}>
            <h1 style={{
              fontSize: 'clamp(32px, 4vw, 54px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
              marginBottom: '24px',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}>
              Confidential Bug Bounties<br />&amp; Anonymous Whitehat Reputation
            </h1>
            <p style={{
              fontSize: 'clamp(17px, 2.2vw, 22px)',
              color: 'var(--text-muted)',
              maxWidth: '600px',
              margin: '0 auto 40px',
              lineHeight: 1.6
            }}>
              Secure vulnerability reports with <strong style={{ color: 'var(--text)', fontWeight: 700 }}>RSA-OAEP &amp; AES-GCM</strong>. Compute confidential severity, impact, rewards, and whitehat reputation using <strong style={{ color: 'var(--text)', fontWeight: 700 }}>FHE</strong>. Withdraw bounties anonymously with <strong style={{ color: 'var(--text)', fontWeight: 700 }}>Zero-Knowledge Proofs</strong>.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary">
                🔍 Browse Programs
              </Button>
              <Button variant="secondary">
                📝 Submit Report
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Stats Section */}
      <section className="section" style={{ paddingTop: '64px', paddingBottom: '64px' }}>
        <div className="section-inner">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '24px'
          }}>
            {[
              { label: 'ACTIVE PROGRAMS', value: isLoading ? '...' : '1' },
              { label: 'REPORTS SUBMITTED', value: isLoading ? '...' : reportsCount },
              { label: 'ENCRYPTION', value: 'FHE' },
              { label: 'NETWORK', value: 'Sepolia' }
            ].map((stat, i) => (
              <Card key={i} style={{ padding: '24px', textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--cyan)',
                  marginBottom: '12px'
                }}>
                  {stat.label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '40px',
                  fontWeight: 700,
                  color: 'var(--text)'
                }}>
                  {stat.value}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Programs Section */}
      <section className="section">
        <div className="section-inner">
          <div className="section-label">ACTIVE PROGRAMS</div>
          <h2 className="section-title">Bug Bounty Programs</h2>
          <p className="section-desc">
            Explore verified bug bounty programs with confidential payouts and anonymous submissions.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
            marginTop: '40px'
          }}>
            {isLoading ? (
              <Card style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Loading from chain…</div>
              </Card>
            ) : programInfo ? (
              <Card style={{ padding: '24px', cursor: 'pointer' }}>
                {/* Program Header */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                      {programInfo.name || 'VulnVault Program'}
                    </h3>
                    <SeverityBadge level={4} />
                  </div>
                  <Hash value={CONTRACTS.BUG_BOUNTY_PROGRAM} />
                </div>

                {/* Description */}
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
                  {programInfo.description || 'Privacy-preserving bug bounty program with FHE-encrypted report submissions.'}
                </p>

                {/* Stats */}
                <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: '4px' }}>REPORTS</div>
                    <div style={{ fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                      {reportsCount}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: '4px' }}>PROGRAM ID</div>
                    <div style={{ fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>
                      #{programInfo.programId}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: '4px' }}>ADMIN</div>
                    <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                      {programInfo.admin ? programInfo.admin.slice(0, 6) + '…' + programInfo.admin.slice(-4) : '—'}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <Button variant="primary" style={{ width: '100%' }} onClick={() => router.push('/program/0')}>
                  View Program →
                </Button>
              </Card>
            ) : (
              <Card style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>No programs found on-chain.</div>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '40px 24px',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          fontSize: '13px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)'
        }}>
          <p>VULNVAULT © 2026 | Privacy-Preserving Bug Bounties</p>
          <p style={{ marginTop: '8px' }}>Powered by ZK Proofs + FHE Encryption</p>
        </div>
      </footer>
    </div>
  );
}
