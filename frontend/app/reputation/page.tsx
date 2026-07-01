'use client';

import { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/Loading';
import { useReputation } from '@/hooks/useReputation';

export default function ReputationPage() {
  const [hasDecrypted, setHasDecrypted] = useState(false);
  const { score, earnings, tier, isLoading, hasData, loadReputation } = useReputation();

  // Mock data for demonstration
  const mockScore = 1250;
  const mockEarnings = 125000; // in USDT cents
  const mockTier: number = 3;

  const tierInfo = [
    { level: 0, name: 'Unranked', threshold: 0, color: 'var(--text-dim)', benefits: ['Submit to basic programs'] },
    { level: 1, name: 'Bronze', threshold: 100, color: '#cd7f32', benefits: ['Access to Tier 1 programs', 'Basic priority support'] },
    { level: 2, name: 'Silver', threshold: 500, color: '#c0c0c0', benefits: ['Access to Tier 2 programs', 'Faster review times', 'Reputation boost'] },
    { level: 3, name: 'Gold', threshold: 1000, color: '#ffd700', benefits: ['Access to Tier 3 programs', 'Priority review', 'Higher bounty multipliers'] },
    { level: 4, name: 'Platinum', threshold: 2500, color: '#e5e4e2', benefits: ['Access to all programs', 'Instant priority', 'Max bounty multipliers', 'Exclusive programs'] },
  ];

  const currentTierInfo = tierInfo[mockTier];
  const nextTierInfo = tierInfo[mockTier + 1];
  const progress = nextTierInfo 
    ? ((mockScore - currentTierInfo.threshold) / (nextTierInfo.threshold - currentTierInfo.threshold)) * 100
    : 100;

  const handleDecrypt = async () => {
    setHasDecrypted(true);
    await loadReputation();
  };

  return (
    <div>
      <Navbar />

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: '12px'
            }}>
              My Reputation
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              Your reputation is encrypted on-chain using FHE. Only you can decrypt and view your exact score.
            </p>
          </div>

          <div className="grid-2" style={{ gap: '24px', marginBottom: '40px' }}>
            {/* Reputation Score Card */}
            <Card style={{ padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                marginBottom: '16px'
              }}>
                🏆 REPUTATION SCORE
              </div>

              {!hasDecrypted ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    marginBottom: '24px'
                  }}>
                    Your score is encrypted. Decrypt it to view.
                  </p>
                  <Button 
                    variant="primary"
                    onClick={handleDecrypt}
                    disabled={isLoading}
                  >
                    {isLoading ? <LoadingSpinner size={16} /> : '🔓 Decrypt Score'}
                  </Button>
                </div>
              ) : (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '72px',
                    fontWeight: 700,
                    color: currentTierInfo.color,
                    marginBottom: '16px',
                    textAlign: 'center'
                  }}>
                    {mockScore}
                  </div>
                  <div style={{
                    textAlign: 'center',
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    Current Score
                  </div>
                </div>
              )}
            </Card>

            {/* Total Earnings Card */}
            <Card style={{ padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                marginBottom: '16px'
              }}>
                💰 TOTAL EARNINGS
              </div>

              {!hasDecrypted ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)'
                  }}>
                    Decrypt your score to view earnings
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '52px',
                    fontWeight: 700,
                    color: 'var(--cyan)',
                    marginBottom: '16px',
                    textAlign: 'center'
                  }}>
                    ${(mockEarnings / 100).toLocaleString()}
                  </div>
                  <div style={{
                    textAlign: 'center',
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    Lifetime Bounties
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Current Tier */}
          <Card style={{ padding: '32px', marginBottom: '24px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              marginBottom: '20px'
            }}>
              CURRENT TIER
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px'
            }}>
              <div>
                <h3 style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: currentTierInfo.color,
                  marginBottom: '8px'
                }}>
                  {currentTierInfo.name}
                </h3>
                <div style={{
                  fontSize: '14px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)'
                }}>
                  Tier {mockTier}
                </div>
              </div>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                border: `4px solid ${currentTierInfo.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px'
              }}>
                {mockTier === 0 ? '?' : mockTier === 1 ? '🥉' : mockTier === 2 ? '🥈' : mockTier === 3 ? '🥇' : '💎'}
              </div>
            </div>

            {nextTierInfo && hasDecrypted && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Progress to {nextTierInfo.name}
                  </span>
                  <span style={{
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text)'
                  }}>
                    {mockScore} / {nextTierInfo.threshold}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '12px',
                  background: 'var(--bg-input)',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${currentTierInfo.color}, ${nextTierInfo.color})`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            )}
          </Card>

          {/* Benefits */}
          {hasDecrypted && (
            <Card style={{ padding: '32px', marginBottom: '24px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                marginBottom: '20px'
              }}>
                YOUR BENEFITS
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {currentTierInfo.benefits.map((benefit, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>✓</span>
                    <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* All Tiers */}
          <Card style={{ padding: '32px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              marginBottom: '24px'
            }}>
              ALL TIERS
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {tierInfo.slice(1).map((tierData) => (
                <div
                  key={tierData.level}
                  style={{
                    padding: '20px',
                    border: tierData.level === mockTier 
                      ? `2px solid ${tierData.color}` 
                      : '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: tierData.level === mockTier 
                      ? 'rgba(255,255,255,0.02)' 
                      : 'transparent'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h4 style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: tierData.color
                      }}>
                        {tierData.name}
                      </h4>
                      {tierData.level === mockTier && (
                        <Badge style={{ background: tierData.color, color: '#000' }}>
                          CURRENT
                        </Badge>
                      )}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)'
                    }}>
                      {tierData.threshold}+ points
                    </div>
                  </div>
                  <ul style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    paddingLeft: '20px',
                    lineHeight: 1.7
                  }}>
                    {tierData.benefits.map((benefit, idx) => (
                      <li key={idx}>{benefit}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          {/* Privacy Notice */}
          <Card style={{
            padding: '24px',
            marginTop: '24px',
            background: 'var(--bg-elevated)',
            borderLeft: '3px solid var(--cyan)'
          }}>
            <div style={{
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--cyan)',
              marginBottom: '12px'
            }}>
              🔐 FHE PRIVACY
            </div>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6
            }}>
              Your reputation score and earnings are encrypted on-chain using Fully Homomorphic Encryption (FHE). 
              Only you can decrypt them with your private key. Program admins and other users cannot see your exact scores.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
