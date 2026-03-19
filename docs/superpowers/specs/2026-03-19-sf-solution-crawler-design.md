# SF Solution Crawler — Design Specification

**Date:** 2026-03-19
**Project:** sf-solution-crawler
**Status:** Draft

---

## 1. Overview

An AI-powered Chrome extension that acts as an automated Solutions Engineer. Given a Salesforce opportunity, it intelligently crawls the opportunity page and related records, gathers data relevant to NICE WFM, EEM, and Performance Management products, and generates a populated Solution Design Document (.docx) matching the team's standard template.

### Core Value Proposition

Instead of an SE manually clicking through Salesforce pages, copying data, and filling in a Word template, this tool does it autonomously — reading pages the way an SE would, using context clues to find relevant information, asking questions when stuck, and producing a ready-to-review document.

---

## 2. High-Level Architecture

Four core components inside one Chrome extension:

### 2.1 Side Panel UI
The SE's control center. Provides user identity selection, live crawl progress, Q&A interaction area, and document download.

### 2.2 DOM Scraper Engine
A content script injected into Salesforce pages. Reads visible page content, identifies fields/labels/values, related lists, tabs, quick links, and navigation elements. Handles both Lightning and Classic Salesforce UIs.

### 2.3 AI Analysis Core (Council)
A multi-agent AI system that directs the crawl, extracts data, validates quality, and decides when enough information has been gathered. Supports multiple AI providers. Each agent has a domain-aware system prompt with explicit knowledge of WFM, EEM, and Performance Management terminology and field semantics.

### 2.4 Document Generator
Takes the validated data and the original .docx template to produce a populated Solution Design Document preserving all formatting, styles, and branding.

### Data Flow

```
SE clicks Start
  → DOM Scraper reads main opportunity page
  → AI Crawler Agent analyzes content against template bracketed fields
  → AI directs navigation: "open Quote Q-1234" / "check Account page" / "look at related list"
  → Extension navigates, Scraper reads new page
  → Reviewer Agent validates each extraction
  → Arbiter Agent accepts/rejects/requests clarification
  → If stuck: Side Panel shows question to SE
  → When Arbiter says "complete": final review pass
  → SE reviews data on Review Screen, corrects if needed
  → Document Generator produces .docx
  → SE downloads
```

### Component Message Contracts

**Scraper → AI Council:**
```json
{
  "pageContext": {
    "url": "string",
    "title": "string",
    "breadcrumb": ["Opportunity", "Acme Corp WFM"],
    "uiMode": "lightning | classic"
  },
  "fields": [
    { "label": "string", "value": "string", "section": "string" }
  ],
  "relatedLists": [
    { "name": "string", "columns": ["string"], "rows": [["string"]] }
  ],
  "quickLinks": [{ "text": "string", "href": "string" }],
  "notes": ["string"]
}
```

**AI Council → Scraper (navigation directives):**
```json
{
  "action": "navigate | click | scroll | done | askUser",
  "target": "string (CSS selector, link text, or URL)",
  "reason": "string (why the AI wants to go here)",
  "fieldsSought": ["string (template fields it hopes to find)"]
}
```

**AI Council → Document Generator:**
```json
{
  "fieldMap": {
    "[Licensed Agents]": { "value": "500", "confidence": "high", "source": "Quote Q-1234" },
    "[ACD Information (Vendor)]": { "value": "CXone", "confidence": "high", "source": "Opportunity main page" }
  },
  "conditionalSections": {
    "deploymentType": "new_business | migration",
    "includeWFM": true,
    "includeEEM": true,
    "includePerformanceManagement": false
  },
  "seName": "string",
  "opportunityName": "string",
  "generationDate": "string"
}
```

---

## 3. AI Council & Quality Control

A three-agent system to ensure accuracy and prevent hallucination. Each agent is a separate AI API call with a specialized system prompt. The agents share context through a structured session state object, not raw conversation history.

