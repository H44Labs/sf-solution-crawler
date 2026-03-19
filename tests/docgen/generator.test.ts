import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { generateDocument } from '../../src/docgen/generator';
import type { GeneratorInput, FieldMapEntry } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFieldEntry(value: string): FieldMapEntry {
  return {
    value,
    confidence: 'high',
    source: 'test',
    rawEvidence: '',
    reviewerVerdict: 'accepted',
    arbiterDecision: 'accepted',
  };
}

/** Build a minimal valid .docx ArrayBuffer with the given document.xml body XML. */
function createTestDocx(bodyXml: string): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  return zip.generate({ type: 'arraybuffer' });
}

/** Read document.xml text from an ArrayBuffer result. */
function getDocumentXml(buffer: ArrayBuffer): string {
  const zip = new PizZip(buffer);
  return zip.file('word/document.xml')!.asText();
}

/** Build a minimal GeneratorInput with defaults. */
function makeInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    fieldMap: {},
    conditionalSections: {
      deploymentType: 'new_business',
      includeWFM: false,
      includeEEM: false,
      includePerformanceManagement: false,
    },
    acdEnvironments: [],
    smartSyncIntegrations: [],
    seName: 'Jane Doe',
    opportunityName: 'ACME Corp',
    generationDate: '2026-03-19',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Simple field replacement
// ---------------------------------------------------------------------------

describe('generateDocument — field replacement', () => {
  it('replaces a bracketed field with the value from fieldMap', () => {
    const bodyXml = `<w:p><w:r><w:t>[Licensed Agents]</w:t></w:r></w:p>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({
      fieldMap: { 'Licensed Agents': makeFieldEntry('250') },
    });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('250');
    expect(xml).not.toContain('[Licensed Agents]');
  });

  it('replaces multiple distinct fields', () => {
    const bodyXml = `<w:p><w:r><w:t>[Customer Name] has [Licensed Agents] agents</w:t></w:r></w:p>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({
      fieldMap: {
        'Customer Name': makeFieldEntry('ACME'),
        'Licensed Agents': makeFieldEntry('100'),
      },
    });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('ACME');
    expect(xml).toContain('100');
  });
});

// ---------------------------------------------------------------------------
// 2. Missing fields replaced with [NEEDS INPUT]
// ---------------------------------------------------------------------------

describe('generateDocument — missing field fallback', () => {
  it('substitutes [NEEDS INPUT] when a field has no fieldMap entry', () => {
    const bodyXml = `<w:p><w:r><w:t>[Opportunity Name]</w:t></w:r></w:p>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({ fieldMap: {} });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('NEEDS INPUT');
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. Conditional section removal
// ---------------------------------------------------------------------------

describe('generateDocument — conditional sections', () => {
  const newBizSection = `<w:p><w:r><w:t>[[If it's a New Business opportunity]]</w:t></w:r></w:p>
<w:p><w:r><w:t>New Business Only Content</w:t></w:r></w:p>`;

  const migrationSection = `<w:p><w:r><w:t>[[If it's a migration]]</w:t></w:r></w:p>
<w:p><w:r><w:t>Migration Only Content</w:t></w:r></w:p>`;

  it('keeps New Business section and removes Migration section when deploymentType is new_business', () => {
    const bodyXml = newBizSection + migrationSection;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({
      conditionalSections: {
        deploymentType: 'new_business',
        includeWFM: false,
        includeEEM: false,
        includePerformanceManagement: false,
      },
    });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('New Business Only Content');
    expect(xml).not.toContain('Migration Only Content');
  });

  it('keeps Migration section and removes New Business section when deploymentType is migration', () => {
    const bodyXml = newBizSection + migrationSection;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({
      conditionalSections: {
        deploymentType: 'migration',
        includeWFM: false,
        includeEEM: false,
        includePerformanceManagement: false,
      },
    });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).not.toContain('New Business Only Content');
    expect(xml).toContain('Migration Only Content');
  });
});

// ---------------------------------------------------------------------------
// 5. NOTE-REMOVE block stripping
// ---------------------------------------------------------------------------

describe('generateDocument — NOTE-REMOVE stripping', () => {
  it('removes NOTE paragraph and subsequent list-item paragraphs', () => {
    // Using w:numPr to mark list items
    const listItemPara = `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item to remove</w:t></w:r></w:p>`;
    const bodyXml =
      `<w:p><w:r><w:t>NOTE - REMOVE PRIOR TO PUBLISHING this guidance</w:t></w:r></w:p>` +
      listItemPara +
      `<w:p><w:r><w:t>Normal paragraph after note</w:t></w:r></w:p>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput();

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).not.toContain('NOTE - REMOVE PRIOR TO PUBLISHING');
    expect(xml).not.toContain('List item to remove');
    expect(xml).toContain('Normal paragraph after note');
  });

  it('removes NOTE with em-dash variant', () => {
    const bodyXml = `<w:p><w:r><w:t>NOTE – REMOVE PRIOR TO PUBLISHING</w:t></w:r></w:p>
<w:p><w:r><w:t>Content after note block</w:t></w:r></w:p>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput();

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).not.toContain('NOTE');
    expect(xml).toContain('Content after note block');
  });
});

// ---------------------------------------------------------------------------
// 6. Revision history table
// ---------------------------------------------------------------------------

describe('generateDocument — revision history', () => {
  it('adds a revision history row with SE name and generation date', () => {
    // Table with one data row (first table = revision history)
    const bodyXml = `<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>Version</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Author</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Date</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Notes</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({
      seName: 'Jane Doe',
      generationDate: '2026-03-19',
    });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('1.0');
    expect(xml).toContain('Jane Doe');
    // Date formatted as MM/DD/YYYY
    expect(xml).toContain('03/19/2026');
  });

  it('includes SF Solution Crawler attribution in the author cell', () => {
    const bodyXml = `<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>Version</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>`;
    const buffer = createTestDocx(bodyXml);
    const input = makeInput({ seName: 'Bob Smith' });

    const result = generateDocument({ templateBuffer: buffer, input });
    const xml = getDocumentXml(result);

    expect(xml).toContain('SF Solution Crawler');
    expect(xml).toContain('Bob Smith');
  });
});

// ---------------------------------------------------------------------------
// 7. Returns valid ArrayBuffer / docx
// ---------------------------------------------------------------------------

describe('generateDocument — output format', () => {
  it('returns an ArrayBuffer', () => {
    const buffer = createTestDocx(`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const result = generateDocument({ templateBuffer: buffer, input: makeInput() });

    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('returned buffer is a valid PizZip archive', () => {
    const buffer = createTestDocx(`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const result = generateDocument({ templateBuffer: buffer, input: makeInput() });

    expect(() => {
      const zip = new PizZip(result);
      zip.file('word/document.xml')!.asText();
    }).not.toThrow();
  });

  it('contains a word/document.xml file', () => {
    const buffer = createTestDocx(`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const result = generateDocument({ templateBuffer: buffer, input: makeInput() });

    const zip = new PizZip(result);
    expect(zip.file('word/document.xml')).not.toBeNull();
  });
});
