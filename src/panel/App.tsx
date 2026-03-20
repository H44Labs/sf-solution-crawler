import React, { useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { StartScreen } from './screens/StartScreen';
import { CrawlScreen } from './screens/CrawlScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { DownloadScreen } from './screens/DownloadScreen';
import { SettingsModal } from './components/SettingsModal';
import { useCrawlState } from './hooks/useCrawlState';
import { sendMessage } from './hooks/useMessaging';

type Screen = 'start' | 'crawling' | 'review' | 'download';

function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [showSettings, setShowSettings] = useState(false);
  const [crawlEvents, setCrawlEvents] = useState<string[]>([]);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);

  const crawlState = useCrawlState();

  // Listen for crawl events from the service worker
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'CRAWL_UPDATE' && message.payload?.event) {
        setCrawlEvents(prev => [...prev, message.payload.event]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleStart = useCallback((seName: string) => {
    setCrawlEvents(['Starting analysis...']);
    setScreen('crawling');
    sendMessage({ type: 'START_CRAWL', payload: { seName } });
  }, []);

  const handleResume = useCallback((crawlId: string) => {
    setScreen('crawling');
    sendMessage({ type: 'RESUME_CRAWL', payload: { crawlId } });
  }, []);

  const handleAnswer = useCallback((answer: string) => {
    sendMessage({ type: 'USER_ANSWER', payload: { answer } });
  }, []);

  const handlePause = useCallback(() => {
    sendMessage({ type: 'PAUSE_CRAWL' });
    setScreen('start');
  }, []);

  const handleCancel = useCallback(() => {
    sendMessage({ type: 'CANCEL_CRAWL' });
    setScreen('start');
  }, []);

  const handleApprove = useCallback(() => {
    sendMessage({ type: 'GENERATE_DOC', payload: { sessionState: crawlState } });
    setScreen('download');
  }, [crawlState]);

  const handleRecrawlSection = useCallback((section: string) => {
    sendMessage({ type: 'RECRAWL_SECTION', payload: { section } });
    setScreen('crawling');
  }, []);

  const handleEditField = useCallback((fieldName: string, newValue: string) => {
    // Update local state — in a full implementation this would persist to storage
  }, []);

  const handleDownload = useCallback(() => {
    if (documentBlob) {
      const url = URL.createObjectURL(documentBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Solution_Design_${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [documentBlob]);

  const handleRegenerate = useCallback(() => {
    setScreen('review');
  }, []);

  // Derive UI state from crawl state
  const fieldsFound = crawlState ? Object.keys(crawlState.fieldsFound).length : 0;
  const fieldsTotal = crawlState
    ? Object.keys(crawlState.fieldsFound).length + crawlState.fieldsRemaining.length
    : 0;
  const pendingQuestion = crawlState?.pendingQuestions?.[0] || null;
  const tokenUsage = crawlState?.tokenUsage || { total: 0, budget: 100000 };

  // Auto-transition to review when crawl completes
  if (screen === 'crawling' && crawlState?.status === 'complete') {
    setScreen('review');
  }

  const fieldSummary = {
    total: fieldsTotal,
    filled: fieldsFound,
    flagged: crawlState
      ? Object.values(crawlState.fieldsFound).filter(f => f.confidence !== 'high').length
      : 0,
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {screen === 'start' && (
        <StartScreen
          onStart={handleStart}
          onResume={handleResume}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'crawling' && (
        <CrawlScreen
          events={crawlEvents}
          fieldsFound={fieldsFound}
          fieldsTotal={fieldsTotal}
          pendingQuestion={pendingQuestion}
          tokenUsage={tokenUsage}
          onAnswer={handleAnswer}
          onPause={handlePause}
          onCancel={handleCancel}
        />
      )}

      {screen === 'review' && crawlState && (
        <ReviewScreen
          fields={Object.fromEntries(
            Object.entries(crawlState.fieldsFound).map(([k, v]) => [k, {
              value: v.value,
              confidence: v.confidence,
              source: v.source,
              rawEvidence: v.rawEvidence,
            }])
          )}
          onApprove={handleApprove}
          onRecrawlSection={handleRecrawlSection}
          onCancel={handleCancel}
          onEditField={handleEditField}
        />
      )}

      {screen === 'download' && (
        <DownloadScreen
          documentBlob={documentBlob}
          fieldSummary={fieldSummary}
          onDownload={handleDownload}
          onRegenerate={handleRegenerate}
        />
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
