'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, TextArea } from '@/components/ui/Input';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { LoadingOverlay } from '@/components/ui/Loading';
import { useSubmitReport } from '@/hooks/useSubmitReport';

export default function SubmitReportPage() {
  const params = useParams();
  const router = useRouter();
  const programId = params.id as string;

  // All report fields matching test structure
  const [protocol, setProtocol] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [poc, setPoc] = useState('');
  const [gistLink, setGistLink] = useState('');
  const [attachments, setAttachments] = useState('');
  const [impactType, setImpactType] = useState<number>(1);
  const [severity, setSeverity] = useState<number>(2);
  const [showSecretsModal, setShowSecretsModal] = useState(false);

  const { submitReport, isEncrypting, isPending, isSuccess, secrets } = useSubmitReport();

  const impactTypes = [
    { value: 1, label: 'Smart Contract', desc: 'Contract logic vulnerabilities' },
    { value: 2, label: 'Frontend', desc: 'Web interface issues' },
    { value: 3, label: 'Backend', desc: 'Server-side vulnerabilities' },
    { value: 4, label: 'Infrastructure', desc: 'Network/deployment issues' },
  ];

  const severityLevels = [
    { value: 1, label: 'LOW', color: 'var(--green)', desc: 'Minor impact, low likelihood' },
    { value: 2, label: 'MEDIUM', color: 'var(--yellow)', desc: 'Moderate impact or likelihood' },
    { value: 3, label: 'HIGH', color: 'var(--orange)', desc: 'Significant impact, likely exploitable' },
    { value: 4, label: 'CRITICAL', color: 'var(--red)', desc: 'Severe impact, immediate threat' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await submitReport({
        protocol,
        contractAddress,
        title,
        description,
        poc,
        gistLink,
        attachments,
        impactType,
        severity,
      });
      
      setShowSecretsModal(true);
    } catch (error) {
      console.error('Failed to submit report:', error);
      alert('Failed to submit report. Please try again.');
    }
  };

  if (isSuccess && showSecretsModal && secrets) {
    return (
      <div>
        <Navbar />
        <section className="section" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
          <div className="section-inner" style={{ maxWidth: '640px', margin: '0 auto' }}>
            <Card style={{ padding: '40px' }}>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>✓</div>
                <h2 style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  marginBottom: '12px'
                }}>
                  Report Submitted!
                </h2>
                <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
                  Your report has been encrypted and submitted anonymously.
                </p>
              </div>

              <div style={{
                padding: '24px',
                background: 'var(--bg-elevated)',
                border: '3px solid var(--yellow)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '32px'
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--yellow)',
                  marginBottom: '16px'
                }}>
                  ⚠️ CRITICAL: SAVE THESE SECRETS
                </div>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  marginBottom: '20px',
                  lineHeight: 1.6
                }}>
                  These secrets are required to withdraw your bounty anonymously. 
                  We cannot recover them if lost. Save them securely NOW.
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    marginBottom: '8px'
                  }}>
                    SECRET 0 (ZK Withdrawal)
                  </div>
                  <code style={{
                    display: 'block',
                    padding: '12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--cyan)',
                    wordBreak: 'break-all'
                  }}>
                    {secrets.secret0.toString()}
                  </code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    marginBottom: '8px'
                  }}>
                    SECRET 1 (ZK Withdrawal)
                  </div>
                  <code style={{
                    display: 'block',
                    padding: '12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--cyan)',
                    wordBreak: 'break-all'
                  }}>
                    {secrets.secret1.toString()}
                  </code>
                </div>

                <div>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    marginBottom: '8px'
                  }}>
                    SYMMETRIC KEY (Report Decryption)
                  </div>
                  <code style={{
                    display: 'block',
                    padding: '12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--yellow)',
                    wordBreak: 'break-all'
                  }}>
                    {secrets.symmetricKey}
                  </code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    const text = `Secret 0 (ZK): ${secrets.secret0}\nSecret 1 (ZK): ${secrets.secret1}\nSymmetric Key: ${secrets.symmetricKey}`;
                    navigator.clipboard.writeText(text);
                    alert('All secrets copied to clipboard!');
                  }}
                  style={{ flex: 1 }}
                >
                  📋 Copy All Secrets
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => router.push('/my-reports')}
                  style={{ flex: 1 }}
                >
                  View My Reports →
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <Navbar />

      {(isEncrypting || isPending) && (
        <LoadingOverlay message={isEncrypting ? 'Encrypting report...' : 'Submitting to blockchain...'} />
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
              Submit Vulnerability Report
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              Your report will be encrypted using FHE and submitted with a zero-knowledge commitment. 
              Only the program admin can decrypt and review it.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              {/* Impact Type Selection */}
              <div style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '16px'
                }}>
                  Impact Type *
                </label>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {impactTypes.map((type) => (
                    <div
                      key={type.value}
                      onClick={() => setImpactType(type.value)}
                      style={{
                        padding: '16px',
                        border: impactType === type.value 
                          ? '2px solid var(--cyan)' 
                          : '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: impactType === type.value 
                          ? 'rgba(255,255,255,0.05)' 
                          : 'transparent'
                      }}
                    >
                      <div style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '4px'
                      }}>
                        {type.label}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)'
                      }}>
                        {type.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Severity Selection */}
              <div style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '16px'
                }}>
                  Severity Level *
                </label>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {severityLevels.map((level) => (
                    <div
                      key={level.value}
                      onClick={() => setSeverity(level.value)}
                      style={{
                        padding: '16px',
                        border: severity === level.value 
                          ? `2px solid ${level.color}` 
                          : '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: severity === level.value 
                          ? 'rgba(255,255,255,0.05)' 
                          : 'transparent'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px'
                      }}>
                        <span style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          color: 'var(--text)'
                        }}>
                          {level.label}
                        </span>
                        <SeverityBadge level={level.value as 1 | 2 | 3 | 4} />
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)'
                      }}>
                        {level.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Report Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <Input
                  label="Protocol Name *"
                  placeholder="e.g., Uniswap V3, Aave, Compound"
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  required
                />

                <Input
                  label="Contract Address *"
                  placeholder="0x..."
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  required
                  mono
                />

                <Input
                  label="Vulnerability Title *"
                  placeholder="e.g., Critical Reentrancy in SwapRouter"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />

                <TextArea
                  label="Description *"
                  placeholder="Detailed description of the vulnerability, its impact, and affected components..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={6}
                />

                <TextArea
                  label="Proof of Concept *"
                  placeholder="Step-by-step reproduction, exploit code, or transaction hash demonstrating the vulnerability..."
                  value={poc}
                  onChange={(e) => setPoc(e.target.value)}
                  required
                  rows={8}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />

                <Input
                  label="Gist/GitHub Link (optional)"
                  placeholder="https://gist.github.com/..."
                  value={gistLink}
                  onChange={(e) => setGistLink(e.target.value)}
                />

                <Input
                  label="Attachments (IPFS/Arweave) (optional)"
                  placeholder="ipfs://... or ar://..."
                  value={attachments}
                  onChange={(e) => setAttachments(e.target.value)}
                  mono
                />

                <div style={{
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  🔒 All fields will be encrypted with AES-256-GCM before submission. 
                  Only the program admin can decrypt them.
                </div>
              </div>
            </Card>

            {/* Privacy Notice */}
            <Card style={{ padding: '24px', marginBottom: '24px', borderLeft: '3px solid var(--cyan)' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--cyan)',
                marginBottom: '12px'
              }}>
                🔐 DUAL ENCRYPTION GUARANTEE
              </div>
              <ul style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                lineHeight: 1.7,
                paddingLeft: '20px'
              }}>
                <li>Text fields encrypted with <strong>AES-256-GCM</strong> (industry standard)</li>
                <li>Numeric fields encrypted with <strong>FHE</strong> (Fully Homomorphic Encryption)</li>
                <li>Symmetric key encrypted with admin's <strong>RSA-2048</strong> public key</li>
                <li>Zero-knowledge commitment proves ownership without revealing identity</li>
                <li>Your wallet address is NOT linked to the report on-chain</li>
                <li>Withdraw bounties to fresh addresses using ZK proofs</li>
              </ul>
            </Card>

            <Button 
              type="submit" 
              variant="primary" 
              disabled={!protocol || !contractAddress || !title || !description || !poc || isEncrypting || isPending}
              style={{ width: '100%', padding: '16px' }}
            >
              {isEncrypting ? 'Encrypting...' : isPending ? 'Submitting...' : '🚀 Submit Encrypted Report'}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
