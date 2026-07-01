'use client';

import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Hash } from '@/components/ui/Hash';
import { useProgramInfo, useSubmissionCount } from '@/hooks/useProgramData';
import { useReadContract } from 'wagmi';
import { CONTRACTS, BOUNTY_VAULT_ABI } from '@/lib/contracts';

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programId = params.id as string;

  // Mock data - will be replaced with real contract data
  const program = {
    id: programId,
    name: 'DeFi Protocol Alpha',
    address: '0x1234567890123456789012345678901234567890',
    description: 'Decentralized lending and borrowing protocol with cross-chain support. We are committed to security and welcome responsible disclosure of vulnerabilities.',
    website: 'https://defi-alpha.io',
    minTier: 2,
    maxSeverity: 4,
    totalPaid: '$1,250,000',
    reportsCount: 45,
    bountyPool: '$500,000',
    locked: '$125,000',
    admin: '0x9876543210987654321098765432109876543210'
  };

  const recentPayouts = [
    { id: 1, amount: '$50,000', severity: 4, date: '2026-06-28' },
    { id: 2, amount: '$25,000', severity: 3, date: '2026-06-25' },
    { id: 3, amount: '$10,000', severity: 2, date: '2026-06-20' },
  ];

  return (
    <div>
      <Navbar />

      {/* Hero Section */}
      <section className="section" style={{ paddingTop: '64px', paddingBottom: '64px' }}>
        <div className="section-inner">
          <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 800,
              color: 'var(--text)',
              flex: 1
            }}>
              {program.name}
            </h1>
            <SeverityBadge level={program.maxSeverity as 1 | 2 | 3 | 4} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <Hash value={program.address} short={false} />
          </div>

          <p style={{
            fontSize: '17px',
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            maxWidth: '800px',
            marginBottom: '32px'
          }}>
            {program.description}
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <Button variant="primary" onClick={() => router.push(`/program/${programId}/submit`)}>
              🔍 Submit Report
            </Button>
            <Button variant="secondary" onClick={() => window.open(program.website, '_blank')}>
              🌐 Visit Website
            </Button>
          </div>

          <div style={{ 
            fontSize: '12px', 
            fontFamily: 'var(--font-mono)', 
            color: 'var(--text-dim)' 
          }}>
            Admin: <Hash value={program.admin} />
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Stats Grid */}
      <section className="section">
        <div className="section-inner">
          <div className="grid-2" style={{ gap: '24px' }}>
            {/* Left Column - Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Bounty Pool Card */}
              <Card style={{ padding: '32px' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  marginBottom: '12px'
                }}>
                  BOUNTY POOL
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '52px',
                  fontWeight: 700,
                  color: 'var(--cyan)',
                  marginBottom: '8px'
                }}>
                  {program.bountyPool}
                </div>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  Locked: {program.locked}
                </div>
              </Card>

              {/* Program Stats */}
              <Card style={{ padding: '24px' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  marginBottom: '20px'
                }}>
                  PROGRAM STATISTICS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Total Reports</span>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '20px', 
                      fontWeight: 700,
                      color: 'var(--text)'
                    }}>
                      {program.reportsCount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Total Paid</span>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '20px', 
                      fontWeight: 700,
                      color: 'var(--cyan)'
                    }}>
                      {program.totalPaid}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Min Tier Required</span>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '20px', 
                      fontWeight: 700,
                      color: 'var(--text)'
                    }}>
                      Tier {program.minTier}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Max Severity</span>
                    <SeverityBadge level={program.maxSeverity as 1 | 2 | 3 | 4} />
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column - Recent Payouts */}
            <div style={{ height: '100%' }}>
              <Card style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  marginBottom: '20px'
                }}>
                  RECENT PAYOUTS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  {recentPayouts.map((payout) => (
                    <div 
                      key={payout.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        transition: 'border-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '8px'
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '20px',
                          fontWeight: 700,
                          color: 'var(--cyan)'
                        }}>
                          {payout.amount}
                        </span>
                        <SeverityBadge level={payout.severity as 1 | 2 | 3 | 4} />
                      </div>
                      <div style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)'
                      }}>
                        {payout.date}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ 
                  marginTop: '20px',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--border)',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center'
                }}>
                  All payouts are anonymous via ZK proofs
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Reputation Requirements */}
      <section className="section">
        <div className="section-inner">
          <Card style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--cyan)',
              marginBottom: '16px'
            }}>
              ⚡ ELIGIBILITY REQUIREMENTS
            </div>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: '16px'
            }}>
              Minimum Tier {program.minTier} Required
            </h3>
            <p style={{
              fontSize: '15px',
              lineHeight: 1.6,
              color: 'var(--text-muted)',
              marginBottom: '24px'
            }}>
              You need to maintain at least Tier {program.minTier} reputation to submit reports to this program. 
              Build your reputation by successfully reporting vulnerabilities to other programs.
            </p>
            <Button 
              variant="secondary" 
              onClick={() => router.push('/reputation')}
              style={{ width: '100%' }}
            >
              Check My Reputation →
            </Button>
          </Card>
        </div>
      </section>
    </div>
  );
}
