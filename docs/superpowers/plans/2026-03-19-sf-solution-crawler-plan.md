# SF Solution Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered Chrome extension that crawls Salesforce opportunities and generates NICE WFM Solution Design Documents.

**Architecture:** Manifest V3 Chrome extension with React side panel, TypeScript content scripts for DOM scraping, multi-provider AI council (Crawler/Reviewer/Arbiter agents), and docxtemplater-based document generation. All state managed via chrome.storage.local.

**Tech Stack:** TypeScript, React, Vite, Manifest V3, docxtemplater, chrome.storage.local

**Spec:** `docs/superpowers/specs/2026-03-19-sf-solution-crawler-design.md`

---

## File Structure

```
sf-solution-crawler/
├── manifest.json                          # Manifest V3 config
├── package.json                           # Dependencies and build scripts
├── tsconfig.json                          # TypeScript config
├── vite.config.ts                         # Vite build config
├── templates/                             # User-provided .docx templates
│   └── WFM Design Document Template (Cloud) v1 2025 - JS.docx
├── src/
│   ├── types/                             # Shared TypeScript types
│   │   └── index.ts                       # All interfaces: SessionState, PageData, PageContext, NavigationDirective, FieldMap, etc.
│   ├── background/
│   │   └── service-worker.ts              # Extension service worker — message routing, storage orchestration
│   ├── content/
│   │   ├── index.ts                       # Content script entry point — imports and wires scraper, navigator, detector
│   │   ├── scraper.ts                     # DOM scraping — Lightning & Classic field/value extraction
│   │   ├── xhr-interceptor.ts             # Intercepts Salesforce XHR/fetch for structured record data
│   │   ├── navigator.ts                   # SPA-aware navigation — click, wait, confirm arrival
│   │   └── detector.ts                    # Auto-detect Lightning vs Classic mode
│   ├── ai/
│   │   ├── providers.ts                   # Multi-provider API client (Claude, Groq, OpenAI) with retry/fallback
│   │   ├── prompts.ts                     # System prompts for Crawler, Reviewer, Arbiter agents
│   │   ├── crawler-agent.ts               # Crawler agent — analyze page, extract fields, decide next nav
│   │   ├── reviewer-agent.ts              # Reviewer agent — validate extractions, grade confidence
│   │   ├── arbiter-agent.ts               # Arbiter agent — resolve conflicts, decide completion
│   │   └── council.ts                     # Orchestrates the 3-agent flow per page
│   ├── docgen/
│   │   ├── template-parser.ts             # Parse .docx template, extract/normalize bracketed fields
│   │   └── generator.ts                   # Populate template with field map, handle conditionals/tables
│   ├── storage/
│   │   └── state.ts                       # chrome.storage.local wrapper — save/load/cleanup session state
│   ├── panel/
│   │   ├── index.html                     # Side panel HTML entry
│   │   ├── App.tsx                        # Root React component — screen router
│   │   ├── screens/
│   │   │   ├── StartScreen.tsx            # SE selection, opportunity detection, start/resume
│   │   │   ├── CrawlScreen.tsx            # Live log, progress, Q&A cards, pause/cancel
│   │   │   ├── ReviewScreen.tsx           # Field review with confidence colors, inline editing
│   │   │   └── DownloadScreen.tsx         # Preview, download .docx, re-generate
│   │   ├── components/
│   │   │   ├── ActivityLog.tsx            # Scrolling log of crawl events
│   │   │   ├── ProgressBar.tsx            # Template fields filled vs remaining
│   │   │   ├── QACard.tsx                 # Question card with input for SE answers
│   │   │   ├── FieldReviewItem.tsx        # Single field with confidence badge + edit
│   │   │   └── SettingsModal.tsx          # API keys, team roster, template upload
│   │   └── hooks/
│   │       ├── useCrawlState.ts           # React hook for live crawl state from storage
│   │       └── useMessaging.ts            # React hook for chrome.runtime messaging
│   └── orchestrator/
│       └── crawl-engine.ts                # Main crawl loop — coordinates scraper, council, UI updates, state persistence
├── tests/
│   ├── ai/
│   │   ├── providers.test.ts
│   │   ├── crawler-agent.test.ts
│   │   ├── reviewer-agent.test.ts
│   │   ├── arbiter-agent.test.ts
│   │   └── council.test.ts
│   ├── content/
│   │   ├── scraper.test.ts
│   │   ├── xhr-interceptor.test.ts
│   │   ├── navigator.test.ts
│   │   └── detector.test.ts
│   ├── panel/
│   │   ├── StartScreen.test.tsx
│   │   ├── CrawlScreen.test.tsx
│   │   ├── ReviewScreen.test.tsx
│   │   └── DownloadScreen.test.tsx
│   ├── docgen/
│   │   ├── template-parser.test.ts
│   │   └── generator.test.ts
│   ├── storage/
│   │   └── state.test.ts
│   └── orchestrator/
│       └── crawl-engine.test.ts
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-03-19-sf-solution-crawler-design.md
        └── plans/
            └── 2026-03-19-sf-solution-crawler-plan.md
```

