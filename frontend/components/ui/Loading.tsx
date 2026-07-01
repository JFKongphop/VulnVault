export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div 
      style={{
        width: size,
        height: size,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--cyan)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block'
      }} 
    />
  );
}

export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      zIndex: 9999
    }}>
      <LoadingSpinner size={48} />
      <div style={{ 
        color: 'var(--text-muted)', 
        fontFamily: 'var(--font-mono)',
        fontSize: '14px'
      }}>
        {message}
      </div>
    </div>
  );
}
