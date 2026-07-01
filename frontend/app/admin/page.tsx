'use client';

import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Hash } from '@/components/ui/Hash';
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge';

export default function AdminDashboardPage() {
  const router = useRouter();
  // Mock data - will be replaced with real contract data
  const programStats = {
    name: 'DeFi Protocol Alpha',
    address: '0x1234567890123456789012345678901234567890',
    totalBountyPool: '$500,000',
    availableBalance: '$375,000',
    lockedBalance: '$125,000',
    totalReports: 45,
    pending: 8,
    underReview: 5,
    approved: 28,
    rejected: 4,
    totalPaid: '$1,250,000'
  };

  const pendingReports = [
    {
      id: 1,
      submissionId: 45,
      severity: 4,
      impactType: 'SmartContract',
      submittedDate: '2026-06-29',
      status: 'Pending' as const
    },
    {
      id: 2,
      submissionId: 44,
      severity: 3,
      impactType: 'Frontend',
      submittedDate: '2026-06-28',
      status: 'UnderReview' as const
    },
    {
      id: 3,
      submissionId: 43,
      severity: 3,
      impactType: 'SmartContract',
      submittedDate: '2026-06-27',
      status: 'Pending' as const
    },
    {
      id: 4,
      submissionId: 42,
      severity: 2,
      impactType: 'Backend',
      submittedDate: '2026-06-26',
      status: 'UnderReview' as const
    },
  ];

  return (
    <div>
      <Navbar />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: '12px'
            }}>
              Admin Dashboard
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              marginBottom: '12px'
            }}>
              Manage your bug bounty program: {programStats.name}
            </p>
            <Hash value={programStats.address} />
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AVAILABLE BALANCE</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--cyan)' }}>{programStats.availableBalance}</div>
            </Card>
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>LOCKED FUNDS</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--yellow)' }}>{programStats.lockedBalance}</div>
            </Card>
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>PENDING REVIEW</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--red)' }}>{programStats.pending}</div>
            </Card>
            <Card style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>TOTAL PAID</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--green)' }}>{programStats.totalPaid}</div>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card style={{ padding: '24px', marginBottom: '32px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: '20px' }}>⚡ QUICK ACTIONS</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => router.push('/admin/vault')}>💰 Manage Vault</Button>
              <Button variant="secondary" onClick={() => alert('Program settings coming soon')}>⚙️ Program Settings</Button>
              <Button variant="secondary" onClick={() => router.push('/disputes')}>⚖️ View Disputes</Button>
            </div>
          </Card>

          {/* Pending Reports Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>PENDING REPORTS</div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{pendingReports.length} reports</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 140px 120px 140px', gap: '16px', padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              <div>ID</div><div>Impact Type</div><div>Severity</div><div>Status</div><div>Submitted</div><div>Action</div>
            </div>
            {pendingReports.map((report) => (
              <div key={report.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 140px 120px 140px', gap: '16px', padding: '20px 24px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>#{report.submissionId}</div>
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>{report.impactType}</div>
                <div><SeverityBadge level={report.severity as 1 | 2 | 3 | 4} /></div>
                <div><StatusBadge status={report.status} /></div>
                <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{report.submittedDate}</div>
                <div>
                  <Button variant="primary" onClick={() => router.push(`/admin/review/${report.submissionId}`)} style={{ fontSize: '12px', padding: '8px 16px' }}>Review →</Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </section>
    </div>
  );
}