---

## Task 1: Project Scaffold & Build System

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.json`, `src/types/index.ts`, `src/background/service-worker.ts`, `src/content/detector.ts`, `src/panel/index.html`, `src/panel/App.tsx`

- [ ] **Step 1: Initialize project**

```bash
cd "/Users/jsanchezorsini/Desktop/CLAUDE DIRECTORY/sf-solution-crawler"
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom docxtemplater pizzip file-saver
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom @types/chrome @types/file-saver vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create vite.config.ts**

Multi-entry Vite config that builds: service worker, content script, and side panel as separate bundles.

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/panel/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "SF Solution Crawler",
  "version": "0.1.0",
  "description": "AI-powered Salesforce opportunity crawler for generating NICE WFM Solution Design Documents",
  "permissions": ["storage", "activeTab", "sidePanel"],
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.lightning.force.com/*"
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.salesforce.com/*",
        "https://*.force.com/*",
        "https://*.lightning.force.com/*"
      ],
      "js": ["content.js"]
    }
  ],
  "side_panel": {
    "default_path": "panel.html"
  },
  "action": {
    "default_title": "SF Solution Crawler"
  }
}
```

- [ ] **Step 6: Create shared types**

Create `src/types/index.ts` with all interfaces from the spec: `SessionState`, `PageData`, `ScrapedField`, `RelatedList`, `QuickLink`, `NavigationDirective`, `FieldMapEntry`, `FieldMap`, `ConditionalSections`, `GeneratorInput`, `CrawlConfig`, `AIProviderConfig`.

- [ ] **Step 7: Create minimal service worker**

```typescript
// src/background/service-worker.ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok' });
  }
  return true;
});
```

- [ ] **Step 8: Create content script entry point and detector**

```typescript
// src/content/detector.ts
export function detectUIMode(): 'lightning' | 'classic' {
  const hasLightning = document.querySelector('[class*="lightning"], lightning-page, force-record-layout-section');
  return hasLightning ? 'lightning' : 'classic';
}
```

```typescript
// src/content/index.ts — entry point that bundles all content modules
import { detectUIMode } from './detector';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECT_MODE') {
    sendResponse({ mode: detectUIMode() });
  }
  return true;
});
```

- [ ] **Step 9: Create minimal React panel**

Create `src/panel/index.html` and `src/panel/App.tsx` showing "SF Solution Crawler" heading and a placeholder screen.

- [ ] **Step 10: Verify build**

```bash
npx vite build
```

Expected: `dist/` folder with `service-worker.js`, `content.js`, `panel.html` and associated assets.

- [ ] **Step 11: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Chrome extension with Manifest V3, Vite, React, TypeScript"
```

---

## Task 2: Shared Types & Storage Layer

**Files:**
- Create: `src/types/index.ts` (full version), `src/storage/state.ts`, `tests/storage/state.test.ts`

- [ ] **Step 1: Write full shared types**

All interfaces from the spec Section 2 (message contracts) and Section 3.4 (session state). Include:
- `SessionState` — the central crawl state object
- `PageData` — scraper output per page
- `ScrapedField`, `RelatedList`, `QuickLink`
- `NavigationDirective` — AI → scraper commands
- `FieldMapEntry` — value + confidence + source + evidence + verdicts
- `GeneratorInput` — AI → document generator
- `AcdEnvironment`, `SmartSyncIntegration` — table row types
- `PageContext` — URL, title, breadcrumb, uiMode for current page
- `AIProviderConfig`, `CrawlConfig`

- [ ] **Step 2: Write failing test for state.ts**

```typescript
// tests/storage/state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../src/storage/state';

// Mock chrome.storage.local
const mockStorage: Record<string, any> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys) => Promise.resolve(
        Object.fromEntries(Object.entries(mockStorage).filter(([k]) => keys.includes(k)))
      )),
      set: vi.fn((items) => { Object.assign(mockStorage, items); return Promise.resolve(); }),
      remove: vi.fn((keys) => { keys.forEach((k: string) => delete mockStorage[k]); return Promise.resolve(); }),
    },
  },
});

describe('StateManager', () => {
  beforeEach(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); });

  it('creates a new session state', async () => {
    const state = await StateManager.createSession('John Doe', 'Acme WFM Deal', 'https://sf.com/opp/123');
    expect(state.seName).toBe('John Doe');
    expect(state.status).toBe('crawling');
    expect(state.fieldsRemaining.length).toBeGreaterThan(0);
  });

  it('saves and loads session state', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    await StateManager.save(state);
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded?.seName).toBe('Jane');
  });

  it('detects interrupted sessions', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    state.status = 'crawling';
    await StateManager.save(state);
    const interrupted = await StateManager.getInterruptedSession();
    expect(interrupted?.crawlId).toBe(state.crawlId);
  });

  it('cleans up stale sessions older than 24h', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    state.lastUpdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await StateManager.save(state);
    await StateManager.cleanupStale();
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/storage/state.test.ts
```

- [ ] **Step 4: Implement StateManager**

`src/storage/state.ts` — `createSession()`, `save()`, `load()`, `getInterruptedSession()`, `cleanupStale()`, `delete()`. Uses `chrome.storage.local` with key prefix `crawl_session_`.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/storage/state.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/types/ src/storage/ tests/storage/
git commit -m "feat: add shared types and chrome.storage.local state manager"
```

---

## Task 3: DOM Scraper — Lightning & Classic

**Files:**
- Create: `src/content/scraper.ts`, `tests/content/scraper.test.ts`

- [ ] **Step 1: Write failing tests for scraper**

Test both Lightning and Classic extraction with mock DOM fragments:
- `extractFieldsLightning()` — mock `lightning-output-field` elements with labels/values
- `extractFieldsClassic()` — mock `<table class="detailList">` with `<td>` label/value pairs
- `extractRelatedLists()` — mock related list tables
- `extractQuickLinks()` — mock sidebar links
- `extractPageContext()` — mock breadcrumb and page title

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/scraper.test.ts
```

- [ ] **Step 3: Implement scraper.ts**

Functions:
- `scrapePage(): PageData` — entry point, calls detectUIMode then appropriate extractors
- `extractFieldsLightning(root: Element): ScrapedField[]`
- `extractFieldsClassic(root: Element): ScrapedField[]`
- `extractRelatedLists(): RelatedList[]`
- `extractQuickLinks(): QuickLink[]`
- `extractPageContext(): PageContext`
- `extractNotes(): string[]`

Each function uses `querySelectorAll` with appropriate selectors. Lightning mode reads `lightning-output-field`, `records-highlights-details`, `force-record-layout-section`. Classic mode reads `detailList` tables and `relatedListElement` divs.

- [ ] **Step 3b: Implement xhr-interceptor.ts**

Secondary scraping strategy for Lightning closed shadow DOMs. Intercepts `fetch` and `XMLHttpRequest` to capture Salesforce UI API responses (e.g., `/services/data/vXX.X/ui-api/records/`). Parses JSON responses to extract structured field/value data. Returns `ScrapedField[]` to supplement DOM-based extraction.

```typescript
// src/content/xhr-interceptor.ts
export class XHRInterceptor {
  private capturedData: ScrapedField[] = [];

  start(): void { /* monkey-patch fetch/XHR to capture responses matching SF API patterns */ }
  stop(): void { /* restore original fetch/XHR */ }
  getCapturedFields(): ScrapedField[] { return this.capturedData; }
}
```

- [ ] **Step 3c: Write test for xhr-interceptor**

Test that intercepted fetch responses with SF record data are parsed into ScrapedField format.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content/scraper.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/content/scraper.ts tests/content/scraper.test.ts
git commit -m "feat: add DOM scraper with Lightning and Classic mode support"
```