### 3.1 Crawler Agent
The "feet on the ground." Directs page navigation, reads scraped content, and extracts data points. Optimized for finding and pulling information quickly.

**System prompt includes:**
- The full list of bracketed template fields with semantic descriptions (e.g., `[ACD Interval]` = "the time interval in minutes used for ACD data collection, typically 15 or 30")
- Product domain knowledge for WFM, EEM, and Performance Management (NICE Performance Manager/NPM, CXone Performance Manager)
- Common Salesforce field names and patterns that map to template fields

**Responsibilities:**
- Analyze each scraped page against the template's bracketed fields
- Decide where to navigate next based on what's still needed
- Extract field values with supporting context
- Use context clues from opportunity names, product names, SKU patterns to identify relevant data

**Invocation:** Called once per page scrape with the full session state (fields found so far, fields remaining, pages visited).

### 3.2 Reviewer Agent
The "quality check." Validates data in batches after each page crawl.

**Responsibilities:**
- Validate data makes sense in context (e.g., "Is this really an ACD model or a random string?")
- Compare extracted values against raw page content to catch hallucination — the raw scraped text is included in the review call
- Flag low-confidence extractions
- Grade each data point:
  - **High Confidence** — data clearly matches, proceed
  - **Medium Confidence** — plausible but needs user verification
  - **Low Confidence** — likely wrong, must ask the user

**Invocation:** Called in batches after the Crawler processes each page. Receives the Crawler's extractions AND the raw page content for cross-reference.

### 3.3 Arbiter Agent
The "decision maker" with final authority.

**Responsibilities:**
- Resolve disagreements between Crawler and Reviewer
- Decide when enough data has been collected vs. when to keep crawling
- Determine deployment type: **New Business** vs. **Migration** based on signals including: opportunity type/stage, presence of "migration/upgrade" keywords in opportunity name or notes, existence of `[Existing WFM Version]` data, product SKUs indicating upgrade paths
- Make calls on which product sections to include (WFM, EEM, Performance Management)
- Perform final holistic review of the completed field map before document generation
- Ensure the overall document tells a coherent story — not just individually correct fields, but a design that makes sense as a whole
- Present confidence summary to the SE before document generation

**Invocation:** Called after each Reviewer batch to make accept/reject decisions, and once at the end for the final holistic review.

### 3.4 Session State Object

The central data structure shared between all agents. Updated after each agent invocation.

```json
{
  "crawlId": "string (unique per session)",
  "seName": "string",
  "opportunityName": "string",
  "opportunityUrl": "string",
  "deploymentType": "new_business | migration | unknown",
  "pagesVisited": [
    { "url": "string", "title": "string", "timestamp": "ISO8601" }
  ],
  "fieldsFound": {
    "[Licensed Agents]": {
      "value": "500",
      "confidence": "high | medium | low",
      "source": "string (page title / URL where found)",
      "rawEvidence": "string (the DOM text that supports this value)",
      "reviewerVerdict": "accepted | flagged | rejected",
      "arbiterDecision": "accepted | askUser | recrawl"
    }
  },
  "fieldsRemaining": ["[ACD Interval]", "[Target Go Live Date]"],
  "pendingQuestions": [
    { "field": "string", "question": "string", "context": "string" }
  ],
  "productsDetected": {
    "wfm": true,
    "eem": false,
    "performanceManagement": false
  },
  "tokenUsage": { "total": 0, "budget": 100000 },
  "status": "crawling | reviewing | askingUser | generating | complete"
}
```

### 3.5 Token Budget & Efficiency

- **Page content truncation:** Before sending to AI, scraped content is summarized to essential fields/values. Full HTML is never sent — only structured label/value pairs and text content.
- **Max pages per crawl:** Default 20 pages. Configurable in settings. The Arbiter can stop early if all critical fields are found.
- **Token budget per session:** Estimated 50k-100k tokens across all agent calls for a typical opportunity. The extension tracks cumulative usage and warns if approaching a configurable limit.
- **Batch processing:** The Reviewer processes extractions in batches (per page) rather than per field, reducing API calls.

