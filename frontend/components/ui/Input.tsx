interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  mono?: boolean;
}

export function Input({ label, error, mono, className = '', ...props }: InputProps) {
  const monoClass = mono ? 'input-mono' : '';
  
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label style={{ 
          display: 'block', 
          fontSize: '13px', 
          fontWeight: 600, 
          color: 'var(--text-muted)',
          marginBottom: '8px',
          fontFamily: 'var(--font-sans)'
        }}>
          {label}
        </label>
      )}
      <input 
        className={`input ${monoClass} ${className}`}
        {...props}
      />
      {error && (
        <div style={{ 
          fontSize: '12px', 
          color: 'var(--red)', 
          marginTop: '4px',
          fontFamily: 'var(--font-sans)'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, className = '', ...props }: TextAreaProps) {
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label style={{ 
          display: 'block', 
          fontSize: '13px', 
          fontWeight: 600, 
          color: 'var(--text-muted)',
          marginBottom: '8px',
          fontFamily: 'var(--font-sans)'
        }}>
          {label}
        </label>
      )}
      <textarea 
        className={`textarea ${className}`}
        {...props}
      />
      {error && (
        <div style={{ 
          fontSize: '12px', 
          color: 'var(--red)', 
          marginTop: '4px',
          fontFamily: 'var(--font-sans)'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