---

## Task 4: SPA-Aware Navigator

**Files:**
- Create: `src/content/navigator.ts`, `tests/content/navigator.test.ts`

- [ ] **Step 1: Write failing tests**

- `navigateTo()` — given a NavigationDirective, clicks the right element and resolves when page stabilizes
- `waitForPageStable()` — resolves when no DOM mutations for 2 seconds and no pending XHR
- `findNavigationTarget()` — finds element by CSS selector, link text, or URL match
- `detectSessionExpiration()` — returns true if page redirected to Salesforce login URL

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/navigator.test.ts
```

- [ ] **Step 3: Implement navigator.ts**

- `navigateTo(directive: NavigationDirective): Promise<boolean>` — find target, snapshot DOM hash, click, wait for stable, verify arrival
- `waitForPageStable(timeout: number): Promise<void>` — MutationObserver + XHR tracking + URL change detection
- `findNavigationTarget(target: string): HTMLElement | null` — try CSS selector first, then link text match, then href match
- `hashDOMSnapshot(): string` — quick hash of document body for change detection

15-second timeout with one retry as per spec.

- `detectSessionExpiration(): boolean` — checks if current URL matches Salesforce login patterns (`/login`, `/secur/frontdoor.jsp`, etc.). Returns true if session expired so the crawl engine can pause and prompt re-auth.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content/navigator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/content/navigator.ts tests/content/navigator.test.ts
git commit -m "feat: add SPA-aware navigator with MutationObserver stabilization"
```

