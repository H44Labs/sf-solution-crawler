// Confidence levels
export type Confidence = 'high' | 'medium' | 'low';

// Reviewer verdicts
export type ReviewerVerdict = 'accepted' | 'flagged' | 'rejected';

// Arbiter decisions
export type ArbiterDecision = 'accepted' | 'askUser' | 'recrawl';

// Crawl status
export type CrawlStatus = 'crawling' | 'reviewing' | 'askingUser' | 'generating' | 'complete' | 'paused';

// Deployment type
export type DeploymentType = 'new_business' | 'migration' | 'unknown';

// UI mode
export type UIMode = 'lightning' | 'classic';

// Navigation actions
export type NavigationAction = 'navigate' | 'click' | 'scroll' | 'done' | 'askUser';

// AI Provider type
export type AIProviderType = 'claude' | 'openai' | 'groq' | 'gemini';

// Scraped field from a page
export interface ScrapedField {
  label: string;
  value: string;
  section: string;
}

// Related list data
export interface RelatedList {
  name: string;
  columns: string[];
  rows: string[][];
}

// Quick link
export interface QuickLink {
  text: string;
  href: string;
}

// Page context
export interface PageContext {
  url: string;
  title: string;
  breadcrumb: string[];
  uiMode: UIMode;
}

// Full page data from scraper
export interface PageData {
  pageContext: PageContext;
  fields: ScrapedField[];
  relatedLists: RelatedList[];
  quickLinks: QuickLink[];
  notes: string[];
}

// Navigation directive from AI to scraper
export interface NavigationDirective {
  action: NavigationAction;
  target: string;
  reason: string;
  fieldsSought: string[];
}

// Field map entry - single extracted field
export interface FieldMapEntry {
  value: string;
  confidence: Confidence;
  source: string;
  rawEvidence: string;
  reviewerVerdict: ReviewerVerdict;
  arbiterDecision: ArbiterDecision;
}

// ACD Environment row
export interface AcdEnvironment {
  environment: string;
  tenantNo: string;
  acdVendor: string;
  acdModelVersion: string;
  acdInterval: string;
  acsRequired: string;
  thirdPartyVendor: string;
}

// SmartSync integration row
export interface SmartSyncIntegration {
  smartSync: string;
  intendedUse: string;
  tenant: string;
  type: string;
}

// Conditional sections config
export interface ConditionalSections {
  deploymentType: DeploymentType;
  includeWFM: boolean;
  includeEEM: boolean;
  includePerformanceManagement: boolean;
}

// Generator input from AI Council
export interface GeneratorInput {
  fieldMap: Record<string, FieldMapEntry>;
  conditionalSections: ConditionalSections;
  acdEnvironments: AcdEnvironment[];
  smartSyncIntegrations: SmartSyncIntegration[];
  seName: string;
  opportunityName: string;
  generationDate: string;
}

// Page visit record
export interface PageVisit {
  url: string;
  title: string;
  timestamp: string;
}

// Pending question for user
export interface PendingQuestion {
  field: string;
  question: string;
  context: string;
}

// Products detected
export interface ProductsDetected {
  wfm: boolean;
  eem: boolean;
  performanceManagement: boolean;
}

// Token usage tracking
export interface TokenUsage {
  total: number;
  budget: number;
}

// The central session state
export interface SessionState {
  crawlId: string;
  seName: string;
  opportunityName: string;
  opportunityUrl: string;
  deploymentType: DeploymentType;
  pagesVisited: PageVisit[];
  fieldsFound: Record<string, FieldMapEntry>;
  fieldsRemaining: string[];
  pendingQuestions: PendingQuestion[];
  productsDetected: ProductsDetected;
  tokenUsage: TokenUsage;
  status: CrawlStatus;
  lastUpdated: string;
}

// AI Provider configuration
export interface AIProviderConfig {
  type: AIProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
}

// Team member with name and email
export interface TeamMember {
  name: string;
  email: string;
}

// Crawl configuration
export interface CrawlConfig {
  maxPages: number;
  tokenBudget: number;
  navigationTimeout: number;
  providers: AIProviderConfig[];
  teamRoster: TeamMember[];
  productDomains: string[];
}

// Message types for chrome.runtime messaging
export type MessageType =
  | 'PING'
  | 'DETECT_MODE'
  | 'START_CRAWL'
  | 'RESUME_CRAWL'
  | 'PAUSE_CRAWL'
  | 'CANCEL_CRAWL'
  | 'SCRAPE_PAGE'
  | 'SCRAPE_RESULT'
  | 'NAVIGATE'
  | 'CRAWL_UPDATE'
  | 'ASK_USER'
  | 'USER_ANSWER'
  | 'GENERATE_DOC'
  | 'RECRAWL_SECTION'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS';

export interface ExtensionMessage {
  type: MessageType;
  payload?: any;
}
