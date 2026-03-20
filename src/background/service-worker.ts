import { ExtensionMessage, CrawlConfig, AIProviderConfig } from '../types';
import { AIProviderClient } from '../ai/providers';
import { CrawlerAgent } from '../ai/crawler-agent';
import { ReviewerAgent } from '../ai/reviewer-agent';
import { ArbiterAgent } from '../ai/arbiter-agent';
import { AICouncil } from '../ai/council';
import { CrawlEngine, CrawlEvent } from '../orchestrator/crawl-engine';

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let activeCrawlEngine: CrawlEngine | null = null;

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[SW] Message handler error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'PING':
      return { status: 'ok' };

    case 'DETECT_MODE':
      return forwardToContentScript(message);

    case 'START_CRAWL': {
      const { seName } = message.payload;
      await log(`[SF Solution Crawler v0.2.8]`);
      await log(`[1/7] START_CRAWL received for SE: ${seName}`);

      // Get config and API keys
      const config = await getConfig();
      await log(`[2/7] Config loaded: maxPages=${config.maxPages}, tokenBudget=${config.tokenBudget}`);

      const personalKeyResult = await chrome.storage.local.get(['personal_api_key']);
      const fallbackKeyResult = await chrome.storage.local.get(['fallback_api_key']);
      const personalKey = personalKeyResult['personal_api_key'];
      const fallbackKey = fallbackKeyResult['fallback_api_key'];

      const apiKey = personalKey || fallbackKey;
      if (!apiKey) {
        await log('[ERROR] No API key configured. Open Settings to add one.');
        return { status: 'error', message: 'No API key configured' };
      }
      await log(`[3/7] API key found (${personalKey ? 'personal' : 'fallback'}, ${apiKey.substring(0, 8)}...)`);

      // Determine provider config
      const providerType = config.providers?.[0]?.type || 'groq';
      const baseUrl = providerType === 'claude' ? 'https://api.anthropic.com'
        : providerType === 'groq' ? 'https://api.groq.com'
        : providerType === 'gemini' ? 'https://generativelanguage.googleapis.com'
        : 'https://api.openai.com';
      const model = providerType === 'claude' ? 'claude-sonnet-4-20250514'
        : providerType === 'groq' ? 'llama-3.3-70b-versatile'
        : providerType === 'gemini' ? 'gemini-2.0-flash'
        : 'gpt-4o';

      const providers: AIProviderConfig[] = [{
        type: providerType,
        apiKey,
        baseUrl,
        model,
      }];
      await log(`[4/7] Provider: ${providerType} | Model: ${model} | URL: ${baseUrl}`);

      // Build the AI Council (with logger that forwards to panel)
      const aiClient = new AIProviderClient(providers, undefined, (msg) => {
        log(msg); // fire-and-forget log to panel
      });
      const fieldRegistry = await getFieldRegistry();
      const crawler = new CrawlerAgent(aiClient, fieldRegistry);
      const reviewer = new ReviewerAgent(aiClient);
      const arbiter = new ArbiterAgent(aiClient);
      const council = new AICouncil(crawler, reviewer, arbiter);
      await log(`[5/7] AI Council created (${fieldRegistry.length} template fields registered)`);

      // Create the crawl engine with field registry
      const engine = new CrawlEngine(council, config, fieldRegistry);
      activeCrawlEngine = engine;

      // Listen for events and forward to panel
      engine.onEvent(async (event: CrawlEvent) => {
        await log(`[Engine/${event.type}] ${event.message}`);
      });

      // Get opportunity info from the active tab
      let opportunityName = 'Unknown Opportunity';
      let opportunityUrl = '';
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          opportunityUrl = tab.url;
          opportunityName = tab.title || 'Salesforce Opportunity';
        }
        await log(`[6/7] Tab detected: "${opportunityName}" at ${opportunityUrl.substring(0, 60)}...`);
      } catch (e: any) {
        await log(`[WARN] Could not read tab info: ${e.message}`);
      }

      // Create scrape and navigate functions
      const scrapeFn = async () => {
        await log('[Scraper] Sending SCRAPE_PAGE to content script...');
        try {
          const result = await forwardToContentScript({ type: 'SCRAPE_PAGE' });
          if (!result || result.error) {
            await log(`[Scraper ERROR] ${result?.error || 'No response from content script'}`);
            throw new Error(result?.error || 'Scrape failed - no response');
          }
          const fieldCount = result.fields?.length || 0;
          const listCount = result.relatedLists?.length || 0;
          const linkCount = result.quickLinks?.length || 0;
          await log(`[Scraper] Page scraped: ${fieldCount} fields, ${listCount} related lists, ${linkCount} quick links`);
          return result;
        } catch (e: any) {
          await log(`[Scraper ERROR] ${e.message}`);
          throw e;
        }
      };

      const navigateFn = async (directive: any) => {
        await log(`[Navigator] Navigating to: ${directive.target} (reason: ${directive.reason})`);
        try {
          const result = await forwardToContentScript({ type: 'NAVIGATE', payload: directive });
          const success = result?.success ?? false;
          await log(`[Navigator] Navigation ${success ? 'succeeded' : 'FAILED'}`);
          return success;
        } catch (e: any) {
          await log(`[Navigator ERROR] ${e.message}`);
          return false;
        }
      };

      const detectSessionExpiredFn = () => false;

      // Test the API connection with a raw fetch before starting the crawl
      await log('[7/7] Testing AI connection...');
      try {
        let testBody: any;
        let testUrl: string;
        const testHeaders: Record<string, string> = { 'content-type': 'application/json' };

        if (providerType === 'gemini') {
          testUrl = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
          testBody = { contents: [{ parts: [{ text: 'Respond with OK.' }] }], generationConfig: { maxOutputTokens: 32 } };
        } else if (providerType === 'claude') {
          testUrl = `${baseUrl}/v1/messages`;
          testBody = { model, max_tokens: 32, system: 'Respond with OK.', messages: [{ role: 'user', content: 'Test' }] };
          testHeaders['x-api-key'] = apiKey;
          testHeaders['anthropic-version'] = '2023-06-01';
          testHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
        } else if (providerType === 'groq') {
          testUrl = `${baseUrl}/openai/v1/chat/completions`;
          testBody = { model, messages: [{ role: 'system', content: 'Respond with OK.' }, { role: 'user', content: 'Test' }], max_tokens: 32 };
          testHeaders['Authorization'] = `Bearer ${apiKey}`;
        } else {
          testUrl = `${baseUrl}/v1/chat/completions`;
          testBody = { model, messages: [{ role: 'system', content: 'Respond with OK.' }, { role: 'user', content: 'Test' }], max_tokens: 32 };
          testHeaders['Authorization'] = `Bearer ${apiKey}`;
        }
        await log(`[7/7] Testing: POST ${testUrl} with model "${model}"...`);
        const testResp = await fetch(testUrl, { method: 'POST', headers: testHeaders, body: JSON.stringify(testBody) });
        const testRespBody = await testResp.text();
        if (!testResp.ok) {
          await log(`[ERROR] AI test returned HTTP ${testResp.status}: ${testRespBody.substring(0, 400)}`);
          await log(`[ERROR] Fix your API key or model in Settings and try again.`);
          return { status: 'error', message: `HTTP ${testResp.status}` };
        }
        await log(`[7/7] AI connection OK! (HTTP ${testResp.status})`);
      } catch (testErr: any) {
        await log(`[ERROR] AI connection test failed: ${testErr.message}`);
        return { status: 'error', message: testErr.message };
      }

      await log('[7/7] Starting crawl loop...');

      // Start the crawl asynchronously
      engine.start(seName, opportunityName, opportunityUrl, scrapeFn, navigateFn, detectSessionExpiredFn)
        .then(async (state) => {
          const found = Object.keys(state.fieldsFound).length;
          const remaining = state.fieldsRemaining.length;
          await log(`[COMPLETE] Analysis finished! Found ${found} fields, ${remaining} remaining. Status: ${state.status}`);
          if (found > 0) {
            await log(`[COMPLETE] Fields found:`);
            for (const [key, val] of Object.entries(state.fieldsFound)) {
              await log(`  ${key} = "${val.value}" (${val.confidence} confidence)`);
            }
          }
          if (state.status === 'paused' && Object.keys(state.fieldsFound).length === 0) {
            await log(`[WARN] Crawl paused with no fields found. Common causes:`);
            await log(`  - API key invalid or expired`);
            await log(`  - API rate limit hit`);
            await log(`  - Content script not injected (try refreshing the Salesforce page)`);
          }
        })
        .catch(async (err) => {
          await log(`[FATAL ERROR] Crawl failed: ${err.message}`);
          await log(`[FATAL ERROR] Stack: ${err.stack?.substring(0, 300) || 'no stack'}`);
        });

      return { status: 'started' };
    }

    case 'RESUME_CRAWL':
      return { status: 'resumed' };

    case 'PAUSE_CRAWL':
      if (activeCrawlEngine) activeCrawlEngine.pause();
      await log('[Engine] Crawl paused by user');
      return { status: 'paused' };

    case 'CANCEL_CRAWL':
      if (activeCrawlEngine) activeCrawlEngine.cancel();
      activeCrawlEngine = null;
      await log('[Engine] Crawl cancelled by user');
      return { status: 'cancelled' };

    case 'SCRAPE_PAGE':
      return forwardToContentScript({ type: 'SCRAPE_PAGE', payload: message.payload });

    case 'NAVIGATE':
      return forwardToContentScript({ type: 'NAVIGATE', payload: message.payload });

    case 'CRAWL_UPDATE':
      await broadcastToPanel(message);
      return { status: 'ok' };

    case 'ASK_USER':
      await broadcastToPanel(message);
      return { status: 'ok' };

    case 'USER_ANSWER':
      return { status: 'ok', answer: message.payload };

    case 'GENERATE_DOC': {
      const customTemplate = await chrome.storage.local.get(['template_file']);
      const templateSource = customTemplate.template_file ? 'custom' : 'bundled';
      return { status: 'generating', templateSource };
    }

    case 'GET_TEMPLATE': {
      const customTemplate = await chrome.storage.local.get(['template_file']);
      if (customTemplate.template_file) {
        return { source: 'custom', data: customTemplate.template_file };
      }
      const bundledUrl = chrome.runtime.getURL('templates/WFM Design Document Template (Cloud) v1 2025 - JS.docx');
      return { source: 'bundled', url: bundledUrl };
    }

    case 'RECRAWL_SECTION':
      return forwardToContentScript({ type: 'SCRAPE_PAGE', payload: message.payload });

    case 'GET_SETTINGS': {
      const result = await chrome.storage.local.get(['crawl_config']);
      return result.crawl_config || getDefaultConfig();
    }

    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ crawl_config: message.payload });
      return { status: 'saved' };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// Log to both console AND the panel activity log