---

## Task 5: AI Provider Layer with Retry/Fallback

**Files:**
- Create: `src/ai/providers.ts`, `tests/ai/providers.test.ts`

- [ ] **Step 1: Write failing tests**

- `sendMessage()` — sends prompt to configured provider, returns response text
- Retry on 429/500/503 with exponential backoff (mock fetch to return errors then success)
- Fallback to next provider after 3 failures
- Immediate failure on 401/403
- When all providers exhausted: throws `AllProvidersExhaustedError` (crawl engine catches this to pause crawl and notify SE)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/ai/providers.test.ts
```

- [ ] **Step 3: Implement providers.ts**

```typescript
export class AIProviderClient {
  private providers: AIProviderConfig[];
  private currentIndex: number = 0;

  constructor(providers: AIProviderConfig[]) { this.providers = providers; }

  async sendMessage(systemPrompt: string, userMessage: string): Promise<string> {
    // Try each provider with retry logic
    // Exponential backoff: 1s, 2s, 4s for transient errors
    // Fallback to next provider after 3 retries
    // Throw on auth errors immediately
  }
}
```

Support three provider formats:
- Claude: `POST /v1/messages` with `x-api-key` header
- OpenAI: `POST /v1/chat/completions` with `Authorization: Bearer` header
- Groq: `POST /openai/v1/chat/completions` with `Authorization: Bearer` header

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ai/providers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers.ts tests/ai/providers.test.ts
git commit -m "feat: add multi-provider AI client with retry and fallback"
```

---

## Task 6: Template Parser & Field Registry

**Files:**
- Create: `src/docgen/template-parser.ts`, `tests/docgen/template-parser.test.ts`

- [ ] **Step 1: Write failing tests**

- `parseTemplate()` — loads .docx, extracts all bracketed fields
- `normalizeField()` — trims spaces, fixes missing brackets (`Disaster Recovery ]` → `[Disaster Recovery]`)
- `buildFieldRegistry()` — deduplicates, returns unique field list
- `identifyConditionalSections()` — finds `[[If it's a New Business...]]` and `[[If it's a migration...]]` markers
- `identifyNoteSections()` — finds `NOTE – REMOVE PRIOR TO PUBLISHING` blocks

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/docgen/template-parser.test.ts
```

- [ ] **Step 3: Implement template-parser.ts**

Uses `docxtemplater` + `PizZip` to load the .docx. Walks all paragraphs and table cells. Regex `\[([^\]]+)\]` to find bracketed fields. Normalization logic for known issues. Returns structured `TemplateAnalysis` object.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/docgen/template-parser.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/docgen/template-parser.ts tests/docgen/template-parser.test.ts
git commit -m "feat: add template parser with field extraction and normalization"
```

