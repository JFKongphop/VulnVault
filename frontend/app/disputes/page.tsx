'use client';

import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Hash } from '@/components/ui/Hash';

export default function DisputesPage() {
  // Mock disputes data
  const disputes = [
    {
      id: 1,
      disputeId: 5,
      submissionId: 42,
      program: 'DeFi Protocol Alpha',
      programAddress: '0x1234567890123456789012345678901234567890',
      reason: 'Severity Assessment',
      status: 'Active',
      claimedSeverity: 4,
      reviewedSeverity: 2,
      votes: { approve: 2, reject: 1 },
      totalArbiters: 5,
      createdDate: '2026-06-25',
      deadline: '2026-07-05'
    },
    {
      id: 2,
      disputeId: 4,
      submissionId: 38,
      program: 'NFT Marketplace Beta',
      programAddress: '0x2345678901234567890123456789012345678901',
      reason: 'Bounty Amount',
      status: 'Resolved',
      claimedSeverity: 3,
      reviewedSeverity: 3,
      votes: { approve: 4, reject: 1 },
      totalArbiters: 5,
      createdDate: '2026-06-15',
      deadline: '2026-06-25',
      resolution: 'Approved - Bounty increased to $30,000'
    },
    {
      id: 3,
      disputeId: 3,
      submissionId: 35,
      program: 'Bridge Protocol Gamma',
      programAddress: '0x3456789012345678901234567890123456789012',
      reason: 'Rejection Justification',
      status: 'Voting',
      claimedSeverity: 3,
      reviewedSeverity: 0,
      votes: { approve: 1, reject: 0 },
      totalArbiters: 5,
      createdDate: '2026-06-20',
      deadline: '2026-06-30'
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'var(--yellow)';
      case 'Voting': return 'var(--cyan)';
      case 'Resolved': return 'var(--green)';
      default: return 'var(--text-muted)';
    }
  };

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
              Disputes
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              Community-governed dispute resolution for report reviews and bounty decisions.
            </p>
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '40px'
          }}>
            <Card style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '40px',
                fontWeight: 700,
                color: 'var(--yellow)',
                marginBottom: '8px'
              }}>
                {disputes.filter(d => d.status === 'Active' || d.status === 'Voting').length}
              </div>
              <div style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                Active Disputes
              </div>
            </Card>

            <Card style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '40px',
                fontWeight: 700,
                color: 'var(--green)',
                marginBottom: '8px'
              }}>
                {disputes.filter(d => d.status === 'Resolved').length}
              </div>
              <div style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                Resolved
              </div>
            </Card>

            <Card style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '40px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '8px'
              }}>
                {disputes.length}
              </div>
              <div style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                Total Disputes
              </div>
            </Card>
          </div>

          {/* Disputes Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {disputes.map((dispute) => (
              <Card key={dispute.id} style={{ padding: '32px' }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '24px',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h3 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: 'var(--text)'
                      }}>
                        Dispute #{dispute.disputeId}
                      </h3>
                      <Badge style={{
                        background: getStatusColor(dispute.status),
                        color: dispute.status === 'Active' || dispute.status === 'Voting' ? '#000' : '#fff'
                      }}>
                        {dispute.status}
                      </Badge>
                    </div>
                    <div style={{
                      fontSize: '15px',
                      color: 'var(--text-muted)',
                      marginBottom: '8px'
                    }}>
                      {dispute.program} - Report #{dispute.submissionId}
                    </div>
                    <Hash value={dispute.programAddress} />
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                      marginBottom: '4px'
                    }}>
                      DEADLINE
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: 'var(--text)'
                    }}>
                      {dispute.deadline}
                    </div>
                  </div>
                </div>

                {/* Dispute Details */}
                <div style={{
                  padding: '20px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '24px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}>
                        Reason
                      </div>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--text)'
                      }}>
                        {dispute.reason}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}>
                        Claimed Severity
                      </div>
                      <SeverityBadge level={dispute.claimedSeverity as 1 | 2 | 3 | 4} />
                    </div>

                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}>
                        Reviewed Severity
                      </div>
                      {dispute.reviewedSeverity > 0 ? (
                        <SeverityBadge level={dispute.reviewedSeverity as 1 | 2 | 3 | 4} />
                      ) : (
                        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Rejected</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Voting Progress */}
                {dispute.status !== 'Resolved' && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px'
                    }}>
                      <span style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}>
                        Voting Progress
                      </span>
                      <span style={{
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text)'
                      }}>
                        {dispute.votes.approve + dispute.votes.reject} / {dispute.totalArbiters} votes
                      </span>
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '8px'
                    }}>
                      <div style={{
                        flex: dispute.votes.approve,
                        height: '12px',
                        background: 'var(--green)',
                        borderRadius: '6px'
                      }} />
                      <div style={{
                        flex: dispute.votes.reject,
                        height: '12px',
                        background: 'var(--red)',
                        borderRadius: '6px'
                      }} />
                      <div style={{
                        flex: dispute.totalArbiters - dispute.votes.approve - dispute.votes.reject,
                        height: '12px',
                        background: 'var(--border)',
                        borderRadius: '6px'
                      }} />
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <span style={{ color: 'var(--green)' }}>
                        ✓ Approve: {dispute.votes.approve}
                      </span>
                      <span style={{ color: 'var(--red)' }}>
                        ✗ Reject: {dispute.votes.reject}
                      </span>
                    </div>
                  </div>
                )}

                {/* Resolution (for resolved disputes) */}
                {dispute.status === 'Resolved' && dispute.resolution && (
                  <div style={{
                    padding: '16px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--green)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '24px'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--green)',
                      marginBottom: '8px'
                    }}>
                      ✓ RESOLUTION
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: 'var(--text)'
                    }}>
                      {dispute.resolution}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Button variant="primary">
                    View Details
                  </Button>
                  {dispute.status === 'Voting' && (
                    <>
                      <Button variant="success">
                        Vote Approve
                      </Button>
                      <Button variant="danger">
                        Vote Reject
                      </Button>
                    </>
                  )}
                  {dispute.status === 'Active' && (
                    <Button variant="secondary">
                      Add Evidence
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {disputes.length === 0 && (
            <Card style={{ padding: '80px 40px', textAlign: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>⚖️</div>
              <h3 style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '12px'
              }}>
                No Disputes Yet
              </h3>
              <p style={{
                fontSize: '15px',
                color: 'var(--text-muted)',
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                Disputes will appear here when reporters challenge review decisions.
              </p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
