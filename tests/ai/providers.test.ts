import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AIProviderClient, AllProvidersExhaustedError } from '../../src/ai/providers';
import { AIProviderConfig } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(type: AIProviderConfig['type'], overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  const defaults: Record<AIProviderConfig['type'], AIProviderConfig> = {
    claude: { type: 'claude', apiKey: 'sk-claude', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
    openai: { type: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
    groq:   { type: 'groq',   apiKey: 'sk-groq',   baseUrl: 'https://api.groq.com',    model: 'llama3-70b-8192' },
  };
  return { ...defaults[type], ...overrides };
}

/** Build a Response-like object that fetch resolves to. */
function mockResponse(status: number, body: object): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Claude-shaped success body. */
const claudeSuccess = {
  content: [{ text: 'Hello from Claude' }],
  usage: { input_tokens: 10, output_tokens: 20 },
};

/** OpenAI-shaped success body. */
const openaiSuccess = {
  choices: [{ message: { content: 'Hello from OpenAI' } }],
  usage: { total_tokens: 30 },
};

/** Groq-shaped success body (same as OpenAI). */
const groqSuccess = {
  choices: [{ message: { content: 'Hello from Groq' } }],
  usage: { total_tokens: 25 },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AIProviderClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockDelay: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Delay is injected so tests don't actually sleep.
    mockDelay = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper that creates a client with the injected delay.
  function makeClient(providers: AIProviderConfig[]): AIProviderClient {
    return new AIProviderClient(providers, mockDelay);
  }

  // -------------------------------------------------------------------------
  // 1. Successful message send
  // -------------------------------------------------------------------------
  it('returns text and tokensUsed on a successful Claude response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, claudeSuccess));

    const client = makeClient([makeProvider('claude')]);
    const result = await client.sendMessage('system prompt', 'user message');

    expect(result.text).toBe('Hello from Claude');
    expect(result.tokensUsed).toBe(30); // 10 + 20
  });

  // -------------------------------------------------------------------------
  // 2. Retry on 429 with exponential backoff
  // -------------------------------------------------------------------------
  it('retries on 429 and succeeds on the third attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(429, { error: 'rate limit' }))
      .mockResolvedValueOnce(mockResponse(429, { error: 'rate limit' }))
      .mockResolvedValueOnce(mockResponse(200, claudeSuccess));

    const client = makeClient([makeProvider('claude')]);
    const result = await client.sendMessage('sys', 'usr');

    expect(result.text).toBe('Hello from Claude');
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Exponential backoff: 1s then 2s
    expect(mockDelay).toHaveBeenCalledTimes(2);
    expect(mockDelay).toHaveBeenNthCalledWith(1, 1000);
    expect(mockDelay).toHaveBeenNthCalledWith(2, 2000);
  });

  // -------------------------------------------------------------------------
  // 3. Retry on 500
  // -------------------------------------------------------------------------
  it('retries on 500 and succeeds on the second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }))
      .mockResolvedValueOnce(mockResponse(200, claudeSuccess));

    const client = makeClient([makeProvider('claude')]);
    const result = await client.sendMessage('sys', 'usr');

    expect(result.text).toBe('Hello from Claude');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockDelay).toHaveBeenCalledTimes(1);
    expect(mockDelay).toHaveBeenCalledWith(1000);
  });

  // -------------------------------------------------------------------------
  // 4. Immediate failure on 401
  // -------------------------------------------------------------------------
  it('throws immediately on 401 without retrying or falling back', async () => {
    mockFetch.mockResolvedValue(mockResponse(401, { error: 'unauthorized' }));

    const client = makeClient([makeProvider('claude'), makeProvider('openai')]);

    await expect(client.sendMessage('sys', 'usr')).rejects.toThrow('401');

    // Should have tried exactly once — no retries, no fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockDelay).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Immediate failure on 403
  // -------------------------------------------------------------------------
  it('throws immediately on 403 without retrying or falling back', async () => {
    mockFetch.mockResolvedValue(mockResponse(403, { error: 'forbidden' }));

    const client = makeClient([makeProvider('openai'), makeProvider('groq')]);

    await expect(client.sendMessage('sys', 'usr')).rejects.toThrow('403');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockDelay).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Fallback to next provider after 3 failures
  // -------------------------------------------------------------------------
  it('falls back to the next provider after 3 transient failures', async () => {
    // First provider fails 3 times with 503
    mockFetch
      .mockResolvedValueOnce(mockResponse(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(mockResponse(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(mockResponse(503, { error: 'unavailable' }))
      // Second provider succeeds on first try
      .mockResolvedValueOnce(mockResponse(200, openaiSuccess));

    const client = makeClient([makeProvider('claude'), makeProvider('openai')]);
    const result = await client.sendMessage('sys', 'usr');

    expect(result.text).toBe('Hello from OpenAI');
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // 3 retries for first provider: delays at 1s, 2s, 4s
    expect(mockDelay).toHaveBeenCalledTimes(3);
    expect(mockDelay).toHaveBeenNthCalledWith(1, 1000);
    expect(mockDelay).toHaveBeenNthCalledWith(2, 2000);
    expect(mockDelay).toHaveBeenNthCalledWith(3, 4000);
  });

  // -------------------------------------------------------------------------
  // 7. AllProvidersExhaustedError when all providers fail
  // -------------------------------------------------------------------------
  it('throws AllProvidersExhaustedError when all providers exhaust their retries', async () => {
    // Both providers always return 503
    mockFetch.mockResolvedValue(mockResponse(503, { error: 'unavailable' }));

    const client = makeClient([makeProvider('claude'), makeProvider('openai')]);

    await expect(client.sendMessage('sys', 'usr')).rejects.toThrow(AllProvidersExhaustedError);
    await expect(client.sendMessage('sys', 'usr')).rejects.toThrow('All AI providers exhausted after retries');
  });

  // -------------------------------------------------------------------------
  // 8. Correct request format for Claude
  // -------------------------------------------------------------------------
  it('sends correct request format for Claude provider', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, claudeSuccess));

    const provider = makeProvider('claude', {
      apiKey: 'my-claude-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-5-sonnet-20241022',
    });
    const client = makeClient([provider]);
    await client.sendMessage('You are helpful.', 'Tell me about SF');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('my-claude-key');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBeTruthy();
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-3-5-sonnet-20241022');
    expect(body.system).toBe('You are helpful.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Tell me about SF' }]);
  });

  // -------------------------------------------------------------------------
  // 9. Correct request format for OpenAI
  // -------------------------------------------------------------------------
  it('sends correct request format for OpenAI provider', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, openaiSuccess));

    const provider = makeProvider('openai', {
      apiKey: 'my-openai-key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    });
    const client = makeClient([provider]);
    await client.sendMessage('You are helpful.', 'Tell me about SF');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-openai-key');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Tell me about SF' },
    ]);
  });

  // -------------------------------------------------------------------------
  // 10. Correct request format for Groq
  // -------------------------------------------------------------------------
  it('sends correct request format for Groq provider', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, groqSuccess));

    const provider = makeProvider('groq', {
      apiKey: 'my-groq-key',
      baseUrl: 'https://api.groq.com',
      model: 'llama3-70b-8192',
    });
    const client = makeClient([provider]);
    await client.sendMessage('You are helpful.', 'Tell me about SF');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-groq-key');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('llama3-70b-8192');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Tell me about SF' },
    ]);
  });

  // -------------------------------------------------------------------------
  // 11. tokensUsed returned correctly from OpenAI response
  // -------------------------------------------------------------------------
  it('returns tokensUsed from OpenAI response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, openaiSuccess));

    const client = makeClient([makeProvider('openai')]);
    const result = await client.sendMessage('sys', 'usr');

    expect(result.tokensUsed).toBe(30); // openaiSuccess.usage.total_tokens
  });

  // -------------------------------------------------------------------------
  // 12. tokensUsed returned correctly from Groq response
  // -------------------------------------------------------------------------
  it('returns tokensUsed from Groq response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, groqSuccess));

    const client = makeClient([makeProvider('groq')]);
    const result = await client.sendMessage('sys', 'usr');

    expect(result.tokensUsed).toBe(25); // groqSuccess.usage.total_tokens
  });
});
