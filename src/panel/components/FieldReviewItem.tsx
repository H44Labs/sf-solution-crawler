import React, { useState } from 'react';

interface FieldReviewItemProps {
  fieldName: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  rawEvidence: string;
  onEdit: (newValue: string) => void;
}

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: '#14532d', text: '#86efac', border: '#16a34a' },
  medium: { bg: '#713f12', text: '#fde68a', border: '#d97706' },
  low: { bg: '#7f1d1d', text: '#fca5a5', border: '#dc2626' },
};

export function FieldReviewItem({
  fieldName,
  value,
  confidence,
  source,
  rawEvidence,
  onEdit,
}: FieldReviewItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const colors = CONFIDENCE_COLORS[confidence];
  const isExpandable = confidence === 'medium' || confidence === 'low';

  const handleSave = () => {
    onEdit(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        backgroundColor: '#0f172a',
        overflow: 'hidden',
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '10px 12px',
        }}
      >
        {/* Confidence badge */}
        <span
          data-testid={`confidence-badge-${confidence}`}
          style={{
            flexShrink: 0,
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            padding: '2px 7px',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginTop: '2px',
          }}
        >
          {confidence}
        </span>

        {/* Field info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '2px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {fieldName}
          </div>

          {editing ? (
            <div>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '5px 8px',
                  fontSize: '13px',
                  outline: 'none',
                  marginBottom: '6px',
                }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleSave}
                  style={{
                    backgroundColor: '#22c55e',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: '#e2e8f0',
                wordBreak: 'break-word',
                lineHeight: '1.4',
              }}
            >
              {value || <span style={{ color: '#475569', fontStyle: 'italic' }}>—</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        {!editing && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {isExpandable && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? 'Collapse' : 'Expand'}
                style={{
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {expanded ? '▲' : '▼'}
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit"
              style={{
                backgroundColor: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '3px 7px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Expanded evidence panel */}
      {expanded && (
        <div
          style={{
            borderTop: `1px solid #1e293b`,
            padding: '10px 12px',
            backgroundColor: '#0a0f1a',
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Source
            </span>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{source}</div>
          </div>
          <div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Raw Evidence
            </span>
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginTop: '2px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: '1.5',
              }}
            >
              {rawEvidence}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
