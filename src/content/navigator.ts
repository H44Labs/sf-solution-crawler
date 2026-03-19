import { NavigationDirective } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVIGATION_TIMEOUT = 15_000; // ms
const STABLE_QUIET_PERIOD = 2_000;  // ms of no mutations → "stable"
const STABLE_POLL_INTERVAL = 100;   // ms between stability polls

// ─── findNavigationTarget ─────────────────────────────────────────────────────

/**
 * Locate a clickable element using three strategies (in order):
 *   1. CSS selector
 *   2. <a> whose trimmed textContent matches `target`
 *   3. <a> whose href contains `target`
 */
export function findNavigationTarget(target: string): HTMLElement | null {
  // 1. CSS selector
  try {
    const el = document.querySelector<HTMLElement>(target);
    if (el) return el;
  } catch {
    // target is not a valid CSS selector — fall through
  }

  // 2. Link text match
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  const byText = anchors.find(
    (a) => a.textContent?.trim() === target,
  );
  if (byText) return byText;

  // 3. Href match
  const byHref = anchors.find(
    (a) => a.href.includes(target) || a.getAttribute('href')?.includes(target),
  );
  if (byHref) return byHref;

  return null;
}

// ─── detectSessionExpiration ──────────────────────────────────────────────────

const LOGIN_PATTERNS = ['/login', '/secur/frontdoor.jsp', '/setup/secur/'];

/**
 * Returns true if the current URL matches known Salesforce session-expiry pages.
 */
export function detectSessionExpiration(): boolean {
  const href = window.location.href;
  return LOGIN_PATTERNS.some((pattern) => href.includes(pattern));
}

// ─── hashDOMSnapshot ──────────────────────────────────────────────────────────

/**
 * Quick numeric hash of key DOM elements for change detection.
 * Uses tag names, ids, and class lists of every element in the body.
 */
export function hashDOMSnapshot(): string {
  const elements = document.body
    ? Array.from(document.body.querySelectorAll('*'))
    : [];

  let hash = 0;
  for (const el of elements) {
    const sig = `${el.tagName}|${el.id}|${el.className}`;
    for (let i = 0; i < sig.length; i++) {
      hash = (Math.imul(31, hash) + sig.charCodeAt(i)) | 0;
    }
  }
  return hash.toString(16);
}

// ─── waitForPageStable ────────────────────────────────────────────────────────

/**
 * Resolves when the DOM has been quiet (no mutations) for STABLE_QUIET_PERIOD ms,
 * or when `timeout` ms have elapsed.
 *
 * Also monitors URL changes: any href change resets the quiet timer.
 */
export function waitForPageStable(timeout = NAVIGATION_TIMEOUT): Promise<void> {
  return new Promise<void>((resolve) => {
    let lastActivityAt = Date.now();
    let lastHref = window.location.href;

    const observer = new MutationObserver(() => {
      lastActivityAt = Date.now();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const deadline = Date.now() + timeout;

    const check = setInterval(() => {
      // URL change → reset timer
      const currentHref = window.location.href;
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        lastActivityAt = Date.now();
      }

      const quiet = Date.now() - lastActivityAt >= STABLE_QUIET_PERIOD;
      const timedOut = Date.now() >= deadline;

      if (quiet || timedOut) {
        clearInterval(check);
        observer.disconnect();
        resolve();
      }
    }, STABLE_POLL_INTERVAL);
  });
}

// ─── navigateTo ───────────────────────────────────────────────────────────────

/**
 * Attempt navigation once.  Returns true on success, false on failure.
 */
async function attemptNavigation(
  directive: NavigationDirective,
): Promise<boolean> {
  const target = findNavigationTarget(directive.target);
  if (!target) return false;

  const _beforeHash = hashDOMSnapshot();
  target.click();

  await waitForPageStable(NAVIGATION_TIMEOUT);

  if (detectSessionExpiration()) return false;

  return true;
}

/**
 * Navigate to the element described by `directive`.
 * Makes one attempt and, on failure, retries once before returning false.
 */
export async function navigateTo(
  directive: NavigationDirective,
): Promise<boolean> {
  const success = await attemptNavigation(directive);
  if (success) return true;

  // One retry
  return attemptNavigation(directive);
}
