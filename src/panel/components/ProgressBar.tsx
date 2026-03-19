import React from 'react';

interface ProgressBarProps {
  found: number;
  total: number;
}

export function ProgressBar({ found, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, (found / total) * 100) : 0;

  const getColor = () => {
    if (pct >= 80) return '#22c55e';
    if (pct >= 40) return '#f59e0b';
    return '#3b82f6';
  };

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '6px',
          fontSize: '12px',
          color: '#64748b',
        }}
      >
        <span>Fields Found</span>
        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
          {found} / {total}
        </span>
      </div>
      <div
        style={{
          height: '8px',
          backgroundColor: '#1e293b',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: getColor(),
            borderRadius: '4px',
            transition: 'width 0.4s ease, background-color 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          marginTop: '4px',
          fontSize: '11px',
          color: '#475569',
          textAlign: 'right',
        }}
      >
        {pct.toFixed(0)}% complete
      </div>
    </div>
  );
}
