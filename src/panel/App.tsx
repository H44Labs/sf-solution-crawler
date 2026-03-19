import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '18px', margin: 0 }}>SF Solution Crawler</h1>
      <p style={{ color: '#666', marginTop: '8px' }}>Ready to analyze Salesforce opportunities.</p>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
