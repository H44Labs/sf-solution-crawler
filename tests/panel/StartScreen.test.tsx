import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StartScreen } from '../../src/panel/screens/StartScreen';

// Mock chrome APIs
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: undefined,
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

const mockOnStart = vi.fn();
const mockOnResume = vi.fn();
const mockOnOpenSettings = vi.fn();

function renderStartScreen() {
  return render(
    <StartScreen
      onStart={mockOnStart}
      onResume={mockOnResume}
      onOpenSettings={mockOnOpenSettings}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no config, no interrupted session
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string[], callback: (result: Record<string, any>) => void) => {
      callback({});
    },
  );

  // Default: sendMessage does nothing (no opportunity detected)
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
    (_msg: any, callback?: (response: any) => void) => {
      if (callback) callback({});
    },
  );
});

describe('StartScreen', () => {
  it('renders SE dropdown with team roster names', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (keys: string[], callback: (result: Record<string, any>) => void) => {
        if (keys.includes('crawl_config')) {
          callback({
            crawl_config: {
              teamRoster: ['Alice Smith', 'Bob Jones', 'Carol Lee'],
              providers: [{ type: 'claude', apiKey: '', baseUrl: '', model: '' }],
              maxPages: 30,
              tokenBudget: 100000,
              navigationTimeout: 10000,
              productDomains: [],
            },
          });
        } else {
          callback({});
        }
      },
    );

    await act(async () => {
      renderStartScreen();
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /select se name/i })).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox', { name: /select se name/i });
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll('option');
    const names = Array.from(options).map((o) => o.textContent);
    expect(names).toContain('Alice Smith');
    expect(names).toContain('Bob Jones');
    expect(names).toContain('Carol Lee');
  });

  it('shows opportunity name when detected', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: any, callback?: (response: any) => void) => {
        if (callback) {
          callback({
            opportunityName: 'Acme Corp — Enterprise Deal',
            url: 'https://salesforce.com/opportunity/001',
          });
        }
      },
    );

    await act(async () => {
      renderStartScreen();
    });

    await waitFor(() => {
      expect(screen.getByText('Acme Corp — Enterprise Deal')).toBeInTheDocument();
    });
  });

  it('Start button calls onStart with selected SE name', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (keys: string[], callback: (result: Record<string, any>) => void) => {
        if (keys.includes('crawl_config')) {
          callback({
            crawl_config: {
              teamRoster: ['Alice Smith', 'Bob Jones'],
              providers: [{ type: 'claude', apiKey: '', baseUrl: '', model: '' }],
              maxPages: 30,
              tokenBudget: 100000,
              navigationTimeout: 10000,
              productDomains: [],
            },
          });
        } else {
          callback({});
        }
      },
    );

    await act(async () => {
      renderStartScreen();
    });

    // Wait for roster to load
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /select se name/i });
      const options = select.querySelectorAll('option');
      expect(options.length).toBeGreaterThan(0);
    });

    // Select Bob Jones
    const select = screen.getByRole('combobox', { name: /select se name/i });
    fireEvent.change(select, { target: { value: 'Bob Jones' } });

    const startButton = screen.getByRole('button', { name: /start analysis/i });
    fireEvent.click(startButton);

    expect(mockOnStart).toHaveBeenCalledWith('Bob Jones');
  });

  it('Resume button appears when interrupted session exists', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (keys: string[], callback: (result: Record<string, any>) => void) => {
        if (keys.includes('crawl_session_index')) {
          callback({ crawl_session_index: ['session-abc-123'] });
        } else if (keys.includes('crawl_session_session-abc-123')) {
          callback({
            'crawl_session_session-abc-123': {
              crawlId: 'session-abc-123',
              opportunityName: 'ACME Corp Q1 Deal',
              status: 'paused',
              seName: 'Alice Smith',
              opportunityUrl: '',
              deploymentType: 'unknown',
              pagesVisited: [],
              fieldsFound: {},
              fieldsRemaining: [],
              pendingQuestions: [],
              productsDetected: { wfm: false, eem: false, performanceManagement: false },
              tokenUsage: { total: 0, budget: 100000 },
              lastUpdated: new Date().toISOString(),
            },
          });
        } else {
          callback({});
        }
      },
    );

    await act(async () => {
      renderStartScreen();
    });

    await waitFor(() => {
      expect(screen.getByText('Resume Previous Session')).toBeInTheDocument();
    });

    expect(screen.getByText('ACME Corp Q1 Deal')).toBeInTheDocument();
  });

  it('Resume button calls onResume with crawlId', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (keys: string[], callback: (result: Record<string, any>) => void) => {
        if (keys.includes('crawl_session_index')) {
          callback({ crawl_session_index: ['session-xyz-999'] });
        } else if (keys.includes('crawl_session_session-xyz-999')) {
          callback({
            'crawl_session_session-xyz-999': {
              crawlId: 'session-xyz-999',
              opportunityName: 'Big Deal Inc',
              status: 'crawling',
              seName: 'Bob Jones',
              opportunityUrl: '',
              deploymentType: 'unknown',
              pagesVisited: [],
              fieldsFound: {},
              fieldsRemaining: [],
              pendingQuestions: [],
              productsDetected: { wfm: false, eem: false, performanceManagement: false },
              tokenUsage: { total: 0, budget: 100000 },
              lastUpdated: new Date().toISOString(),
            },
          });
        } else {
          callback({});
        }
      },
    );

    await act(async () => {
      renderStartScreen();
    });

    await waitFor(() => {
      expect(screen.getByText('Resume Previous Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Resume Previous Session'));
    expect(mockOnResume).toHaveBeenCalledWith('session-xyz-999');
  });

  it('Settings gear button opens settings modal callback', async () => {
    await act(async () => {
      renderStartScreen();
    });

    const settingsButton = screen.getByRole('button', { name: /open settings/i });
    fireEvent.click(settingsButton);

    expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
  });
});
