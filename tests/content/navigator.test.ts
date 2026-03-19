import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findNavigationTarget,
  detectSessionExpiration,
  hashDOMSnapshot,
  navigateTo,
} from '../../src/content/navigator';
import { NavigationDirective } from '../../src/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function setHref(url: string) {
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });
}

// ─── findNavigationTarget ─────────────────────────────────────────────────────

describe('findNavigationTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds an element by CSS selector', () => {
    document.body.innerHTML = '<button id="myBtn">Click me</button>';
    const el = findNavigationTarget('#myBtn');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('myBtn');
  });

  it('finds a link by exact text content', () => {
    document.body.innerHTML = '<a href="/foo">Accounts</a>';
    const el = findNavigationTarget('Accounts');
    expect(el).not.toBeNull();
    expect((el as HTMLAnchorElement).textContent?.trim()).toBe('Accounts');
  });

  it('finds a link by partial href match', () => {
    document.body.innerHTML = '<a href="/lightning/o/Opportunity/list">Opps</a>';
    const el = findNavigationTarget('/lightning/o/Opportunity/list');
    expect(el).not.toBeNull();
    expect((el as HTMLAnchorElement).href).toContain('/lightning/o/Opportunity/list');
  });

  it('returns null when target is not found', () => {
    document.body.innerHTML = '<p>Nothing here</p>';
    const el = findNavigationTarget('#nonExistent');
    expect(el).toBeNull();
  });

  it('prefers CSS selector over text match', () => {
    // Both a CSS-selectable element and a link with same text exist
    document.body.innerHTML = `
      <div id="exact">Target</div>
      <a href="/other">Target</a>
    `;
    const el = findNavigationTarget('#exact');
    expect((el as HTMLElement).id).toBe('exact');
  });
});

// ─── detectSessionExpiration ──────────────────────────────────────────────────

describe('detectSessionExpiration', () => {
  afterEach(() => {
    // restore
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.salesforce.com/' },
      writable: true,
      configurable: true,
    });
  });

  it('returns true for /login URL', () => {
    setHref('https://example.salesforce.com/login');
    expect(detectSessionExpiration()).toBe(true);
  });

  it('returns true for /secur/frontdoor.jsp URL', () => {
    setHref('https://example.salesforce.com/secur/frontdoor.jsp?sid=abc');
    expect(detectSessionExpiration()).toBe(true);
  });

  it('returns true for /setup/secur/ URL', () => {
    setHref('https://example.salesforce.com/setup/secur/RemoteAccessAuthorizationPage.apexp');
    expect(detectSessionExpiration()).toBe(true);
  });

  it('returns false for a normal Salesforce Lightning URL', () => {
    setHref('https://example.salesforce.com/lightning/r/Opportunity/0061t000004abc/view');
    expect(detectSessionExpiration()).toBe(false);
  });

  it('returns false for a Salesforce setup URL that is not a login page', () => {
    setHref('https://example.salesforce.com/lightning/setup/OrgSettings/home');
    expect(detectSessionExpiration()).toBe(false);
  });
});

// ─── hashDOMSnapshot ──────────────────────────────────────────────────────────

describe('hashDOMSnapshot', () => {
  it('returns a non-empty string', () => {
    document.body.innerHTML = '<h1>Hello</h1>';
    const hash = hashDOMSnapshot();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('returns different hashes for different DOM states', () => {
    document.body.innerHTML = '<h1>State A</h1>';
    const hashA = hashDOMSnapshot();

    document.body.innerHTML = '<h1>State B — completely different content</h1><p>extra</p>';
    const hashB = hashDOMSnapshot();

    expect(hashA).not.toBe(hashB);
  });

  it('returns the same hash for the same DOM', () => {
    document.body.innerHTML = '<div class="container"><span>Stable</span></div>';
    const hash1 = hashDOMSnapshot();
    const hash2 = hashDOMSnapshot();
    expect(hash1).toBe(hash2);
  });
});

// ─── navigateTo ───────────────────────────────────────────────────────────────

describe('navigateTo', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Stable URL — not a login page
    setHref('https://example.salesforce.com/lightning/o/Account/list');
  });

  it('clicks the target element and returns true', async () => {
    const btn = document.createElement('button');
    btn.id = 'navBtn';
    btn.textContent = 'Go';
    const clickSpy = vi.spyOn(btn, 'click');
    document.body.appendChild(btn);

    const directive: NavigationDirective = {
      action: 'click',
      target: '#navBtn',
      reason: 'Navigate to accounts',
      fieldsSought: [],
    };

    const result = await navigateTo(directive);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  }, 10_000);

  it('returns false when the target element cannot be found', async () => {
    const directive: NavigationDirective = {
      action: 'navigate',
      target: '#doesNotExist',
      reason: 'Testing missing target',
      fieldsSought: [],
    };

    const result = await navigateTo(directive);
    expect(result).toBe(false);
  }, 10_000);
});
