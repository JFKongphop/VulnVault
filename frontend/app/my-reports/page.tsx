'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge';
import { useMyReports } from '@/hooks/useMyReports';
import { DecryptReportModal } from '@/components/DecryptReportModal';
import { useAdminDecrypt } from '@/hooks/useAdminDecrypt';

export default function MyReportsPage() {
  const { submissionIds, isLoading } = useMyReports();
  const [mounted, setMounted] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<`0x${string}` | undefined>();
  const [showDecryptModal, setShowDecryptModal] = useState(false);

  const {
    decryptedReport,
    isDecrypting,
    error,
    decryptWithSymmetricKey,
  } = useAdminDecrypt(selectedSubmission);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reports = submissionIds.map((id, index) => ({
    id: index + 1,
    submissionId: id,
    program: 'Bug Bounty Program',
    severity: 3,
    status: 'Pending',
    bounty: 'Pending',
    submittedDate: new Date().toISOString().split('T')[0],
    canWithdraw: false,
  }));

  const stats = {
    total: reports.length,
    approved: reports.filter(r => r.status === 'Approved').length,
    pending: reports.filter(r => r.status === 'Pending' || r.status === 'UnderReview').length,
    rejected: reports.filter(r => r.status === 'Rejected').length,
  };

  const handleDecrypt = (submissionId: `0x${string}`) => {
    setSelectedSubmission(submissionId);
    setShowDecryptModal(true);
  };

  const handleDecryptWithKey = async (symmetricKey: string) => {
    await decryptWithSymmetricKey(symmetricKey);
  };

  if (!mounted || isLoading) {
    return (
      <div>
        <Navbar />
        <section className="section" style={{ paddingTop: '64px', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <div style={{ fontSize: '16px', color: 'var(--text-muted)' }}>Loading your reports...</div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <Navbar />

      <DecryptReportModal
        isOpen={showDecryptModal}
        onClose={() => {
          setShowDecryptModal(false);
          setSelectedSubmission(undefined);
        }}
        onDecrypt={handleDecryptWithKey}
        decryptedReport={decryptedReport}
        isDecrypting={isDecrypting}
        error={error}
        mode="reporter"
      />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, color: 'var(--text)', marginBottom: '12px' }}>
              My Reports
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Track the status of your submitted vulnerability reports. Use your backed-up symmetric key to decrypt and view your submissions.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            {[
              { label: 'Total', value: stats.total, color: 'var(--text)' },
              { label: 'Approved', value: stats.approved, color: 'var(--green)' },
              { label: 'Pending', value: stats.pending, color: 'var(--yellow)' },
              { label: 'Rejected', value: stats.rejected, color: 'var(--red)' },
            ].map(stat => (
              <Card key={stat.label} style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '40px', fontWeight: 700, color: stat.color, marginBottom: '8px' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {stat.label}
                </div>
              </Card>
            ))}
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
              All Reports
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 120px 140px 200px', gap: '16px', padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              <div>ID</div>
              <div>Submission</div>
              <div>Severity</div>
              <div>Status</div>
              <div>Bounty</div>
              <div>Actions</div>
            </div>

            {reports.map((report) => (
              <div key={report.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 120px 140px 200px', gap: '16px', padding: '20px 24px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>#{report.id}</div>
                <div>
                  <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {report.submissionId.slice(0, 10)}...{report.submissionId.slice(-6)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>{report.submittedDate}</div>
                </div>
                <div><SeverityBadge level={report.severity as 1 | 2 | 3 | 4} /></div>
                <div><StatusBadge status={report.status as 'Pending' | 'UnderReview' | 'Approved' | 'Rejected' | 'Withdrawn'} /></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: report.bounty === 'Pending' ? 'var(--text-muted)' : 'var(--cyan)' }}>
                  {report.bounty}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="secondary" onClick={() => handleDecrypt(report.submissionId)} style={{ fontSize: '12px', padding: '8px 12px' }}>
                    🔓 Decrypt
                  </Button>
                  {report.canWithdraw && (
                    <Button variant="success" onClick={() => { window.location.href = `/withdraw/${report.submissionId}`; }} style={{ fontSize: '12px', padding: '8px 16px' }}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {reports.length === 0 && (
              <div style={{ padding: '80px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📝</div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>No Reports Yet</h3>
                <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
                  Start contributing to the security of Web3 by submitting your first vulnerability report.
                </p>
                <Button variant="primary" onClick={() => { window.location.href = '/'; }}>Browse Programs →</Button>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