---

## 4. DOM Scraper Engine

### 4.1 Multi-Strategy Parsing

Two modes with auto-detection:

**Lightning Mode:**
- Uses `querySelectorAll` on open shadow roots where accessible
- For closed shadow DOM components (common in Lightning), falls back to reading the **accessible text content** via `innerText` / `textContent` on the host element
- As a secondary strategy, intercepts Salesforce's own XHR/fetch responses to capture structured record data that feeds the UI — this provides clean field/value data even when the DOM is inaccessible
- Reads `lightning-*` and `force-*` web components
- Extracts field labels and values from `records-highlights`, `record-form`, and related list components

**Classic Mode:**
- Reads standard HTML tables, detail sections, and related lists

**Auto-Detect:**
- Determines which mode to use based on page structure on each page load
- Checks for presence of `lightning-` prefixed elements vs. classic `<table class="detailList">` patterns

### 4.2 What It Captures Per Page

- All visible field label/value pairs
- Related list names and their row data
- Quick links and sidebar navigation items
- Tab names and their content
- Page title and breadcrumb context (to know where it is)
- Any visible notes, descriptions, or text blocks

### 4.3 Navigation Execution & SPA Handling

Salesforce Lightning is a single-page application — clicking a link does not trigger a traditional page load. The scraper handles this:

1. Finds the correct link/button on the page
2. Captures a DOM snapshot hash before clicking
3. Clicks the element
4. Monitors for SPA navigation: watches for URL hash/path changes, `lightning-record-*` component mutations via MutationObserver, and network activity settling
5. Waits until: URL has changed AND no pending XHR requests AND DOM has stabilized (no mutations for 2 seconds)
6. Confirms it arrived at the right page by checking the page title/breadcrumb
7. Scrapes the new page and sends it back to the AI

**Timeout:** 15 seconds per navigation. If not loaded, retry once, then flag to Arbiter.

### 4.4 Crawl Scope

Starting from the opportunity, the scraper systematically covers:
- **Main opportunity page** — all fields, details, notes
- **Quick links / related lists** — all related sections visible on the page
- **Quotes** — line items, products, pricing details
- **Related records** — account, contacts, activities, any linked records
- Focus on data relevant to **WFM, EEM, and Performance Management** (including NICE Performance Manager/NPM and CXone Performance Manager as sub-elements within WFM connectors)

### 4.5 Crawl State Persistence

Crawl state (pages visited, data collected, current position) is saved to Chrome's local storage after each page scrape. This enables:
- **Recovery from crashes** — if the browser tab closes or laptop sleeps, the SE can resume the crawl from where it left off
- **Session continuity** — state survives extension restarts
- **Automatic cleanup** — stale crawl states older than 24 hours are purged

---

## 5. Side Panel UI

### 5.1 Start Screen
- Dropdown to select SE name (from configured team roster)
- Current page detection — shows "Opportunity: [Name]" to confirm correct page
- "Start Analysis" button
- Resume button if a previous crawl was interrupted
- Settings gear icon for configuration

### 5.2 Active Crawl Screen
- Live activity log in plain English: "Reading opportunity details...", "Opening Quote Q-12345...", "Found ACD type: CXone"
- Progress indicator: template sections filled vs. remaining
- Product domain tracker: checkboxes for WFM / EEM / Performance Management showing discovery status
- Token usage indicator (current / budget limit)
- **Q&A card area** — question appears with context about why the AI is asking; SE types answer and crawl continues
- Pause and Cancel buttons

### 5.3 Review Screen
- Summary of all extracted data organized by template section
- Each field shows confidence level (High / Medium / Low) with color coding:
  - High = green
  - Medium = yellow (expandable — SE can see what AI found and correct inline)
  - Low = red (expandable — SE should review and correct)
