import React from 'react';

interface FieldSummary {
  total: number;
  filled: number;
  flagged: number;
}

interface DownloadScreenProps {
  documentBlob: Blob | null;
  fieldSummary: FieldSummary;
  onDownload: () => void;
  onRegenerate: () => void;
}

export function DownloadScreen({
  documentBlob,
  fieldSummary,
  onDownload,
  onRegenerate,
}: DownloadScreenProps) {
  const fillRate =
    fieldSummary.total > 0
      ? Math.round((fieldSummary.filled / fieldSummary.total) * 100)
      : 0;

  const isReady = documentBlob !== null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '16px',
        fontFamily: 'system-ui, sans-serif',
        color: '#e2e8f0',
        backgroundColor: '#0f172a',
        minHeight: '100%',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', paddingTop: '8px' }}>
        <div
          style={{
            fontSize: '40px',
            marginBottom: '8px',
          }}
        >
          {isReady ? '✓' : '⋯'}
        </div>
        <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
          {isReady ? 'Document Ready' : 'Generating Document…'}
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
          {isReady
            ? 'Your SF Solution document has been generated.'
            : 'Please wait while the document is being created.'}
        </p>
      </div>

      {/* Field Summary */}
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #334155',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: '14px',
          }}
        >
          Field Summary
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div
            style={{
              flex: 1,
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              padding: '12px',
              textAlign: 'center',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
              {fieldSummary.total}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Total Fields</div>
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              padding: '12px',
              textAlign: 'center',
              border: '1px solid #14532d',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#86efac' }}>
              {fieldSummary.filled}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Filled</div>
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              padding: '12px',
              textAlign: 'center',
              border: '1px solid #7f1d1d',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#fca5a5' }}>
              {fieldSummary.flagged}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Flagged</div>
          </div>
        </div>

        {/* Fill rate bar */}
        <div style={{ marginTop: '14px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '4px',
            }}
          >
            <span>Fill Rate</span>
            <span style={{ fontWeight: 600, color: fillRate >= 80 ? '#86efac' : '#fde68a' }}>
              {fillRate}%
            </span>
          </div>
          <div
            style={{
              height: '6px',
              backgroundColor: '#0f172a',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${fillRate}%`,
                backgroundColor: fillRate >= 80 ? '#22c55e' : '#f59e0b',
                borderRadius: '3px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Preview placeholder */}
      {isReady && (
        <div
          style={{
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            padding: '16px',
            border: '1px solid #334155',
            minHeight: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>📄</div>
            <div>DOCX document ready for download</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>
              {(documentBlob.size / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <button
          onClick={onDownload}
          disabled={!isReady}
          style={{
            backgroundColor: isReady ? '#3b82f6' : '#1e293b',
            color: isReady ? '#ffffff' : '#475569',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 0',
            fontSize: '14px',
            fontWeight: 700,
            cursor: isReady ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
          }}
        >
          Download Document
        </button>

        <button
          onClick={onRegenerate}
          style={{
            backgroundColor: 'transparent',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '9px 0',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Re-generate
        </button>
      </div>
    </div>
  );
}
