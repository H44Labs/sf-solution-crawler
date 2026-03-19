import React, { useMemo } from 'react';
import { FieldReviewItem } from '../components/FieldReviewItem';

interface FieldData {
  value: string;
  confidence: string;
  source: string;
  rawEvidence: string;
}

interface ReviewScreenProps {
  fields: Record<string, FieldData>;
  onApprove: () => void;
  onRecrawlSection: (section: string) => void;
  onCancel: () => void;
  onEditField: (fieldName: string, newValue: string) => void;
}

function getSectionFromFieldName(fieldName: string): string {
  // Split on first period or underscore group to derive a section label
  const parts = fieldName.split('.');
  if (parts.length > 1) return parts[0];
  const snakeParts = fieldName.split('_');
  if (snakeParts.length > 1) return snakeParts[0];
  return 'General';
}

export function ReviewScreen({
  fields,
  onApprove,
  onRecrawlSection,
  onCancel,
  onEditField,
}: ReviewScreenProps) {
  const { sections, confidenceSummary } = useMemo(() => {
    const sectionMap: Record<string, Array<{ name: string; data: FieldData }>> = {};
    const summary = { high: 0, medium: 0, low: 0 };

    for (const [name, data] of Object.entries(fields)) {
      const section = getSectionFromFieldName(name);
      if (!sectionMap[section]) sectionMap[section] = [];
      sectionMap[section].push({ name, data });

      const conf = data.confidence as 'high' | 'medium' | 'low';
      if (conf in summary) summary[conf]++;
    }

    return { sections: sectionMap, confidenceSummary: summary };
  }, [fields]);

  const totalFields = Object.keys(fields).length;

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
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
          Review Extracted Fields
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
          Verify and edit values before generating the document.
        </p>
      </div>

      {/* Confidence summary */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          padding: '12px 14px',
        }}
      >
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#86efac' }}>
            {confidenceSummary.high}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>High</div>
        </div>
        <div style={{ width: '1px', backgroundColor: '#334155' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fde68a' }}>
            {confidenceSummary.medium}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Medium</div>
        </div>
        <div style={{ width: '1px', backgroundColor: '#334155' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fca5a5' }}>
            {confidenceSummary.low}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Low</div>
        </div>
        <div style={{ width: '1px', backgroundColor: '#334155' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#e2e8f0' }}>
            {totalFields}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Total</div>
        </div>
      </div>

      {/* Sections */}
      {Object.entries(sections).map(([sectionName, sectionFields]) => (
        <div key={sectionName}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              {sectionName}
            </span>
            <button
              onClick={() => onRecrawlSection(sectionName)}
              style={{
                backgroundColor: 'transparent',
                color: '#60a5fa',
                border: '1px solid #60a5fa',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Re-crawl Section
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sectionFields.map(({ name, data }) => (
              <FieldReviewItem
                key={name}
                fieldName={name}
                value={data.value}
                confidence={data.confidence as 'high' | 'medium' | 'low'}
                source={data.source}
                rawEvidence={data.rawEvidence}
                onEdit={(newValue) => onEditField(name, newValue)}
              />
            ))}
          </div>
        </div>
      ))}

      {totalFields === 0 && (
        <div
          style={{
            textAlign: 'center',
            color: '#475569',
            fontSize: '13px',
            padding: '32px 0',
            fontStyle: 'italic',
          }}
        >
          No fields extracted yet.
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          borderTop: '1px solid #1e293b',
          paddingTop: '14px',
          marginTop: 'auto',
        }}
      >
        <button
          onClick={onCancel}
          style={{
            backgroundColor: 'transparent',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onApprove}
          style={{
            flex: 1,
            backgroundColor: '#22c55e',
            color: '#0f172a',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Approve &amp; Generate
        </button>
      </div>
    </div>
  );
}
