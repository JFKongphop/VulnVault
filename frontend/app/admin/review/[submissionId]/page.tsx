'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Hash } from '@/components/ui/Hash';
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge';
import { LoadingOverlay } from '@/components/ui/Loading';
import { DecryptReportModal } from '@/components/DecryptReportModal';
import { useAdminDecrypt } from '@/hooks/useAdminDecrypt';
import { useReviewReport } from '@/hooks/useReviewReport';

export default function AdminReviewPage() {
  const params = useParams();
  const submissionId = params.submissionId as `0x${string}`;

  const [showDecryptModal, setShowDecryptModal] = useState(false);
  const [bountyAmount, setBountyAmount] = useState('');
  const [finalSeverity, setFinalSeverity] = useState<number>(3);
  const [notes, setNotes] = useState('');

  const {
    decryptedReport,
    isLoading: isLoadingData,
    isDecrypting,
    error: decryptError,
    decryptReport,
  } = useAdminDecrypt(submissionId);

  const {
    reviewReport,
    approveReport,
    rejectReport,
    isPending: isReviewPending,
    isSuccess: isReviewSuccess,
  } = useReviewReport();

  // Mock submission data (would fetch from contract)
  const submission = {
    id: submissionId,
    submitter: 'Anonymous', // Encrypted
    commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    severity: 4,
    impactType: 'SmartContract',
    submittedDate: '2026-06-29',
    status: 'Pending' as const,
  };

  const handleDecryptWithKey = async (adminPrivateKey: string) => {
    await decryptReport(adminPrivateKey);
  };

  const handleMarkUnderReview = async () => {
    try {
      await reviewReport(submissionId);
    } catch (err) {
      console.error('Failed to mark as under review:', err);
      alert('Failed to mark as under review');
    }
  };

  const handleApprove = async () => {
    if (!bountyAmount) {
      alert('Please enter bounty amount');
      return;
    }
    if (!decryptedReport) {
      alert('Please decrypt the report first');
      return;
    }
    
    try {
      const amountInWei = BigInt(Math.floor(parseFloat(bountyAmount) * 1e6)); // Assuming 6 decimals for USDT
      await approveReport(submissionId, amountInWei, finalSeverity, notes);
    } catch (err) {
      console.error('Failed to approve report:', err);
      alert('Failed to approve report');
    }
  };

  const handleReject = async () => {
    if (!confirm('Are you sure you want to reject this report?')) return;
    
    try {
      await rejectReport(submissionId);
    } catch (err) {
      console.error('Failed to reject report:', err);
      alert('Failed to reject report');
    }
  };

  if (isReviewSuccess) {
    setTimeout(() => {
      window.location.href = '/admin';
    }, 2000);
  }

  return (
    <div>
      <Navbar />

      {(isReviewPending || isLoadingData) && <LoadingOverlay message="Processing..." />}

      <DecryptReportModal
        isOpen={showDecryptModal}
        onClose={() => setShowDecryptModal(false)}
        onDecrypt={handleDecryptWithKey}
        decryptedReport={decryptedReport}
        isDecrypting={isDecrypting}
        error={decryptError}
        mode="admin"
      />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <Button 
                variant="secondary"
                onClick={() => window.location.href = '/admin'}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                ← Back
              </Button>
              <h1 style={{
                fontSize: 'clamp(28px, 4vw, 40px)',
                fontWeight: 800,
                color: 'var(--text)'
              }}>
                Review Report #{submissionId.slice(0, 8)}...
              </h1>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={submission.status} />
              <SeverityBadge level={submission.severity as 1 | 2 | 3 | 4} />
              <span style={{
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)'
              }}>
                Submitted: {submission.submittedDate}
              </span>
            </div>
          </div>

          <div className="grid-2" style={{ gap: '24px' }}>
            {/* Left Column - Report Details */}
            <div>
              {/* Metadata Card */}
              <Card style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  marginBottom: '20px'
                }}>
                  SUBMISSION METADATA
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '4px'
                    }}>
                      Commitment Hash
                    </div>
                    <Hash value={submission.commitment} short={false} />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '4px'
                    }}>
                      Impact Type
                    </div>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text)'
                    }}>
                      {submission.impactType}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '4px'
                    }}>
                      Submitter (Anonymous)
                    </div>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--cyan)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {submission.submitter}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Encrypted Report Card */}
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
                  VULNERABILITY REPORT
                </div>

                {!decryptedReport ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</div>
                    <p style={{
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                      marginBottom: '24px'
                    }}>
                      Report is encrypted with AES-256-GCM + RSA-OAEP. Use your admin private key to decrypt.
                    </p>
                    <Button 
                      variant="primary"
                      onClick={() => setShowDecryptModal(true)}
                    >
                      🔓 Decrypt Report
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid var(--green)',
                      borderRadius: '8px',
                      marginBottom: '20px',
                    }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--green)',
                      }}>
                        ✅ Report Decrypted
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Protocol
                        </div>
                        <div style={{ fontSize: '15px', color: 'var(--text)' }}>
                          {decryptedReport.protocol}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Contract Address
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                          {decryptedReport.contractAddress}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Title
                        </div>
                        <div style={{ fontSize: '17px', color: 'var(--text)', fontWeight: 600 }}>
                          {decryptedReport.title}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Description
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {decryptedReport.description}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Proof of Concept
                        </div>
                        <div style={{
                          fontSize: '13px',
                          color: 'var(--text)',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'var(--font-mono)',
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                        }}>
                          {decryptedReport.poc}
                        </div>
                      </div>
                      {decryptedReport.gistLink && (
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Gist Link
                          </div>
                          <a href={decryptedReport.gistLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--cyan)', textDecoration: 'underline' }}>
                            {decryptedReport.gistLink}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Right Column - Actions */}
            <div>
              {/* Decision Card */}
              <Card style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  marginBottom: '20px'
                }}>
                  REVIEW DECISION
                </div>

                {decryptedReport ? (
                  <>
                    <div style={{ marginBottom: '20px' }}>
                      <Input
                        label="Bounty Amount (USDT)"
                        placeholder="Enter amount..."
                        value={bountyAmount}
                        onChange={(e) => setBountyAmount(e.target.value)}
                        type="number"
                        mono
                      />
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        Funds will be locked in vault for this amount
                      </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Final Severity
                      </label>
                      <select
                        value={finalSeverity}
                        onChange={(e) => setFinalSeverity(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text)',
                          fontSize: '14px',
                        }}
                      >
                        <option value={1}>Low</option>
                        <option value={2}>Medium</option>
                        <option value={3}>High</option>
                        <option value={4}>Critical</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Admin Notes (Optional)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal notes about this review..."
                        rows={4}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text)',
                          fontSize: '14px',
                          fontFamily: 'var(--font-sans)',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <Button 
                        variant="success"
                        onClick={handleApprove}
                        style={{ width: '100%', padding: '16px' }}
                        disabled={!bountyAmount || isReviewPending}
                      >
                        ✓ Approve & Lock Funds
                      </Button>
                      <Button 
                        variant="danger"
                        onClick={handleReject}
                        style={{ width: '100%', padding: '16px' }}
                        disabled={isReviewPending}
                      >
                        ❌ Reject Report
                      </Button>
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}>
                    Decrypt the report first to review and make a decision
                  </div>
                )}
              </Card>

              {/* Quick Actions */}
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
                  QUICK ACTIONS
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Button 
                    variant="secondary"
                    onClick={handleMarkUnderReview}
                    style={{ width: '100%', padding: '12px' }}
                    disabled={isReviewPending}
                  >
                    👀 Mark as Under Review
                  </Button>

                  <Button 
                    variant="secondary"
                    onClick={() => window.location.href = '/disputes'}
                    style={{ width: '100%', padding: '12px' }}
                  >
                    🔀 Escalate to Dispute
                  </Button>

                  <Button 
                    variant="secondary"
                    onClick={() => alert('Export feature coming soon')}
                    style={{ width: '100%', padding: '12px' }}
                  >
                    📄 Export Report
                  </Button>
                </div>
              </Card>

              {/* Security Info */}
              <Card style={{ padding: '20px', backgroundColor: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--yellow)',
                  marginBottom: '8px'
                }}>
                  🔐 ENCRYPTION INFO
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  This report is encrypted with AES-256-GCM + RSA-OAEP. Only you (the admin) can decrypt using your private key. All decryption happens locally in your browser.
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
