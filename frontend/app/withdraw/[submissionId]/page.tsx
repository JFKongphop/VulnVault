'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner, LoadingOverlay } from '@/components/ui/Loading';
import { Hash } from '@/components/ui/Hash';
import { SeverityBadge } from '@/components/ui/Badge';
import { useWithdraw } from '@/hooks/useWithdraw';

export default function WithdrawPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;

  const [step, setStep] = useState(1);
  const [secret0, setSecret0] = useState('');
  const [secret1, setSecret1] = useState('');
  const [impactType, setImpactType] = useState('1');
  const [severity, setSeverity] = useState('2');
  const [recipientAddress, setRecipientAddress] = useState('');

  // programId for this submission — in production, fetch from contract
  const programId = BigInt(0);
  const { withdraw, isGeneratingProof, isPending, isSuccess, currentRoot } = useWithdraw(programId);

  // Mock submission data
  const submission = {
    id: submissionId,
    program: 'DeFi Protocol Alpha',
    programAddress: '0x1234567890123456789012345678901234567890',
    severity: 4,
    bountyAmount: '$50,000',
    approvedDate: '2026-06-20'
  };

  const handleGenerateProof = async () => {
    if (!secret0 || !secret1 || !recipientAddress) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await withdraw({
        secret0: BigInt(secret0),
        secret1: BigInt(secret1),
        impactType: parseInt(impactType),
        severity: parseInt(severity),
        recipient: recipientAddress as `0x${string}`,
      });
    } catch (error) {
      console.error('Withdrawal failed:', error);
      alert('Withdrawal failed. Please verify your secrets and try again.');
    }
  };

  if (isSuccess) {
    return (
      <div>
        <Navbar />
        <section className="section" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
          <div className="section-inner" style={{ maxWidth: '640px', margin: '0 auto' }}>
            <Card style={{ padding: '40px' }}>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
                <h2 style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  marginBottom: '12px'
                }}>
                  Withdrawal Complete!
                </h2>
                <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
                  Your bounty has been transferred anonymously using zero-knowledge proofs.
                </p>
              </div>

              <Card style={{ padding: '24px', marginBottom: '32px', background: 'var(--bg-elevated)' }}>
                <div style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-dim)',
                  marginBottom: '8px'
                }}>
                  AMOUNT
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '40px',
                  fontWeight: 700,
                  color: 'var(--cyan)',
                  marginBottom: '16px'
                }}>
                  {submission.bountyAmount}
                </div>
                <div style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-dim)',
                  marginBottom: '8px'
                }}>
                  RECIPIENT
                </div>
                <Hash value={recipientAddress} short={false} />
              </Card>

              <div style={{
                padding: '20px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '24px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--cyan)',
                  marginBottom: '12px'
                }}>
                  ✓ Zero-Knowledge Privacy Guaranteed
                </div>
                <ul style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                  paddingLeft: '20px'
                }}>
                  <li>Your submission wallet is not linked to the withdrawal</li>
                  <li>Nullifier prevents double-spending</li>
                  <li>All proof verification happened on-chain</li>
                </ul>
              </div>

              <Button 
                variant="primary"
                onClick={() => router.push('/my-reports')}
                style={{ width: '100%' }}
              >
                Back to My Reports
              </Button>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <Navbar />

      {(isGeneratingProof || isPending) && (
        <LoadingOverlay 
          message={isGeneratingProof ? 'Generating ZK proof...' : 'Submitting withdrawal...'} 
        />
      )}

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{
              fontSize: 'clamp(32px, 5vw, 40px)',
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: '12px'
            }}>
              Anonymous Withdrawal
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              Withdraw your bounty anonymously using zero-knowledge proofs. No link between your submission and withdrawal addresses.
            </p>
          </div>

          {/* Submission Info */}
          <Card style={{ padding: '24px', marginBottom: '32px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              marginBottom: '16px'
            }}>
              SUBMISSION DETAILS
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Program</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  {submission.program}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Severity</span>
                <SeverityBadge level={submission.severity as 1 | 2 | 3 | 4} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Bounty Amount</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--cyan)'
                }}>
                  {submission.bountyAmount}
                </span>
              </div>
            </div>
          </Card>

          {/* Step Indicator */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '32px'
          }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  width: step >= s ? '40px' : '12px',
                  height: '12px',
                  borderRadius: '6px',
                  background: step >= s ? 'var(--cyan)' : 'var(--border)',
                  transition: 'all 0.3s'
                }}
              />
            ))}
          </div>

          {/* Step 1: Secrets Input */}
          {step === 1 && (
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '20px'
              }}>
                Step 1: Enter Your Secrets
              </h3>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
                lineHeight: 1.6
              }}>
                Enter the secrets you saved when submitting this report. These are required to prove ownership without revealing your identity.
              </p>

              <div style={{ marginBottom: '20px' }}>
                <Input
                  label="Secret 0"
                  placeholder="Enter your first secret..."
                  value={secret0}
                  onChange={(e) => setSecret0(e.target.value)}
                  mono
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Input
                  label="Secret 1"
                  placeholder="Enter your second secret..."
                  value={secret1}
                  onChange={(e) => setSecret1(e.target.value)}
                  mono
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Input
                  label="Impact Type"
                  type="number"
                  placeholder="1-4"
                  value={impactType}
                  onChange={(e) => setImpactType(e.target.value)}
                  min="1"
                  max="4"
                  required
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <Input
                  label="Severity"
                  type="number"
                  placeholder="1-4"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  min="1"
                  max="4"
                  required
                />
              </div>

              <Button
                variant="primary"
                onClick={() => setStep(2)}
                disabled={!secret0 || !secret1}
                style={{ width: '100%' }}
              >
                Continue →
              </Button>
            </Card>
          )}

          {/* Step 2: Fresh Address */}
          {step === 2 && (
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '20px'
              }}>
                Step 2: Fresh Withdrawal Address
              </h3>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
                lineHeight: 1.6
              }}>
                Enter a fresh address to receive your bounty. For maximum privacy, use a new address that has never been used before.
              </p>

              <div style={{
                padding: '20px',
                background: 'var(--bg-elevated)',
                border: '2px solid var(--yellow)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '24px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--yellow)',
                  marginBottom: '8px'
                }}>
                  ⚠️ PRIVACY TIP
                </div>
                <p style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.6
                }}>
                  For best anonymity, generate a completely new wallet address that has never been used. 
                  Don't reuse addresses from your submission wallet or other activities.
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <Input
                  label="Recipient Address"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  mono
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                  variant="secondary"
                  onClick={() => setStep(1)}
                  style={{ flex: 1 }}
                >
                  ← Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep(3)}
                  disabled={!recipientAddress}
                  style={{ flex: 1 }}
                >
                  Continue →
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: Review & Withdraw */}
          {step === 3 && (
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '20px'
              }}>
                Step 3: Review & Withdraw
              </h3>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
                lineHeight: 1.6
              }}>
                Review your withdrawal details. A zero-knowledge proof will be generated to verify ownership without revealing your identity.
              </p>

              <Card style={{ padding: '20px', background: 'var(--bg-elevated)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Amount</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: 'var(--cyan)'
                    }}>
                      {submission.bountyAmount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Recipient</span>
                    <Hash value={recipientAddress} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Merkle Root</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: 'var(--cyan-dim)'
                    }}>
                      {currentRoot ? `${currentRoot.toString().slice(0, 10)}...` : 'Loading...'}
                    </span>
                  </div>
                </div>
              </Card>

              <div style={{
                padding: '20px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '24px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--cyan)',
                  marginBottom: '12px'
                }}>
                  🔐 Privacy Features
                </div>
                <ul style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                  paddingLeft: '20px'
                }}>
                  <li>Zero-knowledge proof proves you own the commitment</li>
                  <li>Nullifier prevents double-spending</li>
                  <li>No on-chain link between submission and withdrawal</li>
                  <li>Withdrawal address is completely private</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                  variant="secondary"
                  onClick={() => setStep(2)}
                  disabled={isGeneratingProof || isPending}
                  style={{ flex: 1 }}
                >
                  ← Back
                </Button>
                <Button
                  variant="success"
                  onClick={handleGenerateProof}
                  disabled={isGeneratingProof || isPending}
                  style={{ flex: 1 }}
                >
                  {isGeneratingProof ? 'Generating Proof...' : isPending ? 'Withdrawing...' : '💰 Withdraw'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