- "Approve & Generate" button
- **"Re-crawl Section"** button per section — navigates back to relevant Salesforce pages for that section, re-scrapes, and merges new data while preserving other sections' data. On conflict (new value differs from existing for same field), the SE is prompted to choose which value to keep.
- "Cancel" to discard

### 5.4 Download Screen
- Preview of document contents
- "Download .docx" button
- Option to re-generate if SE made corrections

---

## 6. Document Generator

### 6.1 Template-Driven Generation
- Uses the `docxtemplater` library (not `docx`) — this library is specifically designed for reading existing .docx templates and performing in-place placeholder replacement while preserving all styles, formatting, and structure
- Preserves all formatting, styles, fonts, headers, footers, tables, and NICE branding
- **Delimiter configuration:** The existing template uses `[field]` square bracket syntax. `docxtemplater` is configured with custom delimiters (`[` and `]`) instead of the default curly braces, so the template works as-is without manual conversion.
- The generator is template-driven — field names come from the template. The AI agents have domain-aware system prompts that understand field semantics, but the generator itself just maps field names to values.

### 6.2 Template Pre-Processing
Before generating, the template is parsed to:
- **Extract all bracketed fields** — regex scan for `[...]` patterns
- **Normalize inconsistencies** — handle known template issues:
  - Trailing spaces: `[Licensed Agents ]` normalized to `[Licensed Agents]`
  - Missing opening brackets: `Disaster Recovery ]` and `GDPR Compliance]` normalized to `[Disaster Recovery]` and `[GDPR Compliance]`
  - Duplicate fields across conditional sections (e.g., `[Employee Engagement Manager]` in both New Business and Migration tables) — both instances get the same value
- **Build field registry** — the complete list of unique fields the AI needs to find, sent to the Crawler Agent's system prompt

### 6.3 Conditional Sections
- **New Business vs. Migration** — the Arbiter determines which type based on opportunity signals (see Section 3.3). The matching section is kept; the other is removed along with its heading and conditional marker text (`[[If it's a New Business...]]`, `[[If it's a migration...]]`)
- **Product-specific sections** — WFM, EEM sections included/excluded based on discovered products. Performance Management data populates rows within the WFM NICE Connectors table (NPM, CXone Performance Manager flags) rather than as a standalone section.
- **"NOTE - REMOVE PRIOR TO PUBLISHING"** — the NOTE line AND all subsequent elements that are bullet/list items are stripped. Stripping stops at the next non-list element (heading or body paragraph).
- **Appendix sections** — Appendix A (WFM Architecture, HA, DR) and Appendix B (EEM Architecture) are included as-is when their respective products are present. These are mostly boilerplate but DR option selection (Option 1 vs. Option 2) is populated based on discovered data if available, otherwise flagged `[NEEDS INPUT]`.

### 6.4 Table Population

**Dynamic table row insertion mechanism:**
- The existing template has static placeholder rows in tables. During the pre-processing step (Section 6.2), these table rows are converted to `docxtemplater` loop constructs (`{#rows}...{/rows}`) so that rows can be added dynamically.
- This pre-processing is automatic and invisible to the template author — they continue using `[field]` syntax in the template.

**ACD Environment Details table** (7 columns: Environment, Tenant No., ACD Information (Vendor), ACD Model/Version, ACD Interval, ACS Required, 3rd Party Vendor Requirement):
- The AI determines the number of ACD environments from quote line items, environment-related fields, and tenant information discovered during crawl
- Rows are added dynamically — one row per discovered environment/tenant combination
- If multiple ACDs serve different tenants, each gets its own row

**SmartSync Details table** (4 columns: Smart Sync, Intended Use, Tenant, Type):
- Populated from connector and integration data found in quotes and opportunity details
- Rows added per discovered SmartSync integration
- Empty rows removed; if no SmartSync data found, table flagged with `[NEEDS INPUT]`

**WFM NICE Connectors table:**
- Yes/No flags populated for each connector type (including NPM, CXone Performance Manager)
- Based on product line items in quotes and any connector-related fields

