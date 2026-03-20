import { ExtensionMessage } from '../types';

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Store references
let crawlEngineActive = false;

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'PING':
      return { status: 'ok' };

    case 'DETECT_MODE':
      // Forward to content script in active tab
      return forwardToContentScript(message);

    case 'START_CRAWL': {
      // message.payload: { seName: string, opportunityName: string, opportunityUrl: string }
      crawlEngineActive = true;
      // In a real implementation, this would create the CrawlEngine with providers
      // For now, acknowledge and the panel will coordinate
      return { status: 'started' };
    }

    case 'RESUME_CRAWL': {
      // message.payload: { crawlId: string }
      crawlEngineActive = true;
      return { status: 'resumed' };
    }

    case 'PAUSE_CRAWL':
      return { status: 'paused' };

    case 'CANCEL_CRAWL':
      crawlEngineActive = false;
      return { status: 'cancelled' };

    case 'SCRAPE_PAGE':
      // Forward to content script
      return forwardToContentScript({ type: 'SCRAPE_PAGE', payload: message.payload });

    case 'NAVIGATE':
      // Forward navigation directive to content script
      return forwardToContentScript({ type: 'NAVIGATE', payload: message.payload });

    case 'CRAWL_UPDATE':
      // Forward crawl progress to panel (broadcast)
      await broadcastToPanel(message);
      return { status: 'ok' };

    case 'ASK_USER':
      // Forward question to panel
      await broadcastToPanel(message);
      return { status: 'ok' };

    case 'USER_ANSWER':
      // Panel answered a question — forward to engine
      return { status: 'ok', answer: message.payload };

    case 'GENERATE_DOC': {
      // message.payload: { sessionState }
      // Load template — custom upload takes priority, otherwise use bundled
      const templateResult = await chrome.storage.local.get(['template_file']);
      const templateSource = templateResult.template_file
        ? 'custom'
        : 'bundled';
      return { status: 'generating', templateSource };
    }

    case 'GET_TEMPLATE': {
      // Return the bundled template URL for the document generator
      const customTemplate = await chrome.storage.local.get(['template_file']);
      if (customTemplate.template_file) {
        return { source: 'custom', data: customTemplate.template_file };
      }
      // Return path to bundled template
      const bundledUrl = chrome.runtime.getURL('templates/WFM Design Document Template (Cloud) v1 2025 - JS.docx');
      return { source: 'bundled', url: bundledUrl };
    }

    case 'RECRAWL_SECTION':
      // message.payload: { section: string }
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
  // Send to all extension pages (panel will pick it up)
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Panel might not be open — ignore
  }
}

function getDefaultConfig() {
  return {
    maxPages: 20,
    tokenBudget: 100000,
    navigationTimeout: 15000,
    providers: [],
    teamRoster: [
      { name: 'Jay Sanchez-Orsini', email: 'jay.sanchez-orsini@nice.com' },
    ],
    productDomains: ['WFM', 'EEM', 'Performance Management'],
  };
}
