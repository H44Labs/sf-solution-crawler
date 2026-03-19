import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { GeneratorInput } from '../types';

export interface GenerateOptions {
  templateBuffer: ArrayBuffer;
  input: GeneratorInput;
}

// ---------------------------------------------------------------------------
// Helpers — XML paragraph utilities
// ---------------------------------------------------------------------------

/**
 * Split a document.xml string into an array of "tokens" that are either
 * complete <w:p>...</w:p> paragraphs, complete <w:tbl>...</w:tbl> tables,
 * or any other text between those block-level elements.
 *
 * We do a simple scan so we don't need a full XML parser.
 */
function splitIntoBlocks(xml: string): string[] {
  const blocks: string[] = [];
  let pos = 0;

  while (pos < xml.length) {
    // Look for the next <w:p or <w:tbl opening tag
    const pStart = xml.indexOf('<w:p', pos);
    const tblStart = xml.indexOf('<w:tbl', pos);

    let nextTag: string;
    let nextPos: number;

    if (pStart === -1 && tblStart === -1) {
      // No more block-level elements — push the rest
      blocks.push(xml.slice(pos));
      break;
    } else if (pStart === -1) {
      nextTag = 'w:tbl';
      nextPos = tblStart;
    } else if (tblStart === -1) {
      nextTag = 'w:p';
      nextPos = pStart;
    } else {
      if (pStart <= tblStart) {
        nextTag = 'w:p';
        nextPos = pStart;
      } else {
        nextTag = 'w:tbl';
        nextPos = tblStart;
      }
    }

    // Push anything before this block as a raw chunk
    if (nextPos > pos) {
      blocks.push(xml.slice(pos, nextPos));
    }

    // Find the matching closing tag
    const closeTag = `</${nextTag}>`;
    const closePos = xml.indexOf(closeTag, nextPos);
    if (closePos === -1) {
      // Malformed — push remainder
      blocks.push(xml.slice(nextPos));
      break;
    }

    const end = closePos + closeTag.length;
    blocks.push(xml.slice(nextPos, end));
    pos = end;
  }

  return blocks;
}

