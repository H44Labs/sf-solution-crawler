import React, { useState } from 'react';

interface QACardProps {
  question: string;
  context: string;
  onAnswer: (answer: string) => void;
}

export function QACard({ question, context, onAnswer }: QACardProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    onAnswer(trimmed);
    setAnswer('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#1e293b',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            backgroundColor: '#f59e0b',
            color: '#0f172a',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Question
        </span>
      </div>

      <p
        style={{
          margin: '0 0 8px 0',
          fontSize: '13px',
          fontWeight: 600,
          color: '#f1f5f9',
          lineHeight: '1.5',
        }}
      >
        {question}
      </p>

      {context && (
        <p
          style={{
            margin: '0 0 12px 0',
            fontSize: '12px',
            color: '#94a3b8',
            lineHeight: '1.4',
            fontStyle: 'italic',
          }}
        >
          {context}
        </p>
      )}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer… (Ctrl+Enter to submit)"
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '13px',
          fontFamily: 'system-ui, sans-serif',
          resize: 'vertical',
          outline: 'none',
          marginBottom: '10px',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!answer.trim()}
        style={{
          backgroundColor: answer.trim() ? '#f59e0b' : '#334155',
          color: answer.trim() ? '#0f172a' : '#64748b',
          border: 'none',
          borderRadius: '6px',
          padding: '7px 16px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: answer.trim() ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.2s',
        }}
      >
        Submit Answer
      </button>
    </div>
  );
}
