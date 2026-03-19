import React, { useState, useEffect } from 'react';
import { CrawlConfig } from '../../types';

interface StartScreenProps {
  onStart: (seName: string) => void;
  onResume: (crawlId: string) => void;
  onOpenSettings: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a2e',
    color: '#e0e0e0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    margin: 0,
  },
  subtitle: {
    fontSize: '12px',
    color: '#888',
    margin: '2px 0 0 0',
  },
  settingsButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    color: '#888',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, color 0.2s',
  },
  section: {
    marginBottom: '20px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#aaa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '6px',
    display: 'block',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '32px',
  },
  opportunityCard: {
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '12px',
  },
  opportunityName: {
    fontSize: '13px',
    color: '#e0e0e0',
    fontWeight: '500',
    marginBottom: '4px',
  },
  opportunityUrl: {
    fontSize: '11px',
    color: '#666',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  noOpportunity: {
    fontSize: '13px',
    color: '#666',
    fontStyle: 'italic',
  },
  startButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#0f3460',
    border: '1px solid #1a5276',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    marginBottom: '10px',
  },
  startButtonDisabled: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    color: '#555',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'not-allowed',
    marginBottom: '10px',
  },
  resumeButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: 'transparent',
    border: '1px solid #e94560',
    borderRadius: '8px',
    color: '#e94560',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  resumeCard: {
    backgroundColor: '#1a0a10',
    border: '1px solid #3d1a23',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '10px',
  },
  resumeLabel: {
    fontSize: '11px',
    color: '#e94560',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  resumeOpportunity: {
    fontSize: '13px',
    color: '#e0e0e0',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '16px',
    borderTop: '1px solid #2a2a4a',
    fontSize: '11px',
    color: '#555',
    textAlign: 'center' as const,
  },
};

export function StartScreen({ onStart, onResume, onOpenSettings }: StartScreenProps) {
  const [teamRoster, setTeamRoster] = useState<string[]>([]);
  const [selectedSE, setSelectedSE] = useState<string>('');
  const [detectedOpportunity, setDetectedOpportunity] = useState<{ name: string; url: string } | null>(null);
  const [interruptedSession, setInterruptedSession] = useState<{ crawlId: string; opportunityName: string } | null>(null);

  useEffect(() => {
    // Load settings from storage
    chrome.storage.local.get(['crawl_config'], (result) => {
      const config: CrawlConfig | undefined = result['crawl_config'];
      if (config?.teamRoster && config.teamRoster.length > 0) {
        setTeamRoster(config.teamRoster);
        setSelectedSE(config.teamRoster[0]);
      }
    });

    // Check for interrupted session
    chrome.storage.local.get(['crawl_session_index'], (result) => {
      const index: string[] = result['crawl_session_index'] || [];
      if (index.length === 0) return;

      // Find a non-complete session
      const checkSessions = async () => {
        for (const crawlId of index) {
          const sessionResult = await new Promise<Record<string, any>>((resolve) => {
            chrome.storage.local.get([`crawl_session_${crawlId}`], resolve);
          });
          const session = sessionResult[`crawl_session_${crawlId}`];
          if (session && session.status !== 'complete') {
            setInterruptedSession({ crawlId: session.crawlId, opportunityName: session.opportunityName });
            break;
          }
        }
      };
      checkSessions();
    });

    // Detect current opportunity from active tab
    chrome.runtime.sendMessage({ type: 'DETECT_MODE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.opportunityName) {
        setDetectedOpportunity({
          name: response.opportunityName,
          url: response.url || '',
        });
      }
    });
  }, []);

  const handleStart = () => {
    if (selectedSE) {
      onStart(selectedSE);
    }
  };

  const canStart = !!selectedSE;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>SF Solution Crawler</h1>
          <p style={styles.subtitle}>Salesforce Opportunity Analyzer</p>
        </div>
        <button
          style={styles.settingsButton}
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      <div style={styles.section}>
        <label style={styles.label} htmlFor="se-select">Solution Engineer</label>
        <select
          id="se-select"
          style={styles.select}
          value={selectedSE}
          onChange={(e) => setSelectedSE(e.target.value)}
          aria-label="Select SE name"
        >
          {teamRoster.length === 0 && (
            <option value="">— configure team roster in settings —</option>
          )}
          {teamRoster.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Detected Opportunity</label>
        {detectedOpportunity ? (
          <div style={styles.opportunityCard}>
            <div style={styles.opportunityName}>{detectedOpportunity.name}</div>
            <div style={styles.opportunityUrl}>{detectedOpportunity.url}</div>
          </div>
        ) : (
          <div style={styles.opportunityCard}>
            <div style={styles.noOpportunity}>
              Navigate to a Salesforce Opportunity to begin.
            </div>
          </div>
        )}
      </div>

      {interruptedSession && (
        <div style={styles.section}>
          <label style={styles.label}>Interrupted Session</label>
          <div style={styles.resumeCard}>
            <div style={styles.resumeLabel}>Paused</div>
            <div style={styles.resumeOpportunity}>{interruptedSession.opportunityName}</div>
          </div>
          <button
            style={styles.resumeButton}
            onClick={() => onResume(interruptedSession.crawlId)}
            aria-label={`Resume crawl for ${interruptedSession.opportunityName}`}
          >
            Resume Previous Session
          </button>
        </div>
      )}

      <div style={styles.section}>
        <button
          style={canStart ? styles.startButton : styles.startButtonDisabled}
          onClick={handleStart}
          disabled={!canStart}
          aria-label="Start analysis"
        >
          Start Analysis
        </button>
      </div>

      <div style={styles.footer}>
        SF Solution Crawler v1.0
      </div>
    </div>
  );
}