**General table rules:**
- Empty tables where no data was found: flagged with `[NEEDS INPUT]` rather than removed
- The AI provides row data as arrays in the field map; the generator inserts them into the correct table structure

**Field map schema for table data:**
```json
{
  "acdEnvironments": [
    {
      "environment": "Production",
      "tenantNo": "T-001",
      "acdVendor": "CXone",
      "acdModelVersion": "CXone 24.1",
      "acdInterval": "15",
      "acsRequired": "Yes",
      "thirdPartyVendor": "No"
    }
  ],
  "smartSyncIntegrations": [
    {
      "smartSync": "Payroll Export",
      "intendedUse": "Payroll integration",
      "tenant": "T-001",
      "type": "Outbound"
    }
  ]
}
```

### 6.5 Revision History Table
- **Revision:** "1.0" for initial generation
- **Person(s):** SE name from dropdown + "SF Solution Crawler (AI-assisted)"
- **Date:** Generation date in MM/DD/YYYY format
- **Notes:** "Initial draft — auto-generated from Salesforce opportunity [Opportunity Name]. Review required for [N] flagged items."

### 6.6 Personalization
- SE name inserted into revision history and document header
- Generation date stamped
- Opportunity name included in project summary section

### 6.7 Template Versioning
- Template file lives in extension storage
- Updated via settings panel — no code changes needed
- On template upload, the field registry is rebuilt automatically
- New bracketed fields are added to the Crawler Agent's field list on next crawl

---

## 7. Configuration & Setup

### 7.1 AI Provider Configuration

**Multi-provider support:**
- Claude (Anthropic) — `sk-ant-*` keys
- Groq — `gsk_*` keys
- OpenAI — `sk-*` keys
- Extensible architecture to add providers later

**Key hierarchy:**
- **Personal key** — SE enters their own API key (takes priority)
- **Fallback team key** — shared key configured by admin for SEs without personal keys

**Provider selection:**
- SE picks preferred provider in settings, or defaults to team-configured provider
- Fallback chain: if one provider errors or is rate-limited, falls back to next configured provider

**Retry strategy (per provider):**
- On transient errors (429, 500, 503): exponential backoff starting at 1 second, max 3 retries
- On authentication errors (401, 403): no retry, surface error to SE immediately
- After 3 failed retries on one provider: fall back to next configured provider
- If all providers exhausted: pause crawl and notify SE

### 7.2 Team Configuration
- **Team roster** — list of SE names for the dropdown (editable in settings)
- **Product domains** — defaults to WFM, EEM, Performance Management; configurable if portfolio changes

### 7.3 Template Management
- Upload/update the `.docx` template through settings panel
- On upload: template is parsed, field registry is built, and a summary of discovered fields is shown to the admin
- Extension picks up new template automatically

### 7.4 Salesforce Compatibility
- No Salesforce API credentials needed — works through DOM only
- No admin installation on Salesforce side required
- Works on any Salesforce org the SE can log into
- Handles Lightning and Classic automatically

### 7.5 Security
- Page data sent to AI provider for analysis — structured text content only, no screenshots or credentials
- API keys stored in Chrome's encrypted storage
- No data stored server-side — processed and discarded
- Extension only activates on Salesforce domains (*.salesforce.com, *.force.com, *.lightning.force.com)
- Chrome extension content scripts bypass Salesforce CSP for DOM access; however, no scripts are injected into the page context — all work happens in the isolated content script world

### 7.6 Deployment
- Internal Chrome extension (not Chrome Web Store)
- Installed via enterprise policy or direct `.crx` file
- Updates pushed through internal distribution channel

---

## 8. Error Handling & Edge Cases

### 8.1 Page Navigation Failures
- Link click doesn't load within 15-second timeout: retry once, then flag to Arbiter
- Page loads but appears empty/broken: AI recognizes and moves on
- SPA navigation detection failure: falls back to a hard timeout + DOM snapshot comparison

