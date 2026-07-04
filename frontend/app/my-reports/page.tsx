'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useReadContract } from 'wagmi';
import { useAccount } from 'wagmi';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge';
import { useMyReports } from '@/hooks/useMyReports';
import { useReporterDecrypt } from '@/hooks/useReporterDecrypt';
import { CONTRACTS, BUG_BOUNTY_PROGRAM_ABI } from '@/lib/contracts';

const STATUS_LABELS = ['Pending', 'UnderReview', 'Approved', 'Rejected', 'Withdrawn'] as const;

// ── Copy button ──────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);
  return (
    <button
      onClick={copy}
      title="Copy"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: copied ? 'var(--cyan)' : 'var(--text-dim)',
        fontSize: '12px', padding: '2px 6px', borderRadius: '4px',
        transition: 'color 0.15s', flexShrink: 0,
      }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

// ── Single decrypted field ───────────────────────────────────────
function DecryptedField({ label, value, isCode = false, isLink = false }: {
  label: string; value: string; isCode?: boolean; isLink?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', padding: '10px 12px' }}>
        {isCode ? (
          <pre style={{ flex: 1, margin: 0, fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
            {value}
          </pre>
        ) : isLink ? (
          <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, fontSize: '13px', color: 'var(--cyan)', wordBreak: 'break-all', textDecoration: 'none' }}>
            {value}
          </a>
        ) : (
          <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)', wordBreak: 'break-all', lineHeight: 1.6 }}>
            {value}
          </span>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

// ── Decrypted report panel ───────────────────────────────────────
function DecryptedPanel({ report, onCollapse }: {
  report: { protocol: string; contractAddress: string; title: string; description: string; poc: string; gistLink: string; attachments: string };
  onCollapse: () => void;
}) {
  return (
    <div style={{
      margin: '0', padding: '24px 28px',
      background: 'linear-gradient(135deg, rgba(0,255,198,0.04) 0%, rgba(0,200,255,0.02) 100%)',
      borderBottom: '1px solid var(--border)',
      borderLeft: '3px solid var(--cyan)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(0,255,198,0.12)', border: '1px solid rgba(0,255,198,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>🔓</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.02em' }}>
              Decrypted Report
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
              End-to-end decrypted · visible only in this session
            </div>
          </div>
        </div>
        <button onClick={onCollapse} style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-dim)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ▲ Collapse
        </button>
      </div>

      {/* 2-col: Protocol + Contract */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <DecryptedField label="Protocol" value={report.protocol} />
        <DecryptedField label="Contract Address" value={report.contractAddress} isCode />
      </div>

      {/* Title */}
      <div style={{ marginBottom: '16px' }}>
        <DecryptedField label="Title" value={report.title} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: '16px' }}>
        <DecryptedField label="Description" value={report.description} />
      </div>

      {/* PoC — code block */}
      <div style={{ marginBottom: '16px' }}>
        <DecryptedField label="Proof of Concept" value={report.poc} isCode />
      </div>

      {/* Optional: Gist link */}
      {report.gistLink && (
        <div style={{ marginBottom: '16px' }}>
          <DecryptedField label="Gist / Reference Link" value={report.gistLink} isLink />
        </div>
      )}

      {/* Warning footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(255,200,0,0.05)', border: '1px solid rgba(255,200,0,0.15)', borderRadius: '8px', marginTop: '4px' }}>
        <span style={{ fontSize: '14px' }}>⚠️</span>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          This report is decrypted client-side only. Never share these contents outside secure channels.
        </span>
      </div>
    </div>
  );
}

// ── Per-row component ────────────────────────────────────────────
function ReportRow({ index, submissionId, router }: { index: number; submissionId: `0x${string}`; router: ReturnType<typeof useRouter> }) {
  const { address } = useAccount();
  const [expanded, setExpanded] = useState(false);

  const { decryptedReport, isDecrypting, error, decryptMyReport } = useReporterDecrypt(submissionId);

  const { data: meta } = useReadContract({
    address: CONTRACTS.BUG_BOUNTY_PROGRAM,
    abi: BUG_BOUNTY_PROGRAM_ABI,
    functionName: 'getSubmissionMeta',
    args: [submissionId],
    query: { enabled: true },
  });

  const statusIndex = meta ? Number((meta as [bigint, number, boolean, boolean])[1]) : 0;
  const status = STATUS_LABELS[statusIndex] ?? 'Pending';
  const submittedAt = meta ? Number((meta as [bigint, number, boolean, boolean])[0]) : 0;
  const dateStr = submittedAt ? new Date(submittedAt * 1000).toISOString().split('T')[0] : '—';
  const canWithdraw = status === 'Approved';

  const handleDecrypt = async () => {
    setExpanded(true);
    await decryptMyReport();
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 120px 140px 200px', gap: '16px', padding: '20px 24px', borderBottom: expanded ? 'none' : '1px solid var(--border)', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>#{index + 1}</div>
        <div>
          <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {submissionId.slice(0, 10)}...{submissionId.slice(-6)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>{dateStr}</div>
        </div>
        <div><SeverityBadge level={3} /></div>
        <div><StatusBadge status={status as 'Pending' | 'UnderReview' | 'Approved' | 'Rejected' | 'Withdrawn'} /></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: status === 'Approved' ? 'var(--cyan)' : 'var(--text-muted)' }}>
          {status === 'Approved' ? 'Claimable' : 'Pending'}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
          <Button
            variant="secondary"
            onClick={handleDecrypt}
            disabled={isDecrypting}
            style={{ fontSize: '12px', padding: '8px 12px' }}
          >
            {isDecrypting ? '⏳ Signing...' : expanded && decryptedReport ? '🔓 Re-decrypt' : '🔓 Sign & Decrypt'}
          </Button>
          {canWithdraw && (
            <Button variant="success" onClick={() => router.push(`/withdraw/${submissionId}`)} style={{ fontSize: '12px', padding: '8px 16px' }}>
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {expanded && error && (
        <div style={{ padding: '16px 24px', background: 'rgba(255,60,60,0.05)', borderLeft: '3px solid var(--red)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>❌</span>
          <span style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {expanded && isDecrypting && (
        <div style={{ padding: '24px', background: 'rgba(0,255,198,0.03)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '20px', height: '20px', border: '2px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Waiting for wallet signature…</span>
        </div>
      )}

      {/* Decrypted panel */}
      {expanded && decryptedReport && !isDecrypting && (
        <DecryptedPanel report={decryptedReport} onCollapse={() => setExpanded(false)} />
      )}
    </>
  );
}

export default function MyReportsPage() {
  const { submissionIds, isLoading } = useMyReports();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = {
    total: submissionIds.length,
    approved: 0,
    pending: submissionIds.length,
    rejected: 0,
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

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner">
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, color: 'var(--text)', marginBottom: '12px' }}>
              My Reports
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Track the status of your submitted vulnerability reports. Click <strong>Sign &amp; Decrypt</strong> on any report to view it using your wallet.
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

            {submissionIds.map((id, index) => (
              <ReportRow key={id} index={index} submissionId={id} router={router} />
            ))}

            {submissionIds.length === 0 && (
              <div style={{ padding: '80px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📝</div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>No Reports Yet</h3>
                <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
                  Start contributing to the security of Web3 by submitting your first vulnerability report.
                </p>
                <Button variant="primary" onClick={() => router.push('/')}>Browse Programs →</Button>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
