interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'critical' | 'high' | 'medium' | 'low';
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'default', className = '', style }: BadgeProps) {
  const variantStyles = {
    default: {},
    critical: { background: 'var(--red)', color: '#fff' },
    high: { background: 'var(--orange)', color: '#fff' },
    medium: { background: 'var(--yellow)', color: '#000' },
    low: { background: 'var(--green)', color: '#000' },
  };

  return (
    <span 
      className={`badge ${className}`}
      style={{ ...variantStyles[variant], ...style }}
    >
      {children}
    </span>
  );
}

// Severity badge component
export function SeverityBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const variants = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' } as const;
  const labels = { 1: 'LOW', 2: 'MEDIUM', 3: 'HIGH', 4: 'CRITICAL' };
  
  return <Badge variant={variants[level]}>{labels[level]}</Badge>;
}

// Status badge component
export function StatusBadge({ status }: { status: 'Pending' | 'UnderReview' | 'Approved' | 'Rejected' | 'Withdrawn' }) {
  const config = {
    Pending: { icon: '⏳', color: 'var(--text-muted)' },
    UnderReview: { icon: '👁️', color: 'var(--blue)' },
    Approved: { icon: '✓', color: 'var(--green)' },
    Rejected: { icon: '✗', color: 'var(--red)' },
    Withdrawn: { icon: '📥', color: 'var(--cyan)' }
  }[status];
  
  return (
    <Badge style={{ borderColor: config.color, color: config.color, background: 'transparent', border: '1px solid' }}>
      {config.icon} {status.replace(/([A-Z])/g, ' $1').trim()}
    </Badge>
  );
}
