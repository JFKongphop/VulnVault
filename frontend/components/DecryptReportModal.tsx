'use client';

import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface DecryptedReport {
  protocol: string;
  contractAddress: string;
  title: string;
  description: string;
  poc: string;
  gistLink: string;
  attachments: string;
}

interface DecryptReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDecrypt: (key: string) => Promise<void>;
  decryptedReport: DecryptedReport | null;
  isDecrypting: boolean;
  error: string | null;
  mode: 'admin' | 'reporter';
}

export function DecryptReportModal({
  isOpen,
  onClose,
  onDecrypt,
  decryptedReport,
  isDecrypting,
  error,
  mode,
}: DecryptReportModalProps) {
  const [secretKey, setSecretKey] = useState('');

  if (!isOpen) return null;

  const handleDecrypt = async () => {
    if (!secretKey.trim()) {
      alert(`Please enter your ${mode === 'admin' ? 'private RSA key' : 'symmetric key'}`);
      return;
    }
    await onDecrypt(secretKey);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
    }}>
      <Card style={{
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '32px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text)',
          }}>
            {decryptedReport ? 'Decrypted Report' : 'Decrypt Report'}
          </h2>
          <Button
            variant="secondary"
            onClick={onClose}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            Close
          </Button>
        </div>

        {!decryptedReport ? (
          <div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid var(--yellow)',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--yellow)',
                marginBottom: '8px',
              }}>
                🔐 SECURE DECRYPTION
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {mode === 'admin' 
                  ? 'Enter your admin RSA private key (hex format) to decrypt the report. Your key is processed locally and never transmitted.'
                  : 'Enter your backed-up symmetric key (from when you submitted the report) to decrypt and view your submission.'
                }
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
                {mode === 'admin' ? 'Admin Private Key (Hex)' : 'Symmetric Key (Hex)'}
              </label>
              <Input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={mode === 'admin' ? '3082...' : 'a1b2c3d4e5f6...'}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--red)',
                borderRadius: '8px',
                marginBottom: '20px',
              }}>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--red)',
                  fontWeight: 600,
                }}>
                  ❌ {error}
                </div>
              </div>
            )}

            <Button
              onClick={handleDecrypt}
              disabled={isDecrypting || !secretKey.trim()}
              style={{ width: '100%' }}
            >
              {isDecrypting ? '🔓 Decrypting...' : '🔓 Decrypt Report'}
            </Button>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid var(--green)',
              borderRadius: '8px',
              marginBottom: '24px',
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--green)',
              }}>
                ✅ Successfully Decrypted
              </div>
            </div>

            {/* Display decrypted fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  Protocol
                </div>
                <div style={{ fontSize: '15px', color: 'var(--text)' }}>
                  {decryptedReport.protocol}
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  Contract Address
                </div>
                <div style={{
                  fontSize: '15px',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {decryptedReport.contractAddress}
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  Title
                </div>
                <div style={{ fontSize: '17px', color: 'var(--text)', fontWeight: 600 }}>
                  {decryptedReport.title}
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  Description
                </div>
                <div style={{
                  fontSize: '14px',
                  color: 'var(--text)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {decryptedReport.description}
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
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
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}>
                    Gist Link
                  </div>
                  <a
                    href={decryptedReport.gistLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '14px',
                      color: 'var(--cyan)',
                      textDecoration: 'underline',
                    }}
                  >
                    {decryptedReport.gistLink}
                  </a>
                </div>
              )}

              {decryptedReport.attachments && (
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}>
                    Attachments
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {decryptedReport.attachments}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
