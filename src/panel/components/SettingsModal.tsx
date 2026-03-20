import React, { useState, useEffect } from 'react';
import { AIProviderType, CrawlConfig, TeamMember } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_CONFIG: CrawlConfig = {
  maxPages: 30,
  tokenBudget: 100000,
  navigationTimeout: 10000,
  providers: [
    { type: 'claude', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6-20250514' },
  ],
  teamRoster: [
    { name: 'Jay Sanchez-Orsini', email: 'jay.sanchez-orsini@nice.com' },
  ],
  productDomains: ['WFM', 'EEM', 'Performance Management'],
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 1000,
    overflowY: 'auto',
    padding: '16px',
    boxSizing: 'border-box',
  },
  modal: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '400px',
    padding: '20px',
    color: '#e0e0e0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#888',
    fontSize: '18px',
    padding: '4px',
    lineHeight: 1,
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '10px',
    paddingBottom: '6px',
    borderBottom: '1px solid #2a2a4a',
  },
  label: {
    fontSize: '12px',
    color: '#aaa',
    marginBottom: '4px',
    display: 'block',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '13px',
    marginBottom: '10px',
    outline: 'none',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '13px',
    marginBottom: '10px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'monospace',
  },
  rosterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '8px',
  },
  rosterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  rosterName: {
    flex: 1,
    fontSize: '13px',
    color: '#e0e0e0',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#e94560',
    fontSize: '14px',
    padding: '0',
    lineHeight: 1,
    flexShrink: 0,
  },
  addRow: {
    display: 'flex',
    gap: '6px',
  },
  addInput: {
    flex: 1,
    padding: '8px 10px',
    backgroundColor: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  addButton: {
    padding: '8px 12px',
    backgroundColor: '#0f3460',
    border: '1px solid #1a5276',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: 0,
  },
  fileInput: {
    display: 'block',
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#16213e',
    border: '1px dashed #2a2a4a',
    borderRadius: '6px',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  fileName: {
    fontSize: '12px',
    color: '#4caf50',
    marginTop: '4px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '24px',
  },
  saveButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#0f3460',
    border: '1px solid #1a5276',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  cancelButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: 'transparent',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    color: '#aaa',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<CrawlConfig>(DEFAULT_CONFIG);
  const [personalApiKey, setPersonalApiKey] = useState('');
  const [fallbackApiKey, setFallbackApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>('claude');
  const [newRosterName, setNewRosterName] = useState('');
  const [newRosterEmail, setNewRosterEmail] = useState('');
  const [templateFileName, setTemplateFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    chrome.storage.local.get(['crawl_config', 'personal_api_key', 'fallback_api_key'], (result) => {
      if (result['crawl_config']) {
        setConfig(result['crawl_config']);
        const providerConfig = result['crawl_config'].providers?.[0];
        if (providerConfig) {
          setSelectedProvider(providerConfig.type);
        }
      }
      if (result['personal_api_key']) setPersonalApiKey(result['personal_api_key']);
      if (result['fallback_api_key']) setFallbackApiKey(result['fallback_api_key']);
    });
  }, [isOpen]);

  const handleSave = () => {
    const updatedConfig: CrawlConfig = {
      ...config,
      providers: config.providers.map((p, i) =>
        i === 0 ? { ...p, type: selectedProvider } : p,
      ),
    };
    chrome.storage.local.set({
      crawl_config: updatedConfig,
      personal_api_key: personalApiKey,
      fallback_api_key: fallbackApiKey,
    }, () => {
      onClose();
    });
  };

  const addRosterMember = () => {
    const name = newRosterName.trim();
    const email = newRosterEmail.trim();
    if (!name || !email) return;
    if (config.teamRoster.some(m => m.email === email)) return;
    setConfig(prev => ({ ...prev, teamRoster: [...prev.teamRoster, { name, email }] }));
    setNewRosterName('');
    setNewRosterEmail('');
  };

  const removeRosterMember = (email: string) => {
    setConfig(prev => ({ ...prev, teamRoster: prev.teamRoster.filter(m => m.email !== email) }));
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      if (data) {
        chrome.storage.local.set({ template_file: data, template_filename: file.name });
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-label="Settings">
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        {/* AI Provider */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>AI Provider</div>
          <label style={styles.label} htmlFor="provider-select">Provider</label>
          <select
            id="provider-select"
            style={styles.select}
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value as AIProviderType)}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
            <option value="groq">Groq</option>
          </select>

          <label style={styles.label} htmlFor="personal-key">Personal API Key</label>
          <input
            id="personal-key"
            type="password"
            style={styles.input}
            value={personalApiKey}
            onChange={(e) => setPersonalApiKey(e.target.value)}
            placeholder="sk-..."
            aria-label="Personal API key"
          />

          <label style={styles.label} htmlFor="fallback-key">Fallback Team Key</label>
          <input
            id="fallback-key"
            type="password"
            style={styles.input}
            value={fallbackApiKey}
            onChange={(e) => setFallbackApiKey(e.target.value)}
            placeholder="Shared team key"
            aria-label="Fallback team API key"
          />
        </div>

        {/* Team Roster */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Team Roster</div>
          <div style={styles.rosterList} aria-label="Team roster">
            {config.teamRoster.map((member) => (
              <div key={member.email} style={styles.rosterItem}>
                <div style={{ flex: 1 }}>
                  <div style={styles.rosterName}>{member.name}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{member.email}</div>
                </div>
                <button
                  style={styles.removeButton}
                  onClick={() => removeRosterMember(member.email)}
                  aria-label={`Remove ${member.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              style={styles.addInput}
              type="text"
              value={newRosterName}
              onChange={(e) => setNewRosterName(e.target.value)}
              placeholder="Full name"
              aria-label="New team member name"
            />
            <div style={styles.addRow}>
              <input
                style={styles.addInput}
                type="email"
                value={newRosterEmail}
                onChange={(e) => setNewRosterEmail(e.target.value)}
                placeholder="email@nice.com"
                aria-label="New team member email"
                onKeyDown={(e) => { if (e.key === 'Enter') addRosterMember(); }}
              />
              <button style={styles.addButton} onClick={addRosterMember} aria-label="Add team member">
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Template */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Document Template</div>
          <div style={{
            backgroundColor: '#0a2a1a',
            border: '1px solid #1a4a2a',
            borderRadius: '6px',
            padding: '10px',
            marginBottom: '10px',
            fontSize: '12px',
            color: '#4caf50',
          }}>
            Bundled: WFM Design Document Template (Cloud) v1 2025
          </div>
          <label style={styles.label} htmlFor="template-upload">Upload custom template (optional override)</label>
          <input
            id="template-upload"
            type="file"
            accept=".docx"
            style={styles.fileInput}
            onChange={handleTemplateUpload}
            aria-label="Upload document template"
          />
          {templateFileName && (
            <div style={styles.fileName}>✓ Using custom: {templateFileName}</div>
          )}
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.cancelButton} onClick={onClose} aria-label="Cancel settings">
            Cancel
          </button>
          <button style={styles.saveButton} onClick={handleSave} aria-label="Save settings">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
