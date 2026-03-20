import type { PageData, ScrapedField, RelatedList, QuickLink, PageContext } from '../types';
import { detectUIMode } from './detector';

// ─── Lightning extraction ─────────────────────────────────────────────────────

export function extractFieldsLightning(root: Element): ScrapedField[] {
  const fields: ScrapedField[] = [];

  // 1. Extract from records-highlights-details (compact layout highlight panel)
  const highlights = root.querySelectorAll('records-highlights-details .highlights-detail-item');
  highlights.forEach(item => {
    const labelEl = item.querySelector('.label, p.label, span.label');
    const valueEl = item.querySelector('.value, p.value, span.value');
    const label = labelEl?.textContent?.trim() ?? '';
    const value = valueEl?.textContent?.trim() ?? '';
    if (label) {
      fields.push({ label, value, section: 'Highlights' });
    }
  });

  // 2. Extract from force-record-layout-section > lightning-output-field
  const sections = root.querySelectorAll('force-record-layout-section');
  if (sections.length > 0) {
    sections.forEach(section => {
      // Try to read a section title
      const titleEl =
        section.querySelector('.slds-section__title--divider') ??
        section.querySelector('.slds-section__title') ??
        section.querySelector('[title]');
      const sectionName =
        titleEl?.getAttribute('title') ??
        titleEl?.textContent?.trim() ??
        'Details';

      section.querySelectorAll('lightning-output-field').forEach(field => {
        const labelEl = field.querySelector('.slds-form-element__label, label');
        const valueEl = field.querySelector('.slds-form-element__control, .fieldComponent, [class*="output"]');
        const label = labelEl?.textContent?.trim() ?? '';
        const value = valueEl?.textContent?.trim() ?? '';
        if (label) {
          fields.push({ label, value, section: sectionName });
        }
      });
    });
  } else {
    // Fallback: query all lightning-output-field anywhere under root
    root.querySelectorAll('lightning-output-field').forEach(field => {
      const labelEl = field.querySelector('.slds-form-element__label, label');
      const valueEl = field.querySelector('.slds-form-element__control, .fieldComponent, [class*="output"]');
      const label = labelEl?.textContent?.trim() ?? '';
      const value = valueEl?.textContent?.trim() ?? '';
      if (label) {
        fields.push({ label, value, section: 'Details' });
      }
    });
  }

  return fields;
}

// ─── Classic extraction ───────────────────────────────────────────────────────

export function extractFieldsClassic(root: Element): ScrapedField[] {
  const fields: ScrapedField[] = [];
  const tables = root.querySelectorAll('table.detailList');

  tables.forEach(table => {
    // Try to find a preceding heading for section name
    let sectionName = 'Details';
    let sibling: Element | null = table.previousElementSibling;
    while (sibling) {
      const tag = sibling.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag) || sibling.classList.contains('pageSubtitle')) {
        sectionName = sibling.textContent?.trim() ?? 'Details';
        break;
      }
      sibling = sibling.previousElementSibling;
    }

    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const labelCells = row.querySelectorAll('td.labelCol');
      const dataCells = row.querySelectorAll('td.dataCol');

      labelCells.forEach((labelCell, i) => {
        const label = labelCell.textContent?.trim() ?? '';
        const value = dataCells[i]?.textContent?.trim() ?? '';
        if (label) {
          fields.push({ label, value, section: sectionName });
        }
      });
    });
  });

  return fields;
}

// ─── Related lists ────────────────────────────────────────────────────────────

export function extractRelatedLists(): RelatedList[] {
  const lists: RelatedList[] = [];

  // Classic: .relatedList divs containing tables
  document.querySelectorAll('.relatedList').forEach(container => {
    const headingEl =
      container.querySelector('h3, h2, h4, .relatedListTitle') ??
      container.querySelector('[class*="title"]');
    const name = headingEl?.textContent?.trim() ?? 'Related List';

    const table = container.querySelector('table');
    if (!table) return;

    const columns: string[] = [];
    table.querySelectorAll('thead th').forEach(th => {
      columns.push(th.textContent?.trim() ?? '');
    });

    const rows: string[][] = [];
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td').forEach(td => {
        cells.push(td.textContent?.trim() ?? '');
      });
      if (cells.length > 0) rows.push(cells);
    });

    lists.push({ name, columns, rows });
  });

  // Lightning: lst-related-list-single-container
  document.querySelectorAll('lst-related-list-single-container').forEach(container => {
    const name = container.getAttribute('title') ?? 'Related List';

    const columns: string[] = [];
    container.querySelectorAll('table thead th').forEach(th => {
      columns.push(th.textContent?.trim() ?? '');
    });

    const rows: string[][] = [];
    container.querySelectorAll('table tbody tr').forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td').forEach(td => {
        cells.push(td.textContent?.trim() ?? '');
      });
      if (cells.length > 0) rows.push(cells);
    });

    lists.push({ name, columns, rows });
  });

  return lists;
}

// ─── Quick links ──────────────────────────────────────────────────────────────

