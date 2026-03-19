import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StartScreen } from './screens/StartScreen';
import { SettingsModal } from './components/SettingsModal';

type Screen = 'start' | 'crawling' | 'review' | 'download';

function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [showSettings, setShowSettings] = useState(false);
  const [activeCrawlId, setActiveCrawlId] = useState<string | null>(null);
  const [activeSEName, setActiveSEName] = useState<string>('');

  const handleStart = (seName: string) => {
    setActiveSEName(seName);
    setScreen('crawling');
  };

  const handleResume = (crawlId: string) => {
    setActiveCrawlId(crawlId);
    setScreen('crawling');
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#888' }}>Crawling screen — coming in Task 14</p>
          <button
            onClick={() => setScreen('start')}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a4a',
              borderRadius: '6px',
              color: '#aaa',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ← Back to Start
          </button>
        </div>
      )}

      {screen === 'review' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#888' }}>Review screen — coming in Task 15</p>
        </div>
      )}

      {screen === 'download' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#888' }}>Download screen — coming in Task 15</p>
        </div>
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
