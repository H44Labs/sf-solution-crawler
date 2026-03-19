import React from 'react';
import { ActivityLog } from '../components/ActivityLog';
import { ProgressBar } from '../components/ProgressBar';
import { QACard } from '../components/QACard';

interface CrawlScreenProps {
  events: string[];
  fieldsFound: number;
  fieldsTotal: number;
  pendingQuestion: { question: string; context: string } | null;
  tokenUsage: { total: number; budget: number };
  onAnswer: (answer: string) => void;
  onPause: () => void;
  onCancel: () => void;
}

export function CrawlScreen({
  events,
  fieldsFound,
  fieldsTotal,
  pendingQuestion,
  tokenUsage,
  onAnswer,
  onPause,
  onCancel,
}: CrawlScreenProps) {
  const tokenPct =
    tokenUsage.budget > 0
      ? Math.min(100, (tokenUsage.total / tokenUsage.budget) * 100)
      : 0;

  const tokenColor = tokenPct >= 80 ? '#ef4444' : tokenPct >= 60 ? '#f59e0b' : '#22c55e';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px',
        fontFamily: 'system-ui, sans-serif',
        color: '#e2e8f0',
        backgroundColor: '#0f172a',
        minHeight: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
            Crawling in Progress
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
            Analyzing Salesforce opportunity data…
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: pendingQuestion ? '#f59e0b' : '#22c55e',
              display: 'inline-block',
              boxShadow: pendingQuestion
                ? '0 0 6px #f59e0b'
                : '0 0 6px #22c55e',
            }}
          />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {pendingQuestion ? 'Awaiting Answer' : 'Active'}
          </span>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar found={fieldsFound} total={fieldsTotal} />

      {/* Token Usage */}
      <div style={{ fontSize: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '4px',
            color: '#64748b',
          }}
        >
          <span>Token Usage</span>
          <span style={{ color: tokenColor, fontWeight: 600 }}>
            {tokenUsage.total.toLocaleString()} / {tokenUsage.budget.toLocaleString()}
          </span>
        </div>
        <div
          style={{
            height: '4px',
            backgroundColor: '#1e293b',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${tokenPct}%`,
              backgroundColor: tokenColor,
              borderRadius: '2px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Pending Question */}
      {pendingQuestion && (
        <QACard
          question={pendingQuestion.question}
          context={pendingQuestion.context}
          onAnswer={onAnswer}
        />
      )}

      {/* Activity Log */}
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: '6px',
          }}
        >
          Activity Log
        </div>
        <ActivityLog events={events} />
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          borderTop: '1px solid #1e293b',
          paddingTop: '14px',
        }}
      >
        <button
          onClick={onPause}
          style={{
            flex: 1,
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Pause
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            color: '#ef4444',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
