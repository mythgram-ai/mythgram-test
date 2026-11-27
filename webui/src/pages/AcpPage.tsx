import React, { useCallback, useEffect, useState } from 'react';
import {
  Menu,
  Settings,
  Terminal,
  Bot,
  Cpu,
  Check,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface AcpAgentOption {
  id: string;
  name: string;
  description: string;
}

interface AcpSettings {
  ok: boolean;
  agentMode: string;
  customAgents: AcpAgentOption[];
  provider: { id: string; name: string; model: string };
  config: unknown;
}

interface AcpPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const CONFIG_SNIPPET = `{
  "agent_servers": {
    "mythgram": {
      "command": "npx",
      "args": ["--yes", "mythgram"]
    }
  }
}`;

const cardStyle: React.CSSProperties = {
  backgroundColor: '#0f0f13',
  border: '1px solid #1f1f25',
  borderRadius: 12,
  padding: 16,
};

const modeRowStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 9,
  border: `1px solid ${selected ? '#3a3a46' : '#1f1f25'}`,
  backgroundColor: selected ? '#1c1c22' : '#131317',
  color: 'inherit',
  cursor: 'pointer',
});

export const AcpPage: React.FC<AcpPageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [settings, setSettings] = useState<AcpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/acp/settings');
      const data = await res.json();
      if (data?.ok) setSettings(data);
      else setError(data?.error || 'Failed to load ACP settings');
    } catch {
      setError('Failed to load ACP settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const selectAgentMode = async (agentMode: string) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/acp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentMode }),
      });
      const data = await res.json();
      if (data?.ok) setSettings(data);
      else setError(data?.error || 'Failed to save ACP settings');
    } catch {
      setError('Failed to save ACP settings');
    } finally {
      setSaving(false);
    }
  };

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(CONFIG_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  };

  const agentMode = settings?.agentMode || 'default';
  const customAgents = settings?.customAgents || [];

  return (
    <main className="main-canvas">
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            title="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="app-topbar-brand">
            <Terminal size={15} />
            <span>ACP</span>
            <span className="version-block">Agent Client Protocol</span>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" onClick={loadSettings}>
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px 40px' }}>
        <div
          style={{
            maxWidth: 860,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {error && (
            <div
              style={{
                ...cardStyle,
                borderColor: 'rgba(248,113,113,0.35)',
                color: '#f87171',
                fontSize: 12.5,
              }}
            >
              {error}
            </div>
          )}

          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#f4f4f5' }}>Connect an ACP client</h2>
            <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#9e9ea7', lineHeight: 1.5 }}>
              Mythgram speaks the Agent Client Protocol over stdio. Add this server to any ACP
              compatible editor (Zed, JetBrains, Neovim, and others).
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  margin: 0,
                  padding: '12px 14px',
                  borderRadius: 9,
                  backgroundColor: '#08080a',
                  border: '1px solid #1f1f25',
                  color: '#d4d4d8',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  lineHeight: 1.55,
                  overflowX: 'auto',
                }}
              >
                <code>{CONFIG_SNIPPET}</code>
              </pre>
              <button
                type="button"
                className="topbar-btn"
                onClick={copyConfig}
                style={{ position: 'absolute', top: 8, right: 8 }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#64646c', lineHeight: 1.5 }}>
              The server starts on demand. No port, no login: the client launches{' '}
              <code style={{ color: '#a1a1aa' }}>npx --yes mythgram</code> and talks JSON-RPC over
              stdin/stdout.
            </p>
          </section>

          <section style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={15} style={{ color: '#a1a1aa' }} />
              <h2 style={{ margin: 0, fontSize: 15, color: '#f4f4f5' }}>Agent</h2>
              {saving && <Loader2 size={13} className="spin" style={{ color: '#71717a' }} />}
            </div>
            <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#9e9ea7', lineHeight: 1.5 }}>
              Pick the agent ACP sessions start with. Clients can still switch modes per session.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                style={modeRowStyle(agentMode === 'default')}
                onClick={() => selectAgentMode('default')}
                disabled={loading || saving}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `1px solid ${agentMode === 'default' ? '#4ade80' : '#3a3a46'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {agentMode === 'default' && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#4ade80',
                      }}
                    />
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#f4f4f5', fontWeight: 600 }}>
                    Default Mythgram agent
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: '#9e9ea7', marginTop: 2 }}>
                    Full runtime and every tool.
                  </span>
                </span>
              </button>

              {customAgents.map((agent) => (
                <button
                  type="button"
                  key={agent.id}
                  style={modeRowStyle(agentMode === agent.id)}
                  onClick={() => selectAgentMode(agent.id)}
                  disabled={loading || saving}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `1px solid ${agentMode === agent.id ? '#4ade80' : '#3a3a46'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {agentMode === agent.id && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: '#4ade80',
                        }}
                      />
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, color: '#f4f4f5', fontWeight: 600 }}>
                      {agent.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: '#9e9ea7', marginTop: 2 }}>
                      {agent.description || 'Custom Mythgram agent.'}
                    </span>
                  </span>
                </button>
              ))}

              {!loading && customAgents.length === 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64646c' }}>
                  No custom agents yet. Create one on the Custom Agents page to use it here.
                </p>
              )}
            </div>
          </section>

          <section style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={15} style={{ color: '#a1a1aa' }} />
              <h2 style={{ margin: 0, fontSize: 15, color: '#f4f4f5' }}>Provider</h2>
            </div>
            <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: '#9e9ea7', lineHeight: 1.5 }}>
              ACP uses the same provider and model as the WebUI. Change it once in Settings and
              both surfaces stay in sync.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 18,
                padding: '10px 12px',
                borderRadius: 9,
                backgroundColor: '#131317',
                border: '1px solid #1f1f25',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: '#d4d4d8',
              }}
            >
              <span>
                <span style={{ color: '#71717a' }}>provider </span>
                {settings?.provider.name || '…'}
              </span>
              <span>
                <span style={{ color: '#71717a' }}>model </span>
                {settings?.provider.model || '…'}
              </span>
            </div>
            <button
              type="button"
              className="topbar-btn"
              style={{ marginTop: 10 }}
              onClick={onOpenSettings}
            >
              <Settings size={13} />
              <span>Change provider</span>
            </button>
          </section>
        </div>
      </div>
    </main>
  );
};
