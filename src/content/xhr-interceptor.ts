import type { ScrapedField } from '../types';

/** Matches Salesforce UI API record endpoints across any API version */
const SF_UI_API_RECORDS_RE = /\/services\/data\/v[\d.]+\/ui-api\/records\//;

export class XHRInterceptor {
  private capturedFields: ScrapedField[] = [];
  private originalFetch: typeof fetch | null = null;
  private active = false;

  start(): void {
    // Guard against double-wrapping
    if (this.active) return;

    this.originalFetch = globalThis.fetch;
    const self = this;

    globalThis.fetch = async function interceptedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const response = await self.originalFetch!(input, init);

      if (SF_UI_API_RECORDS_RE.test(url)) {
        // Clone so the original response body can still be consumed by the caller
        response.clone().json().then((data: unknown) => {
          self.parseAndCapture(data);
        }).catch(() => {
          // Silently ignore parse failures (e.g. non-JSON bodies)
        });
      }

      return response;
    };

    this.active = true;
  }

  stop(): void {
    if (!this.active || this.originalFetch === null) return;
    globalThis.fetch = this.originalFetch;
    this.originalFetch = null;
    this.active = false;
  }

  getCapturedFields(): ScrapedField[] {
    return [...this.capturedFields];
  }

  clear(): void {
    this.capturedFields = [];
  }

  // ─── private ───────────────────────────────────────────────────────────────

  private parseAndCapture(data: unknown): void {
    if (!data || typeof data !== 'object') return;

    const record = data as Record<string, unknown>;

    // Top-level `fields` map (UI API record response shape)
    if (record.fields && typeof record.fields === 'object') {
      const fieldsMap = record.fields as Record<string, { value: unknown; displayValue: string | null }>;

      for (const [fieldName, fieldData] of Object.entries(fieldsMap)) {
        if (!fieldData || typeof fieldData !== 'object') continue;

        const displayValue = fieldData.displayValue;
        const rawValue = fieldData.value;

        const value =
          typeof displayValue === 'string' && displayValue !== null
            ? displayValue
            : rawValue !== null && rawValue !== undefined
              ? String(rawValue)
              : '';

        this.capturedFields.push({
          label: fieldName,
          value,
          section: 'api',
        });
      }
    }
  }
}
