import type { PageData, ScrapedField, RelatedList, QuickLink, PageContext } from '../types';
import { detectUIMode } from './detector';

// ─── Deep Shadow DOM Traversal ───────────────────────────────────────────────

/**
 * querySelectorAll that pierces shadow DOM boundaries.
 * Recursively enters open shadow roots up to maxDepth.
 * This is CRITICAL for Salesforce Lightning which wraps everything in shadow DOM.
 */
function deepQueryAll(root: Element | ShadowRoot | Document, selector: string, maxDepth = 8, depth = 0): Element[] {
  if (depth > maxDepth) return [];
  const results: Element[] = [];
  try { results.push(...Array.from(root.querySelectorAll(selector))); } catch { /* skip */ }
  const children = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const child of Array.from(children)) {
    if ((child as any).shadowRoot) {
      results.push(...deepQueryAll((child as any).shadowRoot, selector, maxDepth, depth + 1));
    }
  }
  return results;
}

/** querySelector that pierces shadow DOM. Returns first match or null. */
function deepQuery(root: Element | ShadowRoot | Document, selector: string, maxDepth = 8, depth = 0): Element | null {
  if (depth > maxDepth) return null;
  const found = root.querySelector(selector);
  if (found) return found;
  const children = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const child of Array.from(children)) {
    if ((child as any).shadowRoot) {
      const r = deepQuery((child as any).shadowRoot, selector, maxDepth, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Extract visible text from an element, filtering out UI chrome.
 */
function extractTexts(el: Element): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').trim();
    if (
      t && t.length < 500 &&
      !t.startsWith('Edit ') && !t.startsWith('Open ') &&
      !t.includes('Preview') && !t.startsWith('Help ') &&
      t !== 'Edit' && t !== 'Change' && t !== 'Change Owner' &&
      t !== 'Mark Stage as Complete' && !t.startsWith('Show Key Fields')
    ) {
      texts.push(t);
    }
  }
  return texts;
}

// ─── Highlights Panel ────────────────────────────────────────────────────────

function scrapeHighlights(): ScrapedField[] {
  const fields: ScrapedField[] = [];

  const hlItems = deepQueryAll(document, 'records-highlights-details-item');
  hlItems.forEach(item => {
    const texts = extractTexts(item);
    const label = texts[0] || '';
    const value = texts.slice(1).join('; ') || '';
    if (label && value) {
      fields.push({ label, value, section: 'Highlights' });
    }
  });

  // Account Name from link
  if (!fields.some(f => f.label === 'Account Name')) {
    const accountLinks = deepQueryAll(document, 'a[href*="/Account/"], a[href*="/001"]');
    for (const link of accountLinks) {
      const text = (link.textContent || '').trim();
      if (text && text.length > 2 && text.length < 100 && !text.includes('View All')) {
        fields.push({ label: 'Account Name', value: text, section: 'Highlights' });
        break;
      }
    }
  }

  // Stage from path component
  const pathOptions = deepQueryAll(document, '[role="option"]');
  for (const opt of pathOptions) {
    const isSelected = opt.getAttribute('aria-selected') === 'true' ||
      opt.classList.contains('slds-is-current') ||
      opt.classList.contains('slds-is-active');
    if (isSelected) {
      fields.push({ label: 'Current Stage', value: (opt.textContent || '').trim(), section: 'Path' });
      break;
    }
  }

  return fields;
}

// ─── Detail Fields (deep shadow DOM) ─────────────────────────────────────────

function scrapeDetailFields(): ScrapedField[] {
  const fields: ScrapedField[] = [];
  const seen = new Set<string>();

  // All record layout items — deep into shadow DOM
  const items = deepQueryAll(document, 'records-record-layout-item');

  items.forEach(item => {
    // Try to get API field name from shadow root
    let apiName = '';
    if ((item as any).shadowRoot) {
      const div = (item as any).shadowRoot.querySelector('[data-target-selection-name]');
      if (div) {
        apiName = (div.getAttribute('data-target-selection-name') || '')
          .replace(/^sfdc:RecordField\.\w+\./, '');
      }
    }

    const texts = extractTexts(item);
    const label = texts[0] || '';
    const value = texts.slice(1).filter(t => t !== label).join('; ').substring(0, 500) || '';

    if (!label) return;
    const key = apiName || label;
    if (seen.has(key)) return;
    seen.add(key);

    if (value) {
      fields.push({ label, value, section: 'Details' });
    }
  });

  // Section headers for context
  const sections = deepQueryAll(document, 'records-record-layout-section');
  sections.forEach(sec => {
    const texts = extractTexts(sec);
    if (texts[0] && texts[0].length < 100) {
      fields.push({ label: '__SECTION__', value: texts[0], section: 'Section Headers' });
    }
  });

  return fields;
}

// ─── Related Lists ───────────────────────────────────────────────────────────

function scrapeRelatedLists(): RelatedList[] {
  const lists: RelatedList[] = [];

  // Related list quick links with counts
  const links = deepQueryAll(document, 'a[href*="/related/"]');
  const rlInfo: Record<string, { count: number; href: string }> = {};
  links.forEach(link => {
    const text = (link.textContent || '').trim();
    const match = text.match(/^(.+?)\s*\((\d+)\)$/);
    if (match) {
      rlInfo[match[1].trim()] = {
        count: parseInt(match[2]),
        href: link.getAttribute('href') || '',
      };
    }
  });

  // Try to scrape inline related list tables
  const rlContainers = deepQueryAll(document,
    'lst-related-list-single-container, force-related-list-single-container, ' +
    'lst-related-list-container, records-related-list-container, ' +
    'flexipage-related-list, lightning-related-list-container'
  );

  rlContainers.forEach(container => {
    const titleEl = deepQuery(container, 'h2, .slds-card__header-title');
    const name = titleEl ? (titleEl.textContent || '').trim() : '';
    if (!name) return;

    const columns: string[] = [];
    deepQueryAll(container, 'thead th, th').forEach(th => {
      const t = (th.textContent || '').trim();
      if (t && t !== 'Action' && t !== 'Actions') columns.push(t);
    });

    const rows: string[][] = [];
    deepQueryAll(container, 'tbody tr').forEach(tr => {
      const cells: string[] = [];
      deepQueryAll(tr, 'td, th[scope="row"]').forEach(cell => {
        cells.push((cell.textContent || '').trim());
      });
      if (cells.length > 0) rows.push(cells);
    });

    lists.push({ name, columns, rows });
  });

  // Add quick link info as empty lists for context
  for (const [name, info] of Object.entries(rlInfo)) {
    if (!lists.some(l => l.name === name)) {
      lists.push({ name: `${name} (${info.count})`, columns: [], rows: [] });
    }
  }

  return lists;
}

// ─── Quick Links ─────────────────────────────────────────────────────────────

function extractAllLinks(): QuickLink[] {
  const links: QuickLink[] = [];
  const seen = new Set<string>();

  deepQueryAll(document, 'a[href]').forEach(anchor => {
    const el = anchor as HTMLAnchorElement;
    const text = (el.textContent || '').trim();
    const href = el.href || '';
    if (href && !seen.has(href) && text && text.length < 200 && (
      href.includes('salesforce.com') || href.includes('force.com') || href.startsWith('/')
    )) {
      seen.add(href);
      links.push({ text, href });
    }
  });

  return links;
}

// ─── Page Context ────────────────────────────────────────────────────────────

export function extractPageContext(): PageContext {
  const uiMode = detectUIMode();
  const title = document.title || '';
  const url = window.location.href;

  const breadcrumb: string[] = [];
  const navEl = deepQuery(document, 'nav[aria-label*="Breadcrumb" i], .breadcrumb, .slds-breadcrumb');
  if (navEl) {
    navEl.querySelectorAll('li a, li span, li').forEach(item => {
      const text = (item.textContent || '').trim();
      if (text && !breadcrumb.includes(text)) breadcrumb.push(text);
    });
  }

  return { url, title, breadcrumb, uiMode };
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export function scrapePage(): PageData {
  const pageContext = extractPageContext();

  // Deep shadow DOM extraction — the real deal for Lightning
  const highlights = scrapeHighlights();
  const details = scrapeDetailFields();
  const fields = [...highlights, ...details];

  const relatedLists = scrapeRelatedLists();
  const quickLinks = extractAllLinks();

  // Notes
  const notes: string[] = [];
  deepQueryAll(document, '[class*="note"] p, [class*="description"] p').forEach(el => {
    const text = (el.textContent || '').trim();
    if (text) notes.push(text);
  });

  return { pageContext, fields, relatedLists, quickLinks, notes };
}

// Keep these exports for tests
export { deepQueryAll, deepQuery, extractTexts, scrapeHighlights, scrapeDetailFields, scrapeRelatedLists, extractAllLinks };
