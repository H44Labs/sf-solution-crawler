import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import {
  normalizeField,
  extractFieldsFromText,
  buildFieldRegistry,
  parseTemplate,
} from '../../src/docgen/template-parser';

// ---------------------------------------------------------------------------
// Helpers for building minimal .docx buffers in tests
// ---------------------------------------------------------------------------

function buildMinimalDocx(bodyXml: string): ArrayBuffer {
  const zip = new PizZip();
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${bodyXml}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  // Minimal [Content_Types].xml required by some parsers
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  const buffer = zip.generate({ type: 'arraybuffer' });
  return buffer;
}

// ---------------------------------------------------------------------------
// normalizeField
// ---------------------------------------------------------------------------

describe('normalizeField', () => {
  it('trims trailing space inside brackets', () => {
    expect(normalizeField('[Licensed Agents ]')).toBe('[Licensed Agents]');
  });

  it('fixes missing opening bracket when field ends with ]', () => {
    expect(normalizeField('Disaster Recovery ]')).toBe('[Disaster Recovery]');
  });

  it('fixes missing opening bracket for word directly before ]', () => {
    expect(normalizeField('GDPR Compliance]')).toBe('[GDPR Compliance]');
  });

  it('leaves a well-formed field unchanged', () => {
    expect(normalizeField('[Normal Field]')).toBe('[Normal Field]');
  });

  it('trims both leading and trailing spaces inside brackets', () => {
    expect(normalizeField('[ Spaced Field ]')).toBe('[Spaced Field]');
  });

  it('fixes missing closing bracket', () => {
    expect(normalizeField('[Missing Close')).toBe('[Missing Close]');
  });

  it('trims leading/trailing whitespace on the raw string before inspecting brackets', () => {
    expect(normalizeField('  [Trim Me]  ')).toBe('[Trim Me]');
  });
});

// ---------------------------------------------------------------------------
// extractFieldsFromText
// ---------------------------------------------------------------------------

describe('extractFieldsFromText', () => {
  it('extracts two well-formed fields from text', () => {
    const result = extractFieldsFromText('Start [Field A] middle [Field B] end');
    expect(result).toContain('[Field A]');
    expect(result).toContain('[Field B]');
  });

  it('extracts a field that has a trailing space before the closing bracket', () => {
    const result = extractFieldsFromText('Value is [Licensed Agents ]');
    expect(result).toContain('[Licensed Agents ]');
  });

  it('returns an empty array when there are no brackets in the text', () => {
    const result = extractFieldsFromText('No brackets here at all');
    expect(result).toHaveLength(0);
  });

  it('handles text with only one field', () => {
    const result = extractFieldsFromText('[Solo Field]');
    expect(result).toEqual(['[Solo Field]']);
  });

  it('does not extract double-bracketed conditional markers as plain fields', () => {
    // [[If ...]] should NOT appear in the plain field list (it uses double brackets)
    const result = extractFieldsFromText('[[If it is new business]]');
    // Double-bracketed content won't match single-bracket regex — confirm it's absent
    expect(result).not.toContain('[[If it is new business]]');
  });
});

// ---------------------------------------------------------------------------
// buildFieldRegistry
// ---------------------------------------------------------------------------

describe('buildFieldRegistry', () => {
  it('deduplicates identical fields', () => {
    const result = buildFieldRegistry(['[A]', '[A]', '[B]']);
    expect(result).toEqual(['[A]', '[B]']);
  });

  it('normalizes during deduplication so trimmed variants collapse', () => {
    const result = buildFieldRegistry(['[A ]', '[A]']);
    expect(result).toEqual(['[A]']);
  });

  it('returns an empty array for empty input', () => {
    expect(buildFieldRegistry([])).toEqual([]);
  });

  it('normalizes and deduplicates mixed-space variants', () => {
    const result = buildFieldRegistry(['[ B ]', '[B]', '[B ]']);
    expect(result).toEqual(['[B]']);
  });
});

// ---------------------------------------------------------------------------
// parseTemplate (integration — minimal .docx built in-test)
// ---------------------------------------------------------------------------

describe('parseTemplate', () => {
  it('extracts bracketed fields from a minimal .docx buffer', () => {
    const buffer = buildMinimalDocx('[Customer Name] and [Licensed Agents]');
    const analysis = parseTemplate(buffer);
    expect(analysis.fields).toContain('[Customer Name]');
    expect(analysis.fields).toContain('[Licensed Agents]');
  });

  it('deduplicates repeated fields', () => {
    const buffer = buildMinimalDocx('[Repeat Field] some text [Repeat Field]');
    const analysis = parseTemplate(buffer);
    const count = analysis.fields.filter(f => f === '[Repeat Field]').length;
    expect(count).toBe(1);
  });

  it('returns rawFields with all (possibly duplicate) occurrences', () => {
    const buffer = buildMinimalDocx('[Alpha] [Beta] [Alpha]');
    const analysis = parseTemplate(buffer);
    expect(analysis.rawFields.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty fields array when document has no bracketed content', () => {
    const buffer = buildMinimalDocx('No fields here at all');
    const analysis = parseTemplate(buffer);
    expect(analysis.fields).toHaveLength(0);
  });

  it('extracts conditional markers with [[...]] double-bracket syntax', () => {
    const buffer = buildMinimalDocx("[[If it's a New Business opportunity]] some text");
    const analysis = parseTemplate(buffer);
    expect(analysis.conditionalMarkers.length).toBeGreaterThanOrEqual(1);
    expect(analysis.conditionalMarkers[0].type).toBe('new_business');
  });

  it('extracts migration conditional markers', () => {
    const buffer = buildMinimalDocx('[[If migration]] complete the following');
    const analysis = parseTemplate(buffer);
    const migrationMarkers = analysis.conditionalMarkers.filter(m => m.type === 'migration');
    expect(migrationMarkers.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts NOTE blocks', () => {
    const buffer = buildMinimalDocx('NOTE – REMOVE PRIOR TO PUBLISHING some guidance here');
    const analysis = parseTemplate(buffer);
    expect(analysis.noteBlocks.length).toBeGreaterThanOrEqual(1);
  });
});
