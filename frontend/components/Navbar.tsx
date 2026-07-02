'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from './ui/Button';
import { Hash } from './ui/Hash';

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navLink = (href: string, label: string) => {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        style={{
          color: isActive ? 'var(--text)' : 'var(--text-muted)',
          transition: 'color 0.2s',
          textDecoration: 'none',
          fontWeight: isActive ? 600 : 500,
          borderBottom: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
          paddingBottom: '2px',
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'var(--bg-surface)',
      backdropFilter: 'blur(18px)',
      borderBottom: '1px solid var(--border)',
      padding: '16px 24px'
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Logo */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '15px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: 'var(--cyan)',
          cursor: 'pointer'
        }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            VULNVAULT
          </Link>
        </div>

        {/* Navigation Links */}
        <div style={{
          display: 'flex',
          gap: '32px',
          alignItems: 'center',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
        }}>
          {navLink('/', 'Programs')}
          {navLink('/my-reports', 'My Reports')}
          {navLink('/reputation', 'Reputation')}
          {navLink('/wrap', 'Get cUSDT')}
        </div>

        {/* Connect Wallet */}
        <div>
          {!mounted ? (
            <Button variant="primary" disabled>Connect Wallet</Button>
          ) : isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Hash value={address || ''} short />
              <Button onClick={() => disconnect()} variant="secondary">
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={() => connect({ connector: connectors[0] })} variant="primary">
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
