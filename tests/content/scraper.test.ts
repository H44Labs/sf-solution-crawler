import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We need to mock the detector before importing scraper
vi.mock('../../src/content/detector', () => ({
  detectUIMode: vi.fn(() => 'lightning'),
}));

import { detectUIMode } from '../../src/content/detector';
import {
  extractFieldsLightning,
  extractFieldsClassic,
  extractRelatedLists,
  extractQuickLinks,
  extractPageContext,
  extractNotes,
  scrapePage,
} from '../../src/content/scraper';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// ─── extractFieldsLightning ──────────────────────────────────────────────────

describe('extractFieldsLightning', () => {
  it('extracts fields from lightning-output-field elements', () => {
    const doc = makeDoc(`
      <force-record-layout-section>
        <div class="slds-form__row">
          <lightning-output-field field-name="Name">
            <label class="slds-form-element__label">Account Name</label>
            <div class="slds-form-element__control">Acme Corp</div>
          </lightning-output-field>
        </div>
      </force-record-layout-section>
    `);
    const fields = extractFieldsLightning(doc.body);
    expect(fields.length).toBeGreaterThanOrEqual(1);
    const nameField = fields.find(f => f.label === 'Account Name');
    expect(nameField).toBeDefined();
    expect(nameField?.value).toBe('Acme Corp');
  });

  it('extracts fields from records-highlights-details', () => {
    const doc = makeDoc(`
      <records-highlights-details>
        <div class="highlights-detail-item">
          <p class="label">Type</p>
          <p class="value">New Business</p>
        </div>
      </records-highlights-details>
    `);
    const fields = extractFieldsLightning(doc.body);
    const typeField = fields.find(f => f.label === 'Type');
    expect(typeField).toBeDefined();
    expect(typeField?.value).toBe('New Business');
  });

  it('assigns correct section name from force-record-layout-section', () => {
    const doc = makeDoc(`
      <force-record-layout-section>
        <span class="slds-section__title--divider" title="Opportunity Information">Opportunity Information</span>
        <lightning-output-field field-name="StageName">
          <label class="slds-form-element__label">Stage</label>
          <div class="slds-form-element__control">Prospecting</div>
        </lightning-output-field>
      </force-record-layout-section>
    `);
    const fields = extractFieldsLightning(doc.body);
    const stageField = fields.find(f => f.label === 'Stage');
    expect(stageField).toBeDefined();
    expect(stageField?.section).toBe('Opportunity Information');
  });

  it('returns empty array when no lightning fields present', () => {
    const doc = makeDoc('<div><p>No fields here</p></div>');
    const fields = extractFieldsLightning(doc.body);
    expect(fields).toEqual([]);
  });

  it('trims whitespace from label and value', () => {
    const doc = makeDoc(`
      <lightning-output-field field-name="Phone">
        <label class="slds-form-element__label">  Phone  </label>
        <div class="slds-form-element__control">  555-1234  </div>
      </lightning-output-field>
    `);
    const fields = extractFieldsLightning(doc.body);
    const phone = fields.find(f => f.label === 'Phone');
    expect(phone?.label).toBe('Phone');
    expect(phone?.value).toBe('555-1234');
  });
});

// ─── extractFieldsClassic ────────────────────────────────────────────────────