export function extractQuickLinks(): QuickLink[] {
  const links: QuickLink[] = [];

  document.querySelectorAll('.quickLinks a, [class*="quickLink"] a').forEach(anchor => {
    const el = anchor as HTMLAnchorElement;
    const text = el.textContent?.trim() ?? '';
    const href = el.getAttribute('href') ?? el.href ?? '';
    if (text || href) {
      links.push({ text, href });
    }
  });

  return links;
}

// ─── Page context ─────────────────────────────────────────────────────────────

export function extractPageContext(): PageContext {
  const uiMode = detectUIMode();
  const title = document.title ?? '';
  const url = window.location.href;

  const breadcrumb: string[] = [];

  // Lightning: <nav aria-label="Breadcrumbs"> or similar
  const navEl =
    document.querySelector('nav[aria-label="Breadcrumbs"]') ??
    document.querySelector('nav[aria-label*="breadcrumb" i]') ??
    document.querySelector('.breadcrumb, .slds-breadcrumb');

  if (navEl) {
    navEl.querySelectorAll('li a, li span[class*="current"], li').forEach(item => {
      const text = item.textContent?.trim() ?? '';
      if (text && !breadcrumb.includes(text)) {
        breadcrumb.push(text);
      }
    });
  }

  return { url, title, breadcrumb, uiMode };
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function extractNotes(): string[] {
  const notes: string[] = [];

  document.querySelectorAll('.notes p, .notes li, [class*="note"] p, [class*="description"] p').forEach(el => {
    const text = el.textContent?.trim() ?? '';
    if (text) notes.push(text);
  });

  return notes;
}

// ─── Raw text fallback ────────────────────────────────────────────────────────

/**
 * When structured extraction returns nothing (common with Lightning shadow DOM),
 * fall back to extracting all visible text from the page. The AI is smart enough
 * to parse this into meaningful field/value pairs.
 */
export function extractRawPageText(): ScrapedField[] {
  const fields: ScrapedField[] = [];

  // Strategy 1: Try to find ANY label/value-like patterns in the page
  // Look for elements that have a label-like sibling/child structure
  const allElements = document.querySelectorAll(
    '[class*="label"], [class*="field"], [class*="detail"], [class*="record"], ' +
    '[class*="output"], [class*="form-element"], [class*="slds-form"], ' +
    'dt, th, label, [data-label]'
  );

  const seen = new Set<string>();
  allElements.forEach(el => {
    const label = el.getAttribute('data-label') || el.textContent?.trim() || '';
    if (!label || label.length > 100 || seen.has(label)) return;

    // Try to find a nearby value element
    const parent = el.parentElement;
    const nextSibling = el.nextElementSibling;
    let value = '';

    if (nextSibling) {
      value = nextSibling.textContent?.trim() || '';
    } else if (parent) {
      // Check if parent has text beyond the label
      const parentText = parent.textContent?.trim() || '';
      if (parentText.length > label.length) {
        value = parentText.replace(label, '').trim();
      }
    }

    if (label && label.length < 80) {
      seen.add(label);
      fields.push({ label, value: value.substring(0, 500), section: 'Page Content' });
    }
  });

  // Strategy 2: Extract ALL visible text as one big field for AI to parse
  const bodyText = document.body.innerText || '';
  if (bodyText.length > 0) {
    // Break into chunks of ~2000 chars to stay manageable
    const chunks = bodyText.match(/.{1,2000}/gs) || [];
    chunks.forEach((chunk, i) => {
      fields.push({
        label: `__RAW_TEXT_CHUNK_${i + 1}__`,
        value: chunk.trim(),
        section: 'Raw Page Text',
      });
    });
  }

  return fields;
}

/**
 * Extract all clickable links on the page for navigation
 */
export function extractAllLinks(): QuickLink[] {
  const links: QuickLink[] = [];
  const seen = new Set<string>();

  document.querySelectorAll('a[href]').forEach(anchor => {
    const el = anchor as HTMLAnchorElement;
    const text = el.textContent?.trim() || '';
    const href = el.href || '';

    // Only include Salesforce internal links
    if (href && !seen.has(href) && (
      href.includes('salesforce.com') ||
      href.includes('force.com') ||
      href.startsWith('/')
    )) {
      seen.add(href);
      if (text && text.length < 200) {
        links.push({ text, href });
      }
    }
  });

  return links;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function scrapePage(): PageData {
  const pageContext = extractPageContext();
  const root = document.body;

  // Try structured extraction first
  let fields: ScrapedField[] =
    pageContext.uiMode === 'lightning'
      ? extractFieldsLightning(root)
      : extractFieldsClassic(root);

  // If structured extraction found nothing, fall back to raw text
  if (fields.length === 0) {
    fields = extractRawPageText();
  }

  let relatedLists = extractRelatedLists();
  let quickLinks = extractQuickLinks();

  // If no quick links found via specific selectors, extract all page links
  if (quickLinks.length === 0) {
    quickLinks = extractAllLinks();
  }

  const notes = extractNotes();

  return { pageContext, fields, relatedLists, quickLinks, notes };
}
