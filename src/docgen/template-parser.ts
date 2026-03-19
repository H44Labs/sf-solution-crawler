import PizZip from 'pizzip';

export interface TemplateAnalysis {
  fields: string[];                         // All unique normalized bracketed fields
  conditionalMarkers: ConditionalMarker[];  // [[If it's a New Business...]] etc.
  noteBlocks: NoteBlock[];                  // NOTE – REMOVE PRIOR TO PUBLISHING locations
  rawFields: string[];                      // All fields before normalization (for debugging)
}

export interface ConditionalMarker {
  text: string;
  type: 'new_business' | 'migration';
}

export interface NoteBlock {
  text: string;
}

// ---------------------------------------------------------------------------
// normalizeField
// Normalize a field: trim surrounding whitespace, fix missing brackets,
// trim spaces inside the brackets.
// ---------------------------------------------------------------------------
export function normalizeField(raw: string): string {
  let field = raw.trim();

  // Fix missing opening bracket when string ends with ]
  if (!field.startsWith('[') && field.endsWith(']')) {
    field = '[' + field;
  }

  // Fix missing closing bracket when string starts with [ but doesn't end with ]
  if (field.startsWith('[') && !field.endsWith(']')) {
    field = field + ']';
  }

  // Trim spaces inside brackets
  if (field.startsWith('[') && field.endsWith(']')) {
    const inner = field.slice(1, -1).trim();
    field = '[' + inner + ']';
  }

  return field;
}

// ---------------------------------------------------------------------------
// extractFieldsFromText
// Extract all single-bracketed fields from a plain-text string.
// Double-bracket markers ([[...]]) are excluded from this list — they are
// handled separately as conditional markers.
// ---------------------------------------------------------------------------
export function extractFieldsFromText(text: string): string[] {
  const fields: string[] = [];

  // Match single-bracket fields: [content] — but not double-bracket [[content]]
  // We use a negative lookbehind to skip [[ openings
  const singleBracket = /(?<!\[)\[([^\[\]]+)\](?!\])/g;
  let match: RegExpExecArray | null;
  while ((match = singleBracket.exec(text)) !== null) {
    fields.push('[' + match[1] + ']');
  }

  // Catch malformed fields missing the opening bracket: "Something ]"
  // Only if the ] is not preceded by a bracket-captured group above
  const malformed = /(?<!\])\b([\w][\w\s,/-]*?)\s*\](?!\])/g;
  const alreadyCaptured = new Set(fields);
  while ((match = malformed.exec(text)) !== null) {
    const candidate = '[' + match[1].trim() + ']';
    // Make sure this span wasn't already captured by the single-bracket regex
    // by verifying the character before the match isn't '['
    const charBefore = match.index > 0 ? text[match.index - 1] : '';
    if (charBefore !== '[' && !alreadyCaptured.has(candidate)) {
      fields.push(normalizeField(match[0]));
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// extractConditionalMarkers
// Extract [[...]] double-bracket markers and classify them.
// ---------------------------------------------------------------------------
function extractConditionalMarkers(text: string): ConditionalMarker[] {
  const markers: ConditionalMarker[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const inner = match[1].trim();
    let type: 'new_business' | 'migration';
    if (/new\s*business/i.test(inner)) {
      type = 'new_business';
    } else {
      // Default all other conditionals to 'migration'
      type = 'migration';
    }
    markers.push({ text: match[0], type });
  }
  return markers;
}

// ---------------------------------------------------------------------------
// extractNoteBlocks
// Find occurrences of the canonical NOTE sentinel phrase.
// ---------------------------------------------------------------------------
function extractNoteBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  // Match "NOTE" followed by an em-dash (or plain dash) and the standard phrase
  const regex = /NOTE\s*[–-]\s*REMOVE PRIOR TO PUBLISHING[^\n]*/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ text: match[0].trim() });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// buildFieldRegistry
// Return a deduplicated, normalized list of fields.
// ---------------------------------------------------------------------------
export function buildFieldRegistry(fields: string[]): string[] {
  const normalized = fields.map(normalizeField);
  return [...new Set(normalized)];
}

// ---------------------------------------------------------------------------
// parseTemplate
// Parse a .docx file buffer and extract all template metadata.
// ---------------------------------------------------------------------------
export function parseTemplate(buffer: ArrayBuffer): TemplateAnalysis {
  const zip = new PizZip(buffer);

  // Read document.xml — this is where the main body text lives
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    return { fields: [], conditionalMarkers: [], noteBlocks: [], rawFields: [] };
  }

  const xml: string = documentXmlFile.asText();

  // Strip XML tags to get plain text content.
  // We preserve the text content from <w:t> elements which hold the actual text.
  const plainText = xml
    .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, '$1 ')  // extract text runs with spacing
    .replace(/<[^>]+>/g, '')                           // remove remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Extract raw (pre-normalization) fields
  const rawFields = extractFieldsFromText(plainText);

  // Normalize and deduplicate
  const fields = buildFieldRegistry(rawFields);

  // Extract conditional markers
  const conditionalMarkers = extractConditionalMarkers(plainText);

  // Extract NOTE blocks
  const noteBlocks = extractNoteBlocks(plainText);

  return { fields, conditionalMarkers, noteBlocks, rawFields };
}