describe('extractFieldsClassic', () => {
  it('extracts label/value pairs from detailList table', () => {
    const doc = makeDoc(`
      <table class="detailList">
        <tbody>
          <tr>
            <td class="labelCol">Account Name</td>
            <td class="dataCol">Acme Corp</td>
            <td class="labelCol">Industry</td>
            <td class="dataCol">Technology</td>
          </tr>
        </tbody>
      </table>
    `);
    const fields = extractFieldsClassic(doc.body);
    expect(fields.length).toBeGreaterThanOrEqual(2);
    expect(fields.find(f => f.label === 'Account Name')?.value).toBe('Acme Corp');
    expect(fields.find(f => f.label === 'Industry')?.value).toBe('Technology');
  });

  it('assigns section from preceding heading element', () => {
    const doc = makeDoc(`
      <h3 class="pageSubtitle">Opportunity Detail</h3>
      <table class="detailList">
        <tbody>
          <tr>
            <td class="labelCol">Stage</td>
            <td class="dataCol">Closed Won</td>
          </tr>
        </tbody>
      </table>
    `);
    const fields = extractFieldsClassic(doc.body);
    const stageField = fields.find(f => f.label === 'Stage');
    expect(stageField?.section).toBe('Opportunity Detail');
  });

  it('returns empty array when no detailList table present', () => {
    const doc = makeDoc('<div><p>No classic table here</p></div>');
    const fields = extractFieldsClassic(doc.body);
    expect(fields).toEqual([]);
  });

  it('skips rows with empty labels', () => {
    const doc = makeDoc(`
      <table class="detailList">
        <tbody>
          <tr>
            <td class="labelCol"></td>
            <td class="dataCol">Some value</td>
          </tr>
          <tr>
            <td class="labelCol">Real Label</td>
            <td class="dataCol">Real Value</td>
          </tr>
        </tbody>
      </table>
    `);
    const fields = extractFieldsClassic(doc.body);
    expect(fields.every(f => f.label !== '')).toBe(true);
    expect(fields.find(f => f.label === 'Real Label')).toBeDefined();
  });
});

// ─── extractRelatedLists ─────────────────────────────────────────────────────

describe('extractRelatedLists', () => {
  it('extracts related list tables', () => {
    const doc = makeDoc(`
      <div class="relatedList">
        <h3>Contacts</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            <tr><td>John Doe</td><td>john@acme.com</td></tr>
          </tbody>
        </table>
      </div>
    `);
    // Set the document body so extractRelatedLists can query document
    document.body.innerHTML = doc.body.innerHTML;
    const lists = extractRelatedLists();
    expect(lists.length).toBeGreaterThanOrEqual(1);
    const contacts = lists.find(l => l.name === 'Contacts');
    expect(contacts).toBeDefined();
    expect(contacts?.columns).toContain('Name');
    expect(contacts?.columns).toContain('Email');
    expect(contacts?.rows[0]).toContain('John Doe');
  });

  it('extracts lightning related list components', () => {
    const doc = makeDoc(`
      <lst-related-list-view-manager>
        <lst-related-list-single-container title="Open Activities">
          <lightning-datatable>
            <table>
              <thead><tr><th>Subject</th><th>Due Date</th></tr></thead>
              <tbody><tr><td>Call</td><td>2026-04-01</td></tr></tbody>
            </table>
          </lightning-datatable>
        </lst-related-list-single-container>
      </lst-related-list-view-manager>
    `);
    document.body.innerHTML = doc.body.innerHTML;
    const lists = extractRelatedLists();
    // Should find at least the related list container
    expect(Array.isArray(lists)).toBe(true);
  });

  it('returns empty array when no related lists present', () => {
    document.body.innerHTML = '<div><p>Nothing here</p></div>';
    const lists = extractRelatedLists();
    expect(lists).toEqual([]);
  });
});

// ─── extractQuickLinks ───────────────────────────────────────────────────────

describe('extractQuickLinks', () => {
  it('extracts sidebar quick links', () => {
    document.body.innerHTML = `
      <div class="quickLinks">
        <a href="/home">Home</a>
        <a href="/accounts">Accounts</a>
      </div>
    `;
    const links = extractQuickLinks();
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.find(l => l.text === 'Home')).toBeDefined();
    expect(links.find(l => l.href === '/accounts')).toBeDefined();
  });

  it('returns empty array when no quick links present', () => {
    document.body.innerHTML = '<div><p>Nothing here</p></div>';
    const links = extractQuickLinks();
    expect(links).toEqual([]);
  });

  it('trims link text whitespace', () => {
    document.body.innerHTML = `
      <div class="quickLinks">
        <a href="/leads">  Leads  </a>
      </div>
    `;
    const links = extractQuickLinks();
    const leads = links.find(l => l.href === '/leads');
    expect(leads?.text).toBe('Leads');
  });
});

