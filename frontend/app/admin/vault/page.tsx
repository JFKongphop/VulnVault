'use client';

import { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Hash } from '@/components/ui/Hash';
import { LoadingOverlay } from '@/components/ui/Loading';

export default function VaultManagementPage() {
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock vault data
  const vaultData = {
    address: '0x9876543210987654321098765432109876543210',
    availableBalance: 375000, // USDT (in cents)
    lockedBalance: 125000,
    totalBalance: 500000,
    pendingWithdrawal: 0,
    timelockDuration: '7 days',
    lastDeposit: '2026-06-20',
    adminAddress: '0x1234567890123456789012345678901234567890'
  };

  const transactions = [
    {
      id: 1,
      type: 'Deposit',
      amount: 50000,
      from: '0x1234567890123456789012345678901234567890',
      date: '2026-06-20',
      txHash: '0xabcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234'
    },
    {
      id: 2,
      type: 'Lock',
      amount: 25000,
      reason: 'Report #42 Approved',
      date: '2026-06-18',
      txHash: '0xefgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678'
    },
    {
      id: 3,
      type: 'Withdrawal',
      amount: 10000,
      reason: 'Anonymous Claim',
      date: '2026-06-15',
      txHash: '0xijkl9012345678ijkl9012345678ijkl9012345678ijkl9012345678ijkl9012'
    },
    {
      id: 4,
      type: 'Deposit',
      amount: 100000,
      from: '0x1234567890123456789012345678901234567890',
      date: '2026-06-10',
      txHash: '0xmnop3456789012mnop3456789012mnop3456789012mnop3456789012mnop3456'
    },
  ];

  const lockedFunds = [
    { id: 1, reportId: 42, amount: 50000, date: '2026-06-20', status: 'Locked' },
    { id: 2, reportId: 40, amount: 25000, date: '2026-06-18', status: 'Locked' },
    { id: 3, reportId: 38, amount: 30000, date: '2026-06-15', status: 'Locked' },
    { id: 4, reportId: 35, amount: 20000, date: '2026-06-12', status: 'Locked' },
  ];

  const handleDeposit = () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      alert(`Deposited $${depositAmount} to vault!`);
      setDepositAmount('');
      setIsProcessing(false);
    }, 2000);
  };

  const handleInitiateWithdrawal = () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (parseFloat(withdrawAmount) * 100 > vaultData.availableBalance) {
      alert('Insufficient available balance');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      alert(`Withdrawal initiated. Funds will be available after ${vaultData.timelockDuration} timelock.`);
      setWithdrawAmount('');
      setIsProcessing(false);
    }, 2000);
  };

  return (
    <div>
      <Navbar />

      {isProcessing && <LoadingOverlay message="Processing transaction..." />}

      <section className="section" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        <div className="section-inner">
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
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 800,
                color: 'var(--text)'
              }}>
                Vault Management
              </h1>
            </div>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              marginBottom: '8px'
            }}>
              Manage bounty vault funds with anti-rug timelock protection.
            </p>
            <Hash value={vaultData.address} />
          </div>

          {/* Balance Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginBottom: '40px'
          }}>
            <Card style={{ padding: '28px' }}>
              <div style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                TOTAL BALANCE
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '44px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '8px'
              }}>
                ${(vaultData.totalBalance / 100).toLocaleString()}
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)'
              }}>
                Available + Locked
              </div>
            </Card>

            <Card style={{ padding: '28px' }}>
              <div style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                AVAILABLE
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '44px',
                fontWeight: 700,
                color: 'var(--cyan)',
                marginBottom: '8px'
              }}>
                ${(vaultData.availableBalance / 100).toLocaleString()}
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)'
              }}>
                Ready for approvals
              </div>
            </Card>

            <Card style={{ padding: '28px' }}>
              <div style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                LOCKED
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '44px',
                fontWeight: 700,
                color: 'var(--yellow)',
                marginBottom: '8px'
              }}>
                ${(vaultData.lockedBalance / 100).toLocaleString()}
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)'
              }}>
                {lockedFunds.length} reports
              </div>
            </Card>
          </div>

          <div className="grid-2" style={{ gap: '24px', marginBottom: '40px' }}>
            {/* Deposit Card */}
            <Card style={{ padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                marginBottom: '20px'
              }}>
                💰 DEPOSIT FUNDS
              </div>

              <div style={{ marginBottom: '24px' }}>
                <Input
                  label="Amount (USDT)"
                  placeholder="Enter amount to deposit..."
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  type="number"
                  mono
                />
                <div style={{
                  marginTop: '12px',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  Funds will be available immediately for report approvals
                </div>
              </div>

              <Button
                variant="success"
                onClick={handleDeposit}
                disabled={!depositAmount}
                style={{ width: '100%', padding: '16px' }}
              >
                Deposit to Vault
              </Button>
            </Card>

            {/* Withdraw Card */}
            <Card style={{ padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                marginBottom: '20px'
              }}>
                🔒 WITHDRAW FUNDS
              </div>

              <div style={{ marginBottom: '24px' }}>
                <Input
                  label="Amount (USDT)"
                  placeholder="Enter amount to withdraw..."
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  type="number"
                  mono
                />
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--yellow)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--yellow)',
                    marginBottom: '6px'
                  }}>
                    ⏱️ TIMELOCK: {vaultData.timelockDuration}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5
                  }}>
                    Withdrawal requires {vaultData.timelockDuration} waiting period for security
                  </div>
                </div>
              </div>

              <Button
                variant="danger"
                onClick={handleInitiateWithdrawal}
                disabled={!withdrawAmount}
                style={{ width: '100%', padding: '16px' }}
              >
                Initiate Withdrawal
              </Button>
            </Card>
          </div>

          {/* Locked Funds Table */}
          <Card style={{ padding: 0, overflow: 'hidden', marginBottom: '32px' }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)'
            }}>
              LOCKED FUNDS BY REPORT
            </div>

            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 180px 120px',
              gap: '16px',
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              letterSpacing: '0.1em'
            }}>
              <div>Report ID</div>
              <div>Amount</div>
              <div>Locked Date</div>
              <div>Status</div>
            </div>

            {/* Table Rows */}
            {lockedFunds.map((fund) => (
              <div
                key={fund.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 180px 120px',
                  gap: '16px',
                  padding: '16px 24px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center'
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text)'
                }}>
                  #{fund.reportId}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--yellow)'
                }}>
                  ${(fund.amount / 100).toLocaleString()}
                </div>
                <div style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)'
                }}>
                  {fund.date}
                </div>
                <div>
                  <span style={{
                    padding: '4px 12px',
                    background: 'rgba(255, 210, 10, 0.1)',
                    border: '1px solid var(--yellow)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: 'var(--yellow)'
                  }}>
                    {fund.status}
                  </span>
                </div>
              </div>
            ))}
          </Card>

          {/* Transaction History */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)'
            }}>
              TRANSACTION HISTORY
            </div>

            {transactions.map((tx) => (
              <div
                key={tx.id}
                style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '4px'
                    }}>
                      {tx.type}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      marginBottom: '8px'
                    }}>
                      {tx.reason || (tx.from && `From: ${tx.from.slice(0, 10)}...`)}
                    </div>
                    <Hash value={tx.txHash} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '20px',
                      fontWeight: 700,
                      color: tx.type === 'Deposit' ? 'var(--green)' : tx.type === 'Withdrawal' ? 'var(--red)' : 'var(--yellow)',
                      marginBottom: '4px'
                    }}>
                      {tx.type === 'Deposit' ? '+' : '-'}${(tx.amount / 100).toLocaleString()}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)'
                    }}>
                      {tx.date}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </section>
    </div>
  );
}
