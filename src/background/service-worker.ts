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

      // Get config and API keys
      const config = await getConfig();
      const personalKey = (await chrome.storage.local.get(['personal_api_key']))['personal_api_key'];
      const fallbackKey = (await chrome.storage.local.get(['fallback_api_key']))['fallback_api_key'];

      const apiKey = personalKey || fallbackKey;
      if (!apiKey) {
        await emitCrawlEvent('No API key configured. Open Settings to add one.');
        return { status: 'error', message: 'No API key configured' };
      }

      // Determine provider config
      const providerType = config.providers?.[0]?.type || 'groq';
      const providers: AIProviderConfig[] = [{
        type: providerType,
        apiKey,
        baseUrl: providerType === 'claude' ? 'https://api.anthropic.com'
          : providerType === 'groq' ? 'https://api.groq.com'
          : 'https://api.openai.com',
        model: providerType === 'claude' ? 'claude-sonnet-4-20250514'
          : providerType === 'groq' ? 'llama-3.3-70b-versatile'
          : 'gpt-4o',
      }];

      // Build the AI Council
      const aiClient = new AIProviderClient(providers);
      const fieldRegistry = await getFieldRegistry();
      const crawler = new CrawlerAgent(aiClient, fieldRegistry);
      const reviewer = new ReviewerAgent(aiClient);
      const arbiter = new ArbiterAgent(aiClient);
      const council = new AICouncil(crawler, reviewer, arbiter);

      // Create the crawl engine
      const engine = new CrawlEngine(council, config);
      activeCrawlEngine = engine;

      // Listen for events and forward to panel
      engine.onEvent(async (event: CrawlEvent) => {
        await emitCrawlEvent(event.message);
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
      } catch { /* ignore */ }

      // Create scrape and navigate functions that forward to the content script
      const scrapeFn = async () => {
        const result = await forwardToContentScript({ type: 'SCRAPE_PAGE' });
        return result;
      };
      const navigateFn = async (directive: any) => {
        const result = await forwardToContentScript({ type: 'NAVIGATE', payload: directive });
        return result?.success ?? false;
      };
      const detectSessionExpiredFn = () => false; // Will be checked via content script

      // Start the crawl (async — don't await, let it run in background)
      engine.start(seName, opportunityName, opportunityUrl, scrapeFn, navigateFn, detectSessionExpiredFn)
        .then(async (state) => {
          await emitCrawlEvent(`Analysis complete! Found ${Object.keys(state.fieldsFound).length} fields.`);
        })
        .catch(async (err) => {
          await emitCrawlEvent(`Error: ${err.message}`);
        });

      return { status: 'started' };
    }

    case 'RESUME_CRAWL': {
      return { status: 'resumed' };
    }

    case 'PAUSE_CRAWL':
      if (activeCrawlEngine) activeCrawlEngine.pause();
      return { status: 'paused' };

    case 'CANCEL_CRAWL':
      if (activeCrawlEngine) activeCrawlEngine.cancel();
      activeCrawlEngine = null;
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

async function forwardToContentScript(message: ExtensionMessage): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return chrome.tabs.sendMessage(tab.id, message);
}

async function broadcastToPanel(message: ExtensionMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Panel might not be open
  }
}

async function emitCrawlEvent(eventMessage: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'CRAWL_UPDATE',
      payload: { event: eventMessage },
    });
  } catch {
    // Panel might not be open
  }
}

async function getConfig(): Promise<CrawlConfig> {
  const result = await chrome.storage.local.get(['crawl_config']);
  return result.crawl_config || getDefaultConfig();
}

async function getFieldRegistry(): Promise<string[]> {
  // Default field registry from the WFM template
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