---

## Task 7: AI Agent Prompts

**Files:**
- Create: `src/ai/prompts.ts`

- [ ] **Step 1: Write Crawler Agent system prompt**

Include:
- Role description: "You are analyzing a Salesforce page to find data for a NICE WFM Solution Design Document"
- The field registry (injected dynamically)
- Field semantic descriptions (e.g., `[ACD Interval]` = time interval for ACD data collection)
- Product domain knowledge: WFM, EEM, NPM, CXone Performance Manager
- Output format: JSON with `extractedFields` array and `nextNavigation` directive
- Instructions to use context clues from opportunity name, product names, SKUs

- [ ] **Step 2: Write Reviewer Agent system prompt**

Include:
- Role: validate extractions against raw page content
- Input: Crawler's extractions + raw scraped text
- Output: JSON with confidence grades per field (high/medium/low) and reasoning
- Instructions to check for hallucination by cross-referencing raw evidence

- [ ] **Step 3: Write Arbiter Agent system prompt**

Include:
- Role: final decision maker
- Input: Crawler extractions + Reviewer grades + session state
- Output: JSON with accept/reject/askUser per field, deployment type determination, product section decisions, completion assessment
- Migration vs. New Business signal definitions
- Completion threshold logic

- [ ] **Step 4: Commit**

```bash
git add src/ai/prompts.ts
git commit -m "feat: add domain-aware system prompts for Crawler, Reviewer, Arbiter agents"
```

---

## Task 8: Crawler Agent

**Files:**
- Create: `src/ai/crawler-agent.ts`, `tests/ai/crawler-agent.test.ts`

- [ ] **Step 1: Write failing tests**

- Given scraped page data and session state, returns extracted fields and next navigation
- Correctly maps Salesforce field labels to template fields
- Returns `done` action when all fields found
- Returns `askUser` when data is ambiguous

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/ai/crawler-agent.test.ts
```

- [ ] **Step 3: Implement crawler-agent.ts**

```typescript
export class CrawlerAgent {
  constructor(private aiClient: AIProviderClient, private fieldRegistry: string[]) {}

