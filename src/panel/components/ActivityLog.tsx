import React, { useEffect, useRef } from 'react';

interface ActivityLogProps {
  events: string[];
}

export function ActivityLog({ events }: ActivityLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div
      style={{
        height: '180px',
        overflowY: 'auto',
        backgroundColor: '#0f172a',
        borderRadius: '6px',
        padding: '10px 12px',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#94a3b8',
        border: '1px solid #1e293b',
      }}
    >
      {events.length === 0 ? (
        <div style={{ color: '#475569', fontStyle: 'italic' }}>Waiting for activity…</div>
      ) : (
        events.map((event, i) => (
          <div
            key={i}
            style={{
              paddingBottom: '4px',
              lineHeight: '1.5',
              borderBottom: i < events.length - 1 ? '1px solid #1e293b' : 'none',
              marginBottom: i < events.length - 1 ? '4px' : 0,
            }}
          >
            <span style={{ color: '#64748b', marginRight: '6px' }}>{`[${i + 1}]`}</span>
            {event}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