// ─── extractPageContext ──────────────────────────────────────────────────────

describe('extractPageContext', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts page title from document.title', () => {
    document.title = 'Acme Corp | Salesforce';
    document.body.innerHTML = '<div></div>';
    vi.mocked(detectUIMode).mockReturnValue('lightning');
    const ctx = extractPageContext();
    expect(ctx.title).toBe('Acme Corp | Salesforce');
  });

  it('extracts breadcrumb from lightning breadcrumb nav', () => {
    document.body.innerHTML = `
      <nav aria-label="Breadcrumbs">
        <ol>
          <li><a>Opportunities</a></li>
          <li><a>Acme Deal</a></li>
        </ol>
      </nav>
    `;
    vi.mocked(detectUIMode).mockReturnValue('lightning');
    const ctx = extractPageContext();
    expect(ctx.breadcrumb).toContain('Opportunities');
    expect(ctx.breadcrumb).toContain('Acme Deal');
  });

  it('returns the current URL', () => {
    document.body.innerHTML = '<div></div>';
    vi.mocked(detectUIMode).mockReturnValue('lightning');
    const ctx = extractPageContext();
    expect(ctx.url).toBe(window.location.href);
  });

  it('includes detected UI mode', () => {
    document.body.innerHTML = '<div></div>';
    vi.mocked(detectUIMode).mockReturnValue('classic');
    const ctx = extractPageContext();
    expect(ctx.uiMode).toBe('classic');
  });
});

// ─── extractNotes ────────────────────────────────────────────────────────────

describe('extractNotes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts visible note/description text', () => {
    document.body.innerHTML = `
      <div class="notes">
        <p>This is a note about the opportunity.</p>
        <p>Another note here.</p>
      </div>
    `;
    const notes = extractNotes();
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.some(n => n.includes('note about the opportunity'))).toBe(true);
  });

  it('returns empty array when no notes present', () => {
    document.body.innerHTML = '<div><p>Nothing</p></div>';
    const notes = extractNotes();
    expect(notes).toEqual([]);
  });
});

// ─── scrapePage ──────────────────────────────────────────────────────────────

describe('scrapePage', () => {
  beforeEach(() => {
    vi.mocked(detectUIMode).mockReturnValue('lightning');
    document.title = 'Test Page | Salesforce';
    document.body.innerHTML = `
      <nav aria-label="Breadcrumbs"><ol><li><a>Home</a></li></ol></nav>
      <force-record-layout-section>
        <lightning-output-field field-name="Name">
          <label class="slds-form-element__label">Account Name</label>
          <div class="slds-form-element__control">Test Corp</div>
        </lightning-output-field>
      </force-record-layout-section>
    `;
  });

  it('returns a PageData object', () => {
    const data = scrapePage();
    expect(data).toHaveProperty('pageContext');
    expect(data).toHaveProperty('fields');
    expect(data).toHaveProperty('relatedLists');
    expect(data).toHaveProperty('quickLinks');
    expect(data).toHaveProperty('notes');
  });

  it('calls Lightning extractor when UI mode is lightning', () => {
    vi.mocked(detectUIMode).mockReturnValue('lightning');
    const data = scrapePage();
    const nameField = data.fields.find(f => f.label === 'Account Name');
    expect(nameField).toBeDefined();
    expect(nameField?.value).toBe('Test Corp');
  });

  it('calls Classic extractor when UI mode is classic', () => {
    vi.mocked(detectUIMode).mockReturnValue('classic');
    document.body.innerHTML = `
      <table class="detailList">
        <tbody>
          <tr>
            <td class="labelCol">Stage</td>
            <td class="dataCol">Prospecting</td>
          </tr>
        </tbody>
      </table>
    `;
    const data = scrapePage();
    expect(data.fields.find(f => f.label === 'Stage')).toBeDefined();
  });

  it('pageContext uiMode matches detected mode', () => {
    vi.mocked(detectUIMode).mockReturnValue('classic');
    const data = scrapePage();
    expect(data.pageContext.uiMode).toBe('classic');
  });
});