  async analyze(pageData: PageData, sessionState: SessionState): Promise<CrawlerResult> {
    const prompt = buildCrawlerPrompt(this.fieldRegistry);
    const userMsg = JSON.stringify({ pageData, fieldsRemaining: sessionState.fieldsRemaining, pagesVisited: sessionState.pagesVisited });
    const response = await this.aiClient.sendMessage(prompt, userMsg);
    return parseCrawlerResponse(response);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ai/crawler-agent.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/ai/crawler-agent.ts tests/ai/crawler-agent.test.ts
git commit -m "feat: add Crawler agent for page analysis and field extraction"
```

---

## Task 9: Reviewer Agent

**Files:**
- Create: `src/ai/reviewer-agent.ts`, `tests/ai/reviewer-agent.test.ts`

- [ ] **Step 1: Write failing tests**

- Grades high confidence when extraction clearly matches raw text
- Grades low confidence when extracted value not found in raw text (hallucination detection)
- Grades medium confidence for plausible but uncertain matches
- Processes batch of fields from one page

- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement reviewer-agent.ts**

Same pattern as Crawler — takes AIProviderClient, sends structured prompt with extractions + raw page text, parses graded response.

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/ai/reviewer-agent.ts tests/ai/reviewer-agent.test.ts
git commit -m "feat: add Reviewer agent for extraction validation and confidence grading"
```

---

## Task 10: Arbiter Agent

**Files:**
- Create: `src/ai/arbiter-agent.ts`, `tests/ai/arbiter-agent.test.ts`

- [ ] **Step 1: Write failing tests**

- Accepts high-confidence Reviewer-approved fields
- Rejects low-confidence fields and generates user questions
- Determines deployment type from signals (migration keywords, existing version fields)
- Determines product sections to include
- Decides crawl completion (>60% critical fields = can generate with warning)
- When token budget is near limit: prioritizes unfilled critical fields, returns directive to stop crawling non-essential pages
- When multiple values found for a field: returns `askUser` with a disambiguation question listing the options

- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement arbiter-agent.ts**
- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/ai/arbiter-agent.ts tests/ai/arbiter-agent.test.ts
git commit -m "feat: add Arbiter agent for conflict resolution and completion decisions"
```

---

## Task 11: AI Council Orchestrator

**Files:**
- Create: `src/ai/council.ts`, `tests/ai/council.test.ts`

- [ ] **Step 1: Write failing tests**

- `processPage()` — runs Crawler → Reviewer → Arbiter pipeline for one page
- Updates session state with accepted fields
- Returns navigation directive or user question or completion signal
- Tracks token usage across all agent calls

- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement council.ts**

```typescript
export class AICouncil {
  constructor(
    private crawler: CrawlerAgent,
    private reviewer: ReviewerAgent,
    private arbiter: ArbiterAgent,
  ) {}

  async processPage(pageData: PageData, state: SessionState): Promise<CouncilResult> {
    const crawlerResult = await this.crawler.analyze(pageData, state);
    const reviewerResult = await this.reviewer.validate(crawlerResult.extractedFields, pageData);
    const arbiterResult = await this.arbiter.decide(crawlerResult, reviewerResult, state);
    return arbiterResult;
  }

  async finalReview(state: SessionState): Promise<FinalReviewResult> {
    return this.arbiter.holisticReview(state);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/ai/council.ts tests/ai/council.test.ts
git commit -m "feat: add AI Council orchestrating Crawler-Reviewer-Arbiter pipeline"
```

---

## Task 12: Document Generator

**Files:**
- Create: `src/docgen/generator.ts`, `tests/docgen/generator.test.ts`

- [ ] **Step 1: Write failing tests**

- `generateDocument()` — given field map + template, produces populated .docx as Blob
- Replaces bracketed fields with values
- Handles conditional sections (removes New Business OR Migration section)
- Strips NOTE-REMOVE blocks
- Populates revision history table
- Fills ACD table with dynamic rows
- Fills SmartSync table with dynamic rows
- Marks unfound fields as `[NEEDS INPUT]`
- Populates WFM NICE Connectors table with PM data (NPM, CXone Performance Manager) as Yes/No flags within the connectors table, not as a standalone section

- [ ] **Step 2: Run tests, verify fail**

```bash
npx vitest run tests/docgen/generator.test.ts
```

- [ ] **Step 3: Implement generator.ts**

Uses `docxtemplater` with custom `[` `]` delimiters. Pre-processes template to:
1. Normalize malformed brackets
2. Convert dynamic table rows to loop constructs
3. Remove conditional section markers and content based on `conditionalSections`
4. Strip NOTE-REMOVE blocks

Then runs docxtemplater with the field map. Finally populates revision history.

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/docgen/generator.ts tests/docgen/generator.test.ts
git commit -m "feat: add document generator with template population and conditional sections"
```

---

## Task 13: Side Panel — Start Screen

**Files:**
- Create: `src/panel/screens/StartScreen.tsx`, `src/panel/components/SettingsModal.tsx`, `src/panel/hooks/useMessaging.ts`, `src/panel/hooks/useCrawlState.ts`

- [ ] **Step 1: Implement useMessaging hook**

Wraps `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` for React.

- [ ] **Step 2: Implement useCrawlState hook**

Subscribes to `chrome.storage.onChanged` to get live session state updates.

- [ ] **Step 3: Implement StartScreen**

- SE name dropdown (from `chrome.storage.local` team roster)
- Opportunity name detection (sends message to content script to read page title)
- Start Analysis button
- Resume button (checks for interrupted session via StateManager)
- Settings gear → opens SettingsModal

- [ ] **Step 4: Implement SettingsModal**

- API provider selection + key input (personal key)
- Fallback key input
- Team roster editor (add/remove names)
- Product domains editor (default: WFM, EEM, Performance Management; add/remove)
- Template upload (.docx file picker) — on upload: calls `templateParser.parseTemplate()` to rebuild field registry and displays summary of discovered fields to admin

- [ ] **Step 5: Update App.tsx with screen routing**

Simple state machine: `start` → `crawling` → `review` → `download`

- [ ] **Step 6: Write UI tests for StartScreen**

Create `tests/panel/StartScreen.test.tsx` — test that:
- SE dropdown renders with team roster names
- Opportunity name is displayed when detected
- Start button triggers `START_CRAWL` message
- Resume button appears when interrupted session exists
- Settings modal opens/closes

- [ ] **Step 7: Run tests, verify pass**

```bash
npx vitest run tests/panel/StartScreen.test.tsx
```

- [ ] **Step 8: Commit**

```bash
git add src/panel/ tests/panel/
git commit -m "feat: add Start Screen with SE selection, settings modal, and screen routing"
```

---

## Task 14: Side Panel — Crawl Screen

**Files:**
- Create: `src/panel/screens/CrawlScreen.tsx`, `src/panel/components/ActivityLog.tsx`, `src/panel/components/ProgressBar.tsx`, `src/panel/components/QACard.tsx`

- [ ] **Step 1: Implement ActivityLog**

Scrolling list of crawl event strings. Auto-scrolls to bottom.

- [ ] **Step 2: Implement ProgressBar**

Shows fields found / total fields. Color segments for WFM, EEM, PM.

- [ ] **Step 3: Implement QACard**

Displays question text + context. Text input for SE answer. Submit button sends answer back via messaging.

- [ ] **Step 4: Implement CrawlScreen**

Composes ActivityLog, ProgressBar, QACard. Shows token usage. Pause/Cancel buttons.

- [ ] **Step 5: Write UI tests for CrawlScreen**

Create `tests/panel/CrawlScreen.test.tsx` — test that:
- Activity log renders crawl events
- Progress bar shows correct filled/total ratio
- QA card appears when pending question exists in state
- Pause/Cancel buttons send correct messages

- [ ] **Step 6: Run tests, verify pass**
- [ ] **Step 7: Commit**

```bash
git add src/panel/screens/CrawlScreen.tsx src/panel/components/ tests/panel/CrawlScreen.test.tsx
git commit -m "feat: add Crawl Screen with activity log, progress bar, and Q&A cards"
```

---

## Task 15: Side Panel — Review & Download Screens

**Files:**
- Create: `src/panel/screens/ReviewScreen.tsx`, `src/panel/screens/DownloadScreen.tsx`, `src/panel/components/FieldReviewItem.tsx`

- [ ] **Step 1: Implement FieldReviewItem**

Shows field name, value, confidence badge (green/yellow/red). Expandable for medium/low — shows source, raw evidence, inline edit input.

- [ ] **Step 2: Implement ReviewScreen**

Groups fields by template section. Shows confidence summary at top. "Approve & Generate" and "Re-crawl Section" buttons. "Cancel" to discard.

- [ ] **Step 3: Implement DownloadScreen**

Shows document preview (field summary list). "Download .docx" button triggers generator and file-saver download. "Re-generate" button.

- [ ] **Step 4: Implement Re-crawl Section logic**

When SE clicks "Re-crawl Section" on a specific template section:
1. Identify which Salesforce pages are relevant (from `pagesVisited` in session state mapped to the section's fields)
2. Send `RECRAWL_SECTION` message to crawl engine with the section name and target pages
3. Engine re-navigates to those pages, re-scrapes, runs through council
4. On conflict (new value differs from existing): show inline prompt to SE with both values, let them pick
5. Merge accepted new values into session state

- [ ] **Step 5: Write UI tests**

Create `tests/panel/ReviewScreen.test.tsx` and `tests/panel/DownloadScreen.test.tsx`:
- ReviewScreen: renders fields grouped by section, confidence colors correct, inline edit works, re-crawl button sends message
- DownloadScreen: download button triggers generation, re-generate works after edits

- [ ] **Step 6: Run tests, verify pass**
- [ ] **Step 7: Commit**

```bash
git add src/panel/screens/ src/panel/components/FieldReviewItem.tsx tests/panel/
git commit -m "feat: add Review Screen with confidence display, re-crawl, and Download Screen"
```

---

## Task 16: Crawl Engine (Main Orchestrator)

**Files:**
- Create: `src/orchestrator/crawl-engine.ts`, `tests/orchestrator/crawl-engine.test.ts`

- [ ] **Step 1: Write failing tests**

- `startCrawl()` — initializes session, scrapes first page, processes through council
- Follows navigation directives until council says `done`
- Pauses for user questions and resumes on answer
- Persists state after each page
- Respects max pages and token budget limits
- Handles navigation failures gracefully
- Detects session expiration (via navigator.detectSessionExpiration), pauses crawl, notifies SE to re-auth
- Catches `AllProvidersExhaustedError`, pauses crawl, notifies SE
- Handles `RECRAWL_SECTION` messages for partial re-crawl with merge/conflict logic

- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement crawl-engine.ts**

```typescript
export class CrawlEngine {
  constructor(
    private council: AICouncil,
    private stateManager: typeof StateManager,
    private config: CrawlConfig,
  ) {}

  async start(seName: string, opportunityName: string, opportunityUrl: string): Promise<void> {
    const state = await this.stateManager.createSession(seName, opportunityName, opportunityUrl);
    await this.crawlLoop(state);
  }

  async resume(crawlId: string): Promise<void> {
    const state = await this.stateManager.load(crawlId);
    if (state) await this.crawlLoop(state);
  }

  private async crawlLoop(state: SessionState): Promise<void> {
    while (state.status === 'crawling' && state.pagesVisited.length < this.config.maxPages) {
      // 1. Send SCRAPE message to content script
      // 2. Process through council
      // 3. Handle result: navigate, askUser, or done
      // 4. Persist state
      // 5. Emit progress events for UI
    }
  }
}
```

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/ tests/orchestrator/
git commit -m "feat: add crawl engine orchestrating scraper-council-state loop"
```

---

## Task 17: Service Worker — Message Routing

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Implement full message routing**

The service worker is the hub connecting panel ↔ content script ↔ AI council:

- `START_CRAWL` from panel → create CrawlEngine, start crawl
- `RESUME_CRAWL` from panel → load state, resume
- `PAUSE_CRAWL` / `CANCEL_CRAWL` from panel → update engine state
- `SCRAPE_RESULT` from content script → forward to crawl engine
- `NAVIGATE` from engine → forward to content script
- `CRAWL_UPDATE` from engine → forward to panel
- `ASK_USER` from engine → forward to panel
- `USER_ANSWER` from panel → forward to engine
- `GENERATE_DOC` from panel → trigger document generator
- `GET_SETTINGS` / `SAVE_SETTINGS` from panel → chrome.storage.local

- [ ] **Step 2: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: add full message routing in service worker"
```

---

## Task 18: Integration Testing & Polish

**Files:**
- All files

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Fix any failures.

- [ ] **Step 2: Build and load in Chrome**

```bash
npx vite build
```

Load `dist/` as unpacked extension in `chrome://extensions`. Open a Salesforce page. Verify:
- Extension icon appears
- Side panel opens on click
- Content script detects Lightning/Classic mode
- Settings modal works (save/load API key, team roster)

- [ ] **Step 3: End-to-end manual test**

On a real Salesforce opportunity:
1. Select SE name, click Start
2. Watch crawl progress in activity log
3. Answer any AI questions
4. Review extracted fields on Review Screen
5. Approve and download .docx
6. Open .docx and verify formatting matches template

- [ ] **Step 4: Fix any issues discovered**
- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: integration testing and polish for SF Solution Crawler v0.1.0"
```

---

## Task Dependency Order

```
Task 1 (Scaffold)
  ↓
Task 2 (Types & Storage)
  ↓
  ├── Task 3 (Scraper) → Task 4 (Navigator)
  ├── Task 5 (AI Providers) → Task 7 (Prompts) → Task 8 (Crawler) → Task 9 (Reviewer) → Task 10 (Arbiter) → Task 11 (Council)
  └── Task 6 (Template Parser) → Task 12 (Doc Generator)
  ↓
Task 13 (Start Screen) → Task 14 (Crawl Screen) → Task 15 (Review/Download)
  ↓
Task 16 (Crawl Engine)
  ↓
Task 17 (Service Worker)
  ↓
Task 18 (Integration)
```

Tasks 3-6 can be parallelized after Task 2. Tasks 8-12 can be partially parallelized. UI tasks (13-15) can start after Task 2 (coding against types/interfaces) but should complete before Task 16. Content script modules (Tasks 3-4) are bundled via `src/content/index.ts` which imports scraper, navigator, and detector.