### 8.2 Session Expiration
- Detects Salesforce login redirect during crawl
- Pauses and prompts SE to re-authenticate
- Resumes from where it left off — collected data preserved in Chrome local storage

### 8.3 Mid-Crawl Interruption
- Browser tab crash, extension closed, or laptop sleep
- Crawl state persisted to Chrome local storage after each page (see Section 4.5)
- On next extension open: detects interrupted crawl, offers "Resume" on Start Screen
- SE can choose to resume or start fresh

### 8.4 Incomplete Data
- Arbiter sets minimum threshold: if less than 60% of critical template fields filled, warns SE before generating
- Review Screen shows exactly what's missing
- SE can proceed anyway — missing fields show as `[NEEDS INPUT]` in the document

### 8.5 Ambiguous Data
- Multiple possible values for a field: Reviewer flags, Arbiter asks SE to pick
- Context clues from opportunity name, line items, account info used to disambiguate first

### 8.6 Template Issues
- Malformed brackets (missing `[` or `]`): handled by pre-processing normalization (Section 6.2)
- Duplicate fields across sections: all instances receive the same value
- New/unknown bracketed fields in updated templates: AI attempts to find data, asks SE if stuck

### 8.7 Token Budget Exceeded
- If cumulative token usage approaches the configured limit, the Arbiter prioritizes remaining unfilled critical fields and stops crawling non-essential pages
- SE is notified with a summary of what was found and what remains

---

## 9. Technology Stack

- **Chrome Extension:** Manifest V3
- **Content Scripts:** TypeScript for DOM scraping
- **Side Panel UI:** React (lightweight, fast rendering)
- **AI Integration:** REST API calls to configured provider (Claude, Groq, OpenAI)
- **Document Generation:** `docxtemplater` library for in-place .docx template placeholder replacement with style preservation
- **Storage:** `chrome.storage.local` (extension API) for both keys/config (encrypted) and crawl state persistence. Note: `window.localStorage` is NOT used — all storage goes through the Chrome extension storage API, which is accessible from both content scripts and the service worker.
- **Build:** Vite + TypeScript

---

## 10. Template Field Registry

The following fields are extracted from the WFM Design Document Template. This registry is rebuilt automatically when the template is updated.

### Key Fields by Template Section

**Project Summary:**
- Customer/account name, opportunity name, deployment type

**WFM Deployment (New Business or Migration):**
- `[Licensed Agents]`, `[Purchased Date]`, `[Target Go Live Date]`
- `[Enhanced Strategic Planner]`, `[AI Forecasting]`, `[GDPR Compliance]`, `[Disaster Recovery]`
- For migration: `[Existing WFM Version]`, `[Current Licensed Agents]`

**WFM Authentication:**
- SSO vs. native authentication method, IDP details

**ACD Environment Details:**
- `[ACD Information (Vendor)]`, `[ACD Model/Version]`, `[ACD Interval]`
- Environment name, tenant number, ACS required flag, 3rd party vendor requirement

**WFM NICE Connectors:**
- Yes/No flags for each connector type including NPM, CXone Performance Manager

**SmartSync:**
- Integration name, intended use, tenant, type

**EEM:**
- `[Employee Engagement Manager]` deployment details, authentication method

**Appendices:**
- DR option selection (Option 1 free vs. Option 2 paid)
- Connectivity type selections

*Note: This is a representative subset. The full registry is built dynamically by parsing the template at upload time.*

---

## 11. Success Criteria

1. SE can start analysis on any Salesforce opportunity with one click
2. AI correctly identifies WFM, EEM, and Performance Management data across opportunity, quotes, and related records
3. AI Council catches hallucinated or mismatched data before it reaches the document
4. Generated .docx matches the template format — formatting, styles, tables, branding preserved
5. Medium/Low confidence items are clearly flagged for SE review
6. End-to-end time is significantly faster than manual SE process
7. Works on both Lightning and Classic Salesforce UIs
8. Crawl state survives interruptions and can be resumed
9. Template updates are handled without code changes
