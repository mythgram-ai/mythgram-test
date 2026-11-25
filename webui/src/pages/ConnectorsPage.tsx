import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  Settings,
  RefreshCw,
  Search,
  Plug,
  PlugZap,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface Connector {
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  app_url?: string;
  connected: boolean;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  tool_count: number;
  error?: string;
}

interface ConnectorSettings {
  configured: boolean;
  api_key_masked: string;
  enabled: boolean;
  allow_sub_agents: boolean;
}

interface ConnectorsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const STATUS_LABEL: Record<Connector['status'], string> = {
  connected: 'Connected',
  pending: 'Pending authorization',
  error: 'Connection failed',
  disconnected: 'Not connected',
};

export const ConnectorsPage: React.FC<ConnectorsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [settings, setSettings] = useState<ConnectorSettings>({
    configured: false,
    api_key_masked: '',
    enabled: true,
    allow_sub_agents: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected'>('all');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadConnectors = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/connectors${force ? '?force=1' : ''}`);
      const data = await res.json();
      setSettings(data.settings || settings);
      if (!data.configured) {
        setConnectors([]);
        return;
      }
      if (!data.ok) {
        setError(data.error || 'Failed to load connectors.');
      }
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load connectors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectors();
    return () => {
      Object.values(pollTimers.current).forEach((timer) => clearInterval(timer));
    };
  }, [loadConnectors]);

  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{ settings?: ConnectorSettings; apiKeyChanged?: boolean }>
      ).detail;
      if (detail?.settings) setSettings(detail.settings);
      if (detail?.apiKeyChanged) void loadConnectors(true);
    };
    window.addEventListener('mythgram:connector-settings-updated', onSettingsUpdated);
    return () =>
      window.removeEventListener('mythgram:connector-settings-updated', onSettingsUpdated);
  }, [loadConnectors]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  };

  const pollStatus = (slug: string) => {
    if (pollTimers.current[slug]) clearInterval(pollTimers.current[slug]);
    const startedAt = Date.now();
    pollTimers.current[slug] = setInterval(async () => {
      if (Date.now() - startedAt > 3 * 60 * 1000) {
        clearInterval(pollTimers.current[slug]);
        delete pollTimers.current[slug];
        setBusy(null);
        return;
      }
      try {
        const res = await fetch(`/api/connectors/${encodeURIComponent(slug)}/status`);
        const data = await res.json();
        if (data.connected) {
          clearInterval(pollTimers.current[slug]);
          delete pollTimers.current[slug];
          setBusy(null);
          showToast(`${slug} connected.`);
          await loadConnectors();
        } else if (data.status === 'error') {
          clearInterval(pollTimers.current[slug]);
          delete pollTimers.current[slug];
          setBusy(null);
          setError(data.error || 'Connection failed.');
        }
      } catch {
        // keep polling until the timeout
      }
    }, 3000);
  };

  const connect = async (connector: Connector) => {
    setBusy(connector.slug);
    setError('');
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector.slug)}/connect`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to start the connection.');
        setBusy(null);
        return;
      }
      window.open(data.redirect_url, '_blank', 'noopener');
      showToast('Complete authorization in the opened tab.');
      pollStatus(connector.slug);
    } catch (err: any) {
      setError(err?.message || 'Failed to start the connection.');
      setBusy(null);
    }
  };

  const disconnect = async (connector: Connector) => {
    setBusy(connector.slug);
    try {
      await fetch(`/api/connectors/${encodeURIComponent(connector.slug)}/disconnect`, {
        method: 'POST',
      });
      showToast(`${connector.name} disconnected.`);
      await loadConnectors();
    } finally {
      setBusy(null);
    }
  };

  const toggleSubAgents = async () => {
    const next = !settings.allow_sub_agents;
    setSettings((prev) => ({ ...prev, allow_sub_agents: next }));
    await fetch('/api/connectors/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_sub_agents: next }),
    });
    showToast(next ? 'Sub-agents can use connected tools.' : 'Sub-agent access disabled.');
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return connectors.filter((connector) => {
      if (filter === 'connected' && !connector.connected) return false;
      if (!needle) return true;
      return (
        connector.name.toLowerCase().includes(needle) ||
        connector.slug.toLowerCase().includes(needle) ||
        connector.description.toLowerCase().includes(needle)
      );
    });
  }, [connectors, search, filter]);

  const connectedCount = connectors.filter((c) => c.connected).length;

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
            <Plug size={16} />
            <span>Application Connectors</span>
            <span className="version-block">Composio</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={() => loadConnectors(true)}
            disabled={loading}
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {!settings.configured ? (
        <div className="connectors-empty-state">
          <Plug size={40} />
          <h2>Connect your favourite apps</h2>
          <p>
            Add a Composio API key to let the agent use Gmail, Slack, GitHub, Notion, Google
            Drive and 450+ other applications through one-click browser authorization.
          </p>
          <button type="button" className="btn-primary inline-center" onClick={onOpenSettings}>
            <Settings size={14} />
            Open Settings → Connectors
          </button>
        </div>
      ) : (
        <>
          <div className="connectors-toolbar">
            <div className="connectors-search">
              <Search size={14} />
              <input
                className="connectors-search-input"
                placeholder="Search 450+ connectors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="connectors-filter">
              <button
                type="button"
                className={`connectors-filter-btn ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({connectors.length})
              </button>
              <button
                type="button"
                className={`connectors-filter-btn ${filter === 'connected' ? 'is-active' : ''}`}
                onClick={() => setFilter('connected')}
              >
                Connected ({connectedCount})
              </button>
            </div>
            <label className="connectors-subagent-toggle">
              <span>
                <span className="connectors-subagent-title">Share tools with sub-agents</span>
                <span className="connectors-subagent-hint">
                  Off by default. Connected tools stay private to the main agent.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.allow_sub_agents}
                className={`mcp-switch ${settings.allow_sub_agents ? 'is-on' : ''}`}
                onClick={toggleSubAgents}
              >
                <span className="mcp-switch-knob" />
              </button>
            </label>
          </div>

          {error && (
            <div className="mcp-alert connectors-alert">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <>
              <div className="connectors-loading-note">
                <Loader2 size={13} className="spin" />
                <span>Fetching OAuth connectors from Composio…</span>
              </div>
              <div className="connectors-grid" aria-busy="true">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="connector-card connector-skeleton"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <div className="connector-card-head">
                      <span className="skeleton-box skeleton-logo" />
                      <div className="connector-title" style={{ flex: 1 }}>
                        <span className="skeleton-box skeleton-line" style={{ width: '62%' }} />
                        <span className="skeleton-box skeleton-line" style={{ width: '38%' }} />
                      </div>
                    </div>
                    <span className="skeleton-box skeleton-line" style={{ width: '100%' }} />
                    <span className="skeleton-box skeleton-line" style={{ width: '78%' }} />
                    <div className="connector-card-foot">
                      <span className="skeleton-box skeleton-line" style={{ width: '28%' }} />
                      <span className="skeleton-box skeleton-pill" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : visible.length === 0 ? (
            <div className="connectors-empty-state">
              <Plug size={32} />
              <p>No connectors match this view.</p>
            </div>
          ) : (
            <div className="connectors-grid">
              {visible.map((connector) => (
                <div
                  key={connector.slug}
                  className={`connector-card ${connector.connected ? 'is-connected' : ''}`}
                >
                  <div className="connector-card-head">
                    <span className="connector-logo">
                      {connector.logo ? (
                        <img src={connector.logo} alt={connector.name} loading="lazy" />
                      ) : (
                        <Plug size={18} />
                      )}
                    </span>
                    <div className="connector-title">
                      <span className="connector-name">{connector.name}</span>
                      <span className={`connector-status is-${connector.status}`}>
                        {connector.connected && <Check size={10} />}
                        {STATUS_LABEL[connector.status]}
                      </span>
                    </div>
                  </div>
                  <p className="connector-desc">{connector.description || 'No description.'}</p>
                  <div className="connector-card-foot">
                    <span className="connector-tools">
                      {connector.connected ? `${connector.tool_count} tools available` : 'OAuth'}
                    </span>
                    {connector.connected ? (
                      <button
                        type="button"
                        className="btn-secondary connector-btn"
                        onClick={() => disconnect(connector)}
                        disabled={busy === connector.slug}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary connector-btn"
                        onClick={() => connect(connector)}
                        disabled={busy === connector.slug}
                      >
                        {busy === connector.slug ? (
                          <Loader2 size={12} className="spin" />
                        ) : (
                          <PlugZap size={12} />
                        )}
                        {busy === connector.slug ? 'Waiting…' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {toast && <div className="mcp-toast">{toast}</div>}
    </main>
  );
};
