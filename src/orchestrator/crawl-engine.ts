import { AICouncil, CouncilResult } from '../ai/council';
import { StateManager } from '../storage/state';
import { AllProvidersExhaustedError } from '../ai/providers';
import { SessionState, CrawlConfig, PageData, NavigationDirective } from '../types';

export type CrawlEventType = 'log' | 'progress' | 'question' | 'complete' | 'error' | 'paused';

export interface CrawlEvent {
  type: CrawlEventType;
  message: string;
  data?: any;
}

export type CrawlEventHandler = (event: CrawlEvent) => void;

export class CrawlEngine {
  private council: AICouncil;
  private config: CrawlConfig;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private eventHandler: CrawlEventHandler | null = null;

  constructor(council: AICouncil, config: CrawlConfig) {
    this.council = council;
    this.config = config;
  }

  onEvent(handler: CrawlEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: CrawlEvent): void {
    this.eventHandler?.(event);
  }

  async start(
    seName: string,
    opportunityName: string,
    opportunityUrl: string,
    scrapeFn: () => Promise<PageData>,
    navigateFn: (directive: NavigationDirective) => Promise<boolean>,
    detectSessionExpiredFn: () => boolean,
  ): Promise<SessionState> {
    const state = await StateManager.createSession(seName, opportunityName, opportunityUrl);
    await StateManager.save(state);
    this.emit({ type: 'log', message: `Starting analysis of ${opportunityName}...` });
    return this.crawlLoop(state, scrapeFn, navigateFn, detectSessionExpiredFn);
  }

  async resume(
    crawlId: string,
    scrapeFn: () => Promise<PageData>,
    navigateFn: (directive: NavigationDirective) => Promise<boolean>,
    detectSessionExpiredFn: () => boolean,
  ): Promise<SessionState | null> {
    const state = await StateManager.load(crawlId);
    if (!state) return null;
    state.status = 'crawling';
    this.emit({ type: 'log', message: `Resuming analysis of ${state.opportunityName}...` });
    return this.crawlLoop(state, scrapeFn, navigateFn, detectSessionExpiredFn);
  }

  pause(): void { this.isPaused = true; }
  cancel(): void { this.isCancelled = true; }

  private async crawlLoop(
    state: SessionState,
    scrapeFn: () => Promise<PageData>,
    navigateFn: (directive: NavigationDirective) => Promise<boolean>,
    detectSessionExpiredFn: () => boolean,
  ): Promise<SessionState> {
    while (state.status === 'crawling' && state.pagesVisited.length < this.config.maxPages) {
      // Check pause/cancel
      if (this.isPaused) {
        state.status = 'paused';
        await StateManager.save(state);
        this.emit({ type: 'paused', message: 'Crawl paused' });
        return state;
      }
      if (this.isCancelled) {
        await StateManager.delete(state.crawlId);
        return state;
      }

      // Check session expiration
      if (detectSessionExpiredFn()) {
        state.status = 'paused';
        await StateManager.save(state);
        this.emit({ type: 'error', message: 'Salesforce session expired. Please re-authenticate and resume.' });
        return state;
      }

      // Scrape current page
      let pageData: PageData;
      try {
        pageData = await scrapeFn();
        state.pagesVisited.push({ url: pageData.pageContext.url, title: pageData.pageContext.title, timestamp: new Date().toISOString() });
        this.emit({ type: 'log', message: `Reading ${pageData.pageContext.title}...` });
      } catch (err) {
        this.emit({ type: 'error', message: `Failed to scrape page: ${err}` });
        break;
      }

      // Process through AI Council
      let result: CouncilResult;
      try {
        result = await this.council.processPage(pageData, state);
      } catch (err: any) {
        if (err instanceof AllProvidersExhaustedError) {
          state.status = 'paused';
          await StateManager.save(state);
          this.emit({ type: 'error', message: 'All AI providers exhausted. Please check API keys and try again.' });
          return state;
        }
        // Catch auth errors and any other errors — don't crash
        state.status = 'paused';
        await StateManager.save(state);
        this.emit({ type: 'error', message: `AI error: ${err.message || err}` });
        return state;
      }

      // Update state with results
      for (const [field, data] of Object.entries(result.acceptedFields)) {
        state.fieldsFound[field] = {
          value: data.value,
          confidence: data.confidence as any,
          source: data.source,
          rawEvidence: data.rawEvidence,
          reviewerVerdict: 'accepted',
          arbiterDecision: 'accepted',
        };
        state.fieldsRemaining = state.fieldsRemaining.filter(f => f !== field);
      }
      state.deploymentType = result.deploymentType as any;
      state.productsDetected = result.productsDetected;
      state.tokenUsage.total += result.totalTokensUsed;

      // Emit progress
      const totalFields = Object.keys(state.fieldsFound).length + state.fieldsRemaining.length;
      this.emit({ type: 'progress', message: `Found ${Object.keys(state.fieldsFound).length}/${totalFields} fields`, data: { found: Object.keys(state.fieldsFound).length, total: totalFields } });

      // Handle questions
      if (result.questionsForUser.length > 0) {
        state.pendingQuestions = result.questionsForUser;
        state.status = 'askingUser';
        await StateManager.save(state);
        this.emit({ type: 'question', message: result.questionsForUser[0].question, data: result.questionsForUser[0] });
        return state; // Pause for user answer
      }

      // Check completion
      if (result.isComplete) {
        state.status = 'complete';
        await StateManager.save(state);
        this.emit({ type: 'complete', message: 'Analysis complete!' });
        return state;
      }

      // Check token budget
      if (state.tokenUsage.total >= state.tokenUsage.budget) {
        state.status = 'complete';
        await StateManager.save(state);
        this.emit({ type: 'complete', message: 'Token budget reached. Completing with available data.' });
        return state;
      }

      // Navigate to next page
      if (result.navigation.action === 'navigate' || result.navigation.action === 'click') {
        this.emit({ type: 'log', message: `Navigating to ${result.navigation.target}...` });
        const success = await navigateFn(result.navigation);
        if (!success) {
          this.emit({ type: 'log', message: `Navigation failed, continuing with available data` });
        }
      }

      // Save state after each page
      await StateManager.save(state);
    }

    // Max pages reached
    if (state.status === 'crawling') {
      state.status = 'complete';
      await StateManager.save(state);
      this.emit({ type: 'complete', message: 'Maximum pages reached. Completing with available data.' });
    }

    return state;
  }
}
