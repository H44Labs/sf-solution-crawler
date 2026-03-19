import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XHRInterceptor } from '../../src/content/xhr-interceptor';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal Salesforce UI API response for a single record */
function makeSfApiResponse(fields: Record<string, { value: unknown; displayValue: string | null }>) {
  return { fields };
}

/** Wrap a response body in a fetch-compatible Response mock */
function makeResponse(body: unknown, url: string, ok = true): Response {
  return {
    ok,
    url,
    clone() {
      return makeResponse(body, url, ok);
    },
    json() {
      return Promise.resolve(body);
    },
  } as unknown as Response;
}

/** Install a mock fetch that returns a given response, then start the interceptor */
function setupInterceptedFetch(
  interceptor: XHRInterceptor,
  response: Response,
): () => Promise<Response> {
  const mockFetch = vi.fn().mockResolvedValue(response);
  globalThis.fetch = mockFetch;
  interceptor.start();
  // The interceptor wraps globalThis.fetch — return the wrapped version
  return globalThis.fetch as () => Promise<Response>;
}

// ─── XHRInterceptor lifecycle ────────────────────────────────────────────────

describe('XHRInterceptor lifecycle', () => {
  let interceptor: XHRInterceptor;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    interceptor = new XHRInterceptor();
  });

  afterEach(() => {
    interceptor.stop();
    globalThis.fetch = originalFetch;
  });

  it('starts and patches global fetch', () => {
    const before = globalThis.fetch;
    interceptor.start();
    expect(globalThis.fetch).not.toBe(before);
  });

  it('stop() restores original fetch', () => {
    const before = globalThis.fetch;
    interceptor.start();
    interceptor.stop();
    expect(globalThis.fetch).toBe(before);
  });

  it('calling stop before start is safe', () => {
    expect(() => interceptor.stop()).not.toThrow();
  });

  it('calling start twice does not double-wrap', () => {
    interceptor.start();
    const wrapped = globalThis.fetch;
    interceptor.start();
    expect(globalThis.fetch).toBe(wrapped);
  });
});

// ─── Capture SF UI API responses ─────────────────────────────────────────────

describe('XHRInterceptor – SF API capture', () => {
  let interceptor: XHRInterceptor;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    interceptor = new XHRInterceptor();
  });

  afterEach(() => {
    interceptor.stop();
    globalThis.fetch = originalFetch;
  });

  it('captures fields from matching SF UI API URL', async () => {
    const sfUrl = 'https://myorg.my.salesforce.com/services/data/v59.0/ui-api/records/001XXXXXXXXXXXX';
    const body = makeSfApiResponse({
      Name: { value: 'Acme Corp', displayValue: null },
      StageName: { value: 'Prospecting', displayValue: null },
    });

    // Install mock BEFORE start so the interceptor wraps it
    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, sfUrl));
    await wrappedFetch(sfUrl);

    // Allow microtasks to flush
    await new Promise(r => setTimeout(r, 0));

    const captured = interceptor.getCapturedFields();
    expect(captured.length).toBeGreaterThanOrEqual(2);
    expect(captured.find(f => f.label === 'Name')?.value).toBe('Acme Corp');
    expect(captured.find(f => f.label === 'StageName')?.value).toBe('Prospecting');
  });

  it('uses displayValue when available', async () => {
    const sfUrl = 'https://myorg.my.salesforce.com/services/data/v55.0/ui-api/records/001ABC';
    const body = makeSfApiResponse({
      CloseDate: { value: '2026-06-30', displayValue: '6/30/2026' },
    });

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, sfUrl));
    await wrappedFetch(sfUrl);
    await new Promise(r => setTimeout(r, 0));

    const captured = interceptor.getCapturedFields();
    const closeDate = captured.find(f => f.label === 'CloseDate');
    expect(closeDate?.value).toBe('6/30/2026');
  });

  it('does not capture from non-SF URLs', async () => {
    const otherUrl = 'https://example.com/api/data';
    const body = { fields: { Name: { value: 'Should not appear', displayValue: null } } };

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, otherUrl));
    await wrappedFetch(otherUrl);
    await new Promise(r => setTimeout(r, 0));

    const captured = interceptor.getCapturedFields();
    expect(captured).toEqual([]);
  });

  it('does not capture from SF URLs that do not match ui-api/records pattern', async () => {
    const otherSfUrl = 'https://myorg.my.salesforce.com/services/data/v59.0/query?q=SELECT+Id';
    const body = { records: [] };

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, otherSfUrl));
    await wrappedFetch(otherSfUrl);
    await new Promise(r => setTimeout(r, 0));

    const captured = interceptor.getCapturedFields();
    expect(captured).toEqual([]);
  });

  it('passes through the original response unchanged', async () => {
    const sfUrl = 'https://myorg.my.salesforce.com/services/data/v59.0/ui-api/records/001XYZ';
    const body = makeSfApiResponse({ Amount: { value: '50000', displayValue: '$50,000.00' } });

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, sfUrl));
    const result = await wrappedFetch(sfUrl);
    await new Promise(r => setTimeout(r, 0));

    // The response should still be usable
    expect(result).toBeDefined();
  });
});

// ─── getCapturedFields / clear ───────────────────────────────────────────────

describe('XHRInterceptor – getCapturedFields and clear', () => {
  let interceptor: XHRInterceptor;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    interceptor = new XHRInterceptor();
  });

  afterEach(() => {
    interceptor.stop();
    globalThis.fetch = originalFetch;
  });

  it('getCapturedFields returns a copy, not the internal array', async () => {
    const sfUrl = 'https://myorg.my.salesforce.com/services/data/v59.0/ui-api/records/001A';
    const body = makeSfApiResponse({ Name: { value: 'Corp', displayValue: null } });

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, sfUrl));
    await wrappedFetch(sfUrl);
    await new Promise(r => setTimeout(r, 0));

    const copy1 = interceptor.getCapturedFields();
    copy1.push({ label: 'Injected', value: 'x', section: 'api' });

    const copy2 = interceptor.getCapturedFields();
    expect(copy2.find(f => f.label === 'Injected')).toBeUndefined();
  });

  it('clear() empties captured fields', async () => {
    const sfUrl = 'https://myorg.my.salesforce.com/services/data/v59.0/ui-api/records/001B';
    const body = makeSfApiResponse({ Phone: { value: '555', displayValue: null } });

    const wrappedFetch = setupInterceptedFetch(interceptor, makeResponse(body, sfUrl));
    await wrappedFetch(sfUrl);
    await new Promise(r => setTimeout(r, 0));

    expect(interceptor.getCapturedFields().length).toBeGreaterThan(0);
    interceptor.clear();
    expect(interceptor.getCapturedFields()).toEqual([]);
  });
});
