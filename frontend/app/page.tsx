'use client';

import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Hash } from '@/components/ui/Hash';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  // Mock data - will be replaced with real contract data
  const stats = {
    totalPrograms: 12,
    totalBounties: '$2,450,000',
    reportsSubmitted: 847,
    avgPayout: '$15,200'
  };

  const programs = [
    {
      id: 1,
      name: 'DeFi Protocol Alpha',
      address: '0x1234567890123456789012345678901234567890',
      description: 'Decentralized lending and borrowing protocol with cross-chain support',
      bountyPool: '$500,000',
      reportsCount: 45,
      maxSeverity: 4,
      minTier: 2
    },
    {
      id: 2,
      name: 'NFT Marketplace Beta',
      address: '0x2345678901234567890123456789012345678901',
      description: 'Next-generation NFT marketplace with zero-knowledge privacy features',
      bountyPool: '$250,000',
      reportsCount: 28,
      maxSeverity: 3,
      minTier: 1
    },
    {
      id: 3,
      name: 'Bridge Protocol Gamma',
      address: '0x3456789012345678901234567890123456789012',
      description: 'Cross-chain bridge supporting 10+ blockchain networks',
      bountyPool: '$800,000',
      reportsCount: 62,
      maxSeverity: 4,
      minTier: 3
    },
  ];

  return (
    <div>
      <Navbar />

      {/* Hero Section */}
      <section className="section" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{
              fontSize: 'clamp(64px, 10vw, 112px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
              marginBottom: '24px',
              lineHeight: 1
            }}>
              Anonymous<br />Bug Bounties
            </h1>
            <p style={{
              fontSize: 'clamp(17px, 2.2vw, 22px)',
              color: 'var(--text-muted)',
              maxWidth: '600px',
              margin: '0 auto 40px',
              lineHeight: 1.6
            }}>
              Privacy-preserving bug bounty platform powered by ZK proofs and FHE encryption.
              Submit vulnerabilities anonymously, withdraw rewards with zero-knowledge proofs.
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
              { label: 'ACTIVE PROGRAMS', value: stats.totalPrograms },
              { label: 'TOTAL BOUNTIES', value: stats.totalBounties },
              { label: 'REPORTS SUBMITTED', value: stats.reportsSubmitted },
              { label: 'AVG PAYOUT', value: stats.avgPayout }
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '24px',
            marginTop: '40px'
          }}>
            {programs.map((program) => (
              <Card key={program.id} style={{ padding: '24px', cursor: 'pointer' }}>
                {/* Program Header */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      flex: 1
                    }}>
                      {program.name}
                    </h3>
                    <SeverityBadge level={program.maxSeverity as 1 | 2 | 3 | 4} />
                  </div>
                  <Hash value={program.address} />
                </div>

                {/* Description */}
                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.6,
                  marginBottom: '20px'
                }}>
                  {program.description}
                </p>

                {/* Stats */}
                <div style={{
                  display: 'flex',
                  gap: '24px',
                  marginBottom: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                      marginBottom: '4px'
                    }}>
                      BOUNTY POOL
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--cyan)'
                    }}>
                      {program.bountyPool}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                      marginBottom: '4px'
                    }}>
                      REPORTS
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text)'
                    }}>
                      {program.reportsCount}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                      marginBottom: '4px'
                    }}>
                      MIN TIER
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text)'
                    }}>
                      {program.minTier}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <Button variant="primary" style={{ width: '100%' }} onClick={() => router.push(`/program/${program.id}`)}>
                  View Program →
                </Button>
              </Card>
            ))}
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
