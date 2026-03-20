import React, { useEffect, useRef } from 'react';

interface ActivityLogProps {
  events: string[];
}

function getEventColor(event: string): string {
  if (event.includes('[ERROR]') || event.includes('[FATAL')) return '#ef4444';
  if (event.includes('[WARN]')) return '#f59e0b';
  if (event.includes('[COMPLETE]')) return '#22c55e';
  if (event.includes('[Scraper]')) return '#38bdf8';
  if (event.includes('[Navigator]')) return '#a78bfa';
  if (event.includes('[Engine/')) return '#fb923c';
  return '#94a3b8';
}

export function ActivityLog({ events }: ActivityLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: '200px',
        maxHeight: '400px',
        overflowY: 'auto',
        backgroundColor: '#020617',
        borderRadius: '6px',
        padding: '10px 12px',
        fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
        fontSize: '11px',
        color: '#94a3b8',
        border: '1px solid #1e293b',
        lineHeight: '1.6',
      }}
    >
      {events.length === 0 ? (
        <div style={{ color: '#475569', fontStyle: 'italic' }}>
          Waiting for activity...
        </div>
      ) : (
        events.map((event, i) => (
          <div
            key={i}
            style={{
              padding: '2px 0',
              color: getEventColor(event),
              wordBreak: 'break-word',
            }}
          >
            {event}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