async function log(message: string): Promise<void> {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);
  try {
    await chrome.runtime.sendMessage({
      type: 'CRAWL_UPDATE',
      payload: { event: formatted },
    });
  } catch {
    // Panel might not be open
  }
}

async function forwardToContentScript(message: ExtensionMessage): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    await log('[ERROR] No active tab found — cannot communicate with content script');
    throw new Error('No active tab found');
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e: any) {
    await log(`[ERROR] Content script communication failed: ${e.message}`);
    throw e;
  }
}

async function broadcastToPanel(message: ExtensionMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Panel might not be open
  }
}

async function getConfig(): Promise<CrawlConfig> {
  const result = await chrome.storage.local.get(['crawl_config']);
  return result.crawl_config || getDefaultConfig();
}

async function getFieldRegistry(): Promise<string[]> {
  return [
    '[Licensed Agents]',
    '[Purchased Date]',
    '[Target Go Live Date]',
    '[Enhanced Strategic Planner]',
    '[AI Forecasting]',
    '[GDPR Compliance]',
    '[Disaster Recovery]',
    '[Existing WFM Version]',
    '[Current Licensed Agents]',
    '[ACD Information (Vendor)]',
    '[ACD Model/Version]',
    '[ACD Interval]',
    '[Employee Engagement Manager]',
    '[Environment]',
    '[Tenant No.]',
    '[ACS Required]',
    '[3rd Party Vendor Requirement]',
    '[Smart Sync]',
    '[Intended Use]',
  ];
}

function getDefaultConfig(): CrawlConfig {
  return {
    maxPages: 20,
    tokenBudget: 100000,
    navigationTimeout: 15000,
    providers: [
      { type: 'groq', apiKey: '', baseUrl: 'https://api.groq.com', model: 'llama-3.3-70b-versatile' },
    ],
    teamRoster: [
      { name: 'Jay Sanchez-Orsini', email: 'jay.sanchez-orsini@nice.com' },
    ],
    productDomains: ['WFM', 'EEM', 'Performance Management'],
  };
}