/** Extract plain text from a single XML block (strips tags). */
function extractText(xmlBlock: string): string {
  return xmlBlock
    .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, '$1 ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/** Return true if the paragraph block is a list item (has w:numPr). */
function isListParagraph(block: string): boolean {
  return block.startsWith('<w:p') && /<w:numPr/.test(block);
}

/** Return true if the paragraph block is a heading (has w:pStyle with Heading). */
function isHeading(block: string): boolean {
  return block.startsWith('<w:p') && /<w:pStyle[^/]*w:val="Heading/i.test(block);
}

// ---------------------------------------------------------------------------
// Pre-processing: normalize malformed brackets
// ---------------------------------------------------------------------------

/**
 * Fix cases where Word splits a bracketed field across multiple <w:t> runs,
 * or where brackets are encoded as XML entities.
 * We do a very targeted pass on the raw XML text content.
 */
function normalizeBrackets(xml: string): string {
  // Decode any XML-entity-encoded brackets
  return xml.replace(/&#x5B;/gi, '[').replace(/&#x5D;/gi, ']');
}

// ---------------------------------------------------------------------------
// Pre-processing: remove conditional sections
// ---------------------------------------------------------------------------

/**
 * Remove paragraphs belonging to the section that should NOT be included.
 *
 * Strategy:
 *   - Find the marker paragraph for the section to REMOVE.
 *   - Delete that paragraph and everything until (but not including) the next
 *     marker paragraph of the OTHER type, or a heading, or end of body.
 */
function removeConditionalSection(
  blocks: string[],
  markerToRemove: 'new_business' | 'migration',
): string[] {
  const newBizPattern = /\[\[If it'?s? a New Business/i;
  const migrationPattern = /\[\[If it'?s? a migration/i;

  const markerPattern =
    markerToRemove === 'new_business' ? newBizPattern : migrationPattern;
  const otherPattern =
    markerToRemove === 'new_business' ? migrationPattern : newBizPattern;

  const result: string[] = [];
  let inRemovedSection = false;

  for (const block of blocks) {
    const text = extractText(block);

    if (!inRemovedSection) {
      if (markerPattern.test(text)) {
        // Start of section to remove — skip this paragraph
        inRemovedSection = true;
        continue;
      }
      result.push(block);
    } else {
      // We're inside the section being removed
      // Stop removing when we hit the other marker or a heading
      if (otherPattern.test(text) || isHeading(block)) {
        inRemovedSection = false;
        result.push(block);
      }
      // else: skip this block
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pre-processing: strip NOTE-REMOVE blocks
// ---------------------------------------------------------------------------

const NOTE_PATTERN = /NOTE\s*[–\-]\s*REMOVE PRIOR TO PUBLISHING/i;

function stripNoteBlocks(blocks: string[]): string[] {
  const result: string[] = [];
  let inNoteBlock = false;

  for (const block of blocks) {
    const text = extractText(block);

    if (!inNoteBlock) {
      if (NOTE_PATTERN.test(text)) {
        inNoteBlock = true;
        // Skip the NOTE paragraph itself
        continue;
      }
      result.push(block);
    } else {
      // Continue removing list items; stop at heading or non-list paragraph
      if (block.startsWith('<w:p') && !isListParagraph(block)) {
        // Non-list paragraph — stop stripping, include this block
        inNoteBlock = false;
        result.push(block);
      } else if (!block.startsWith('<w:p')) {
        // Tables or other non-paragraph elements — stop stripping
        inNoteBlock = false;
        result.push(block);
      }
      // Else it's a list paragraph — skip it
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strip remaining [[...]] double-bracket markers from XML
// ---------------------------------------------------------------------------

/**
 * Remove any paragraphs that contain a [[...]] conditional marker (double brackets).
 * These markers are processed before docxtemplater runs, so by this point they
 * should be gone. Any remaining ones (in the kept section) just need the
 * marker text removed so docxtemplater doesn't see duplicate `[` delimiters.
 *
 * We remove the entire paragraph so the document doesn't have a blank line
 * left behind.
 */
function stripDoubleBracketMarkers(xml: string): string {
  // Remove entire <w:p>...</w:p> paragraphs that contain [[...]]
  // We need to handle the case where the [[ marker is spread across runs
  // (unlikely in tests, but possible in real docs).
  // Simple approach: remove paragraphs whose plain text contains [[
  const bodyMatch = xml.match(/(<w:body>)([\s\S]*)(<\/w:body>)/);
  if (!bodyMatch) return xml;

  const prefix = xml.slice(0, xml.indexOf(bodyMatch[0])) + bodyMatch[1];
  const suffix = bodyMatch[3] + xml.slice(xml.indexOf(bodyMatch[0]) + bodyMatch[0].length);

  const blocks = splitIntoBlocks(bodyMatch[2]);
  const filtered = blocks.filter(block => {
    const text = extractText(block);
    return !/\[\[/.test(text);
  });

  return prefix + filtered.join('') + suffix;
}

// ---------------------------------------------------------------------------
// Build data object for docxtemplater from fieldMap
// ---------------------------------------------------------------------------

function buildDataObject(input: GeneratorInput): Record<string, string> {
  const data: Record<string, string> = {};

  // We don't know ahead of time which fields are in the template,
  // so we populate all known fields from the fieldMap.
  for (const [key, entry] of Object.entries(input.fieldMap)) {
    data[key] = entry.value || '[NEEDS INPUT]';
  }

  return data;
}

// ---------------------------------------------------------------------------
// Revision history table
// ---------------------------------------------------------------------------

/** Format an ISO date string (YYYY-MM-DD) as MM/DD/YYYY. */
function formatDate(isoDate: string): string {
  // isoDate can be "2026-03-19" or a full ISO timestamp
  const dateOnly = isoDate.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

/**
 * Build a minimal <w:tr> XML string for the revision history row.
 */
function buildRevisionRow(input: GeneratorInput): string {
  const version = '1.0';
  const author = `${input.seName} / SF Solution Crawler (AI-assisted)`;
  const date = formatDate(input.generationDate);
  const notes = 'Generated by SF Solution Crawler';

  const cell = (text: string): string =>
    `<w:tc><w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;

  return `<w:tr>${cell(version)}${cell(author)}${cell(date)}${cell(notes)}</w:tr>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Insert a revision history row into the first <w:tbl> in the document.
 * Appends the row before the closing </w:tbl> tag.
 */
function populateRevisionHistory(xml: string, input: GeneratorInput): string {
  const tblClose = '</w:tbl>';
  const firstTblCloseIdx = xml.indexOf(tblClose);
  if (firstTblCloseIdx === -1) return xml;

  const row = buildRevisionRow(input);
  return xml.slice(0, firstTblCloseIdx) + row + xml.slice(firstTblCloseIdx);
}

// ---------------------------------------------------------------------------
// Custom null-getter: return [NEEDS INPUT] for unknown tags
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateDocument(options: GenerateOptions): ArrayBuffer {
  const { templateBuffer, input } = options;

  // 1. Load template with PizZip
  const zip = new PizZip(templateBuffer);

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Invalid .docx: missing word/document.xml');
  }

  // 2. Pre-process: normalize malformed brackets
  let xml = normalizeBrackets(docFile.asText());

  // 3. Split into blocks and handle conditional sections
  const bodyMatch = xml.match(/(<w:body>)([\s\S]*)(<\/w:body>)/);
  if (bodyMatch) {
    const prefix = xml.slice(0, xml.indexOf(bodyMatch[0])) + bodyMatch[1];
    const suffix = bodyMatch[3] + xml.slice(xml.indexOf(bodyMatch[0]) + bodyMatch[0].length);
    let bodyContent = bodyMatch[2];

    const blocks = splitIntoBlocks(bodyContent);

    let processed = blocks;

    // Handle conditional sections
    const deploymentType = input.conditionalSections.deploymentType;
    if (deploymentType === 'new_business') {
      processed = removeConditionalSection(processed, 'migration');
    } else if (deploymentType === 'migration') {
      processed = removeConditionalSection(processed, 'new_business');
    }

    // 4. Strip NOTE-REMOVE blocks
    processed = stripNoteBlocks(processed);

    xml = prefix + processed.join('') + suffix;
  }

  // 5. Strip any remaining [[...]] double-bracket markers so docxtemplater
  //    doesn't choke on them (they were already used for conditional logic).
  //    Also remove the marker paragraphs that contain them entirely.
  xml = stripDoubleBracketMarkers(xml);

  // Configure docxtemplater with custom [ ] delimiters
  zip.file('word/document.xml', xml);

  const data = buildDataObject(input);

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '[', end: ']' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter(_part: unknown) {
      return '[NEEDS INPUT]';
    },
  });

  // 6. Render — docxtemplater replaces [Field] with data values
  doc.render(data);

  // 7. Get rendered zip
  const renderedZip = doc.getZip();

  // 8. Populate revision history table
  const renderedDocFile = renderedZip.file('word/document.xml');
  if (renderedDocFile) {
    const renderedXml = renderedDocFile.asText();
    const withRevision = populateRevisionHistory(renderedXml, input);
    renderedZip.file('word/document.xml', withRevision);
  }

  // 9. Return as ArrayBuffer
  return renderedZip.generate({ type: 'arraybuffer' }) as ArrayBuffer;
}
