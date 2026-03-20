import { AIProviderConfig } from '../types';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AllProvidersExhaustedError extends Error {
  constructor() {
    super('All AI providers exhausted after retries');
    this.name = 'AllProvidersExhaustedError';
  }
}

class AuthError extends Error {
  constructor(public readonly status: number, public readonly body?: string) {
    super(`Auth error ${status}: ${body?.substring(0, 300) || 'no details'}`);
    this.name = 'AuthError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const TRANSIENT_STATUSES = new Set([429, 500, 503]);
const AUTH_STATUSES = new Set([401, 403]);

const BACKOFF_MS = [1000, 2000, 4000];

// ---------------------------------------------------------------------------
// Default delay (real wait in production; injected in tests)
// ---------------------------------------------------------------------------

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface ParsedResponse {
  text: string;
  tokensUsed: number;
}

function parseClaude(body: Record<string, any>): ParsedResponse {
  const text: string = body.content?.[0]?.text ?? '';
  const tokensUsed: number =
    (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0);
  return { text, tokensUsed };
}

function parseOpenAILike(body: Record<string, any>): ParsedResponse {
  const text: string = body.choices?.[0]?.message?.content ?? '';
  const tokensUsed: number = body.usage?.total_tokens ?? 0;
  return { text, tokensUsed };
}

// ---------------------------------------------------------------------------
// Request formatting
// ---------------------------------------------------------------------------

interface RequestSpec {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function buildClaudeRequest(
  provider: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
): RequestSpec {
  return {
    url: `${provider.baseUrl}/v1/messages`,
    headers: {
      'x-api-key': provider.apiKey,
      'anthropic-version': '2024-10-22',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: {
      model: provider.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    },
  };
}

function buildOpenAIRequest(
  provider: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
): RequestSpec {
  return {
    url: `${provider.baseUrl}/v1/chat/completions`,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'content-type': 'application/json',
    },
    body: {
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    },
  };
}

function buildGroqRequest(
  provider: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
): RequestSpec {
  return {
    url: `${provider.baseUrl}/openai/v1/chat/completions`,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'content-type': 'application/json',
    },
    body: {
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    },
  };
}

function buildRequest(
  provider: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
): RequestSpec {
  switch (provider.type) {
    case 'claude':
      return buildClaudeRequest(provider, systemPrompt, userMessage);
    case 'openai':
      return buildOpenAIRequest(provider, systemPrompt, userMessage);
    case 'groq':
      return buildGroqRequest(provider, systemPrompt, userMessage);
  }
}

function parseResponse(
  provider: AIProviderConfig,
  body: Record<string, any>,
): ParsedResponse {
  switch (provider.type) {
    case 'claude':
      return parseClaude(body);
    case 'openai':
    case 'groq':
      return parseOpenAILike(body);
  }
}

// ---------------------------------------------------------------------------
// AIProviderClient
// ---------------------------------------------------------------------------

export class AIProviderClient {
  private providers: AIProviderConfig[];
  private delay: (ms: number) => Promise<void>;

  constructor(
    providers: AIProviderConfig[],
    delay: (ms: number) => Promise<void> = defaultDelay,
  ) {
    this.providers = providers;
    this.delay = delay;
  }

  async sendMessage(
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    for (const provider of this.providers) {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await this.callProvider(provider, systemPrompt, userMessage);
        } catch (err) {
          if (err instanceof AuthError) {
            throw err;
          }
          lastError = err as Error;
          console.error(`[AI Provider] ${provider.type} attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError.message);
          await this.delay(BACKOFF_MS[attempt]);
        }
      }
      console.error(`[AI Provider] ${provider.type} exhausted all ${MAX_RETRIES} retries. Last error:`, lastError?.message);

      // This provider exhausted all retries; move on to the next one.
      void lastError; // acknowledged
    }

    throw new AllProvidersExhaustedError();
  }

  private async callProvider(
    provider: AIProviderConfig,
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const { url, headers, body } = buildRequest(provider, systemPrompt, userMessage);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (AUTH_STATUSES.has(response.status)) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { /* ignore */ }
      throw new AuthError(response.status, errorBody);
    }

    if (!response.ok || TRANSIENT_STATUSES.has(response.status)) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { /* ignore */ }
      throw new Error(`HTTP ${response.status}: ${errorBody.substring(0, 500)}`);
    }

    const json = (await response.json()) as Record<string, any>;
    return parseResponse(provider, json);
  }
}
