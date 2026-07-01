'use client';

import { useState } from 'react';

interface HashProps {
  value: string;
  short?: boolean;
  copyable?: boolean;
}

export function Hash({ value, short = true, copyable = true }: HashProps) {
  const [copied, setCopied] = useState(false);
  
  const display = short 
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
  
  const handleCopy = async () => {
    if (!copyable) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <code 
      className="hash" 
      onClick={handleCopy}
      title={copyable ? (copied ? 'Copied!' : 'Click to copy') : value}
      style={{ cursor: copyable ? 'pointer' : 'default' }}
    >
      {copied ? '✓ Copied' : display}
    </code>
  );
}
