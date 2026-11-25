import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Menu,
  Settings,
  Plug,
  PlugZap,
  RefreshCw,
  X,
  Terminal,
  Globe,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { McpIcon } from '../components/McpIcon';
import { ZapierNotice } from '../components/ZapierNotice';

interface McpTool {
  name: string;
  qualified_name: string;
  description: string;
  enabled: boolean;
}

interface McpServer {
  id: string;
  name: string;
  description: string;
  kind: 'local' | 'remote';
  url?: string;
  auth_type?: 'no_auth' | 'oauth';
  enabled: boolean;
  allow_sub_agents: boolean;
  disabled_tools: string[];
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'auth_required';
  error?: string;
  tools: McpTool[];
  authorization_url?: string;
}

interface McpPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const STATUS_LABEL: Record<McpServer['status'], string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
  error: 'Error',
  auth_required: 'Authorization required',
};

const StatusDot: React.FC<{ status: McpServer['status'] }> = ({ status }) => (
  <span className={`mcp-status-dot is-${status}`} title={STATUS_LABEL[status]} />
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="mcp-toggle-row">
    <span>
      <span className="mcp-toggle-label">{label}</span>
      {hint && <span className="mcp-toggle-hint">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`mcp-switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="mcp-switch-knob" />
    </button>
  </label>
);

export const McpPage: React.FC<McpPageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<'local' | 'remote'>('local');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [configJson, setConfigJson] = useState(
    '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n}'
  );
  const [remoteUrl, setRemoteUrl] = useState('');
  const [authType, setAuthType] = useState<'no_auth' | 'oauth'>('no_auth');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadServers = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      const list: McpServer[] = Array.isArray(data.servers) ? data.servers : [];
      setServers(list);
      setSelectedId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    if (oauth === 'success') setToast('MCP server authorized successfully.');
    if (oauth === 'error') setToast(`Authorization failed: ${params.get('reason') || 'unknown error'}`);
    if (oauth) {
      window.history.replaceState({}, '', '/mcp');
      setTimeout(() => setToast(''), 6000);
    }
  }, [loadServers]);

  const selected = useMemo(
    () => servers.find((s) => s.id === selectedId) || null,
    [servers, selectedId]
  );

  const patchServer = async (id: string, patch: Record<string, any>) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/mcp/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.ok) setToast(data.error || 'Update failed');
      await loadServers();
    } finally {
      setBusy(null);
    }
  };

  const connectServer = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/mcp/servers/${id}/connect`, { method: 'POST' });
      const data = await res.json();
      if (data.authorization_url) {
        window.open(data.authorization_url, '_blank', 'noopener');
      } else if (!data.ok) {
        setToast(data.error || 'Connection failed');
      } else {
        setToast('Connected.');
        setTimeout(() => setToast(''), 4000);
      }
      await loadServers();
    } finally {
      setBusy(null);
    }
  };

  const disconnectServer = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/mcp/servers/${id}/disconnect`, { method: 'POST' });
      await loadServers();
    } finally {
      setBusy(null);
    }
  };

  const removeServer = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
      await loadServers();
    } finally {
      setBusy(null);
    }
  };

  const toggleTool = (server: McpServer, toolName: string) => {
    const disabled = server.disabled_tools.includes(toolName)
      ? server.disabled_tools.filter((t) => t !== toolName)
      : [...server.disabled_tools, toolName];
    void patchServer(server.id, { disabled_tools: disabled });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !description.trim()) {
      setError('Name and description are required.');
      return;
    }
    setBusy('add');
    try {
      const payload: Record<string, any> =
        addKind === 'local'
          ? { kind: 'local', name, description, configJson }
          : { kind: 'remote', name, description, url: remoteUrl, auth_type: authType };
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok && !data.server?.authorization_url) {
        setError(data.error || 'Failed to connect MCP server.');
        if (!data.server) return;
      }
      if (data.server?.authorization_url) {
        window.open(data.server.authorization_url, '_blank', 'noopener');
        setToast('Complete authorization in the opened tab.');
      }
      setShowAdd(false);
      setName('');
      setDescription('');
      setRemoteUrl('');
      await loadServers();
      if (data.server?.id) setSelectedId(data.server.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to add MCP server.');
    } finally {
      setBusy(null);
    }
  };

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
            <McpIcon size={16} />
            <span>MCP Servers</span>
            <span className="version-block">.mythgram/mcp</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={13} />
            Add Server
          </button>
          <button type="button" className="topbar-btn" onClick={loadServers}>
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <ZapierNotice />

      <div className="mcp-layout">
        <div className="mcp-list">
          <div className="mcp-list-heading">AVAILABLE SERVERS ({servers.length})</div>
          {loading && <div className="mcp-empty">Loading servers…</div>}
          {!loading && servers.length === 0 && (
            <div className="mcp-empty">
              <McpIcon size={28} />
              <p>No MCP servers yet.</p>
              <span>Connect a local or remote server to extend the agent.</span>
            </div>
          )}
          {servers.map((server) => (
            <button
              type="button"
              key={server.id}
              className={`mcp-card ${selectedId === server.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(server.id)}
            >
              <div className="mcp-card-head">
                <StatusDot status={server.status} />
                <span className="mcp-card-name">{server.name}</span>
                <span className="mcp-kind-badge">{server.kind}</span>
              </div>
              <div className="mcp-card-desc">{server.description}</div>
              <div className="mcp-card-meta">
                <span>{STATUS_LABEL[server.status]}</span>
                <span>{server.tools.length} tools</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mcp-detail">
          {selected ? (
            <div className="mcp-detail-inner">
              <div className="mcp-detail-header">
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.description}</p>
                  <div className="mcp-detail-sub">
                    <StatusDot status={selected.status} />
                    <span>{STATUS_LABEL[selected.status]}</span>
                    <span className="mcp-sep">•</span>
                    {selected.kind === 'local' ? <Terminal size={12} /> : <Globe size={12} />}
                    <span>{selected.kind === 'local' ? 'Local (stdio)' : selected.url}</span>
                  </div>
                </div>
                <div className="mcp-detail-actions">
                  {selected.status === 'connected' ? (
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      onClick={() => disconnectServer(selected.id)}
                      disabled={busy === selected.id}
                    >
                      <Plug size={13} />
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary inline-center"
                      onClick={() => connectServer(selected.id)}
                      disabled={busy === selected.id}
                    >
                      <PlugZap size={13} />
                      {selected.status === 'auth_required' ? 'Authorize' : 'Connect'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn mcp-danger"
                    title="Delete server"
                    onClick={() => removeServer(selected.id)}
                    disabled={busy === selected.id}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {selected.error && (
                <div className="mcp-alert">
                  <AlertTriangle size={14} />
                  <span>{selected.error}</span>
                </div>
              )}

              {selected.authorization_url && (
                <a
                  className="mcp-auth-link"
                  href={selected.authorization_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={13} />
                  Open authorization page
                </a>
              )}

              <div className="mcp-settings-grid">
                <Toggle
                  label="Server enabled"
                  hint="Turn off to hide this server's tools from the agent."
                  checked={selected.enabled}
                  onChange={(v) => patchServer(selected.id, { enabled: v })}
                />
                <Toggle
                  label="Share tools with sub-agents"
                  hint="On by default. Sub-agents can use this server's tools."
                  checked={selected.allow_sub_agents}
                  onChange={(v) => patchServer(selected.id, { allow_sub_agents: v })}
                />
              </div>

              <div className="mcp-tools-section">
                <div className="mcp-tools-heading">
                  <ShieldCheck size={14} />
                  <span>Tools ({selected.tools.length})</span>
                </div>
                {selected.tools.length === 0 ? (
                  <div className="mcp-empty-small">
                    {selected.status === 'connected'
                      ? 'This server did not advertise any tools.'
                      : 'Connect the server to load its tools.'}
                  </div>
                ) : (
                  <div className="mcp-tool-list">
                    {selected.tools.map((tool) => (
                      <div key={tool.name} className="mcp-tool-row">
                        <div>
                          <div className="mcp-tool-name">{tool.name}</div>
                          <div className="mcp-tool-desc">{tool.description}</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={tool.enabled}
                          className={`mcp-switch is-small ${tool.enabled ? 'is-on' : ''}`}
                          title={tool.enabled ? 'Disable tool' : 'Enable tool'}
                          onClick={() => toggleTool(selected, tool.name)}
                        >
                          <span className="mcp-switch-knob" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mcp-empty mcp-empty-large">
              <McpIcon size={44} />
              <p>Select an MCP server</p>
              <span>Or add a new one to give the agent extra tools.</span>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="workspace-modal mcp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="workspace-modal-title">
              <div className="modal-title">
                <McpIcon size={16} />
                <span>Add MCP Server</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowAdd(false)}>
                <X size={16} />
              </button>
            </div>
            <form className="mcp-form" onSubmit={handleAdd}>
              <div className="mcp-tabs">
                <button
                  type="button"
                  className={`mcp-tab ${addKind === 'local' ? 'is-active' : ''}`}
                  onClick={() => setAddKind('local')}
                >
                  <Terminal size={13} /> Local (stdio)
                </button>
                <button
                  type="button"
                  className={`mcp-tab ${addKind === 'remote' ? 'is-active' : ''}`}
                  onClick={() => setAddKind('remote')}
                >
                  <Globe size={13} /> Remote (HTTP)
                </button>
              </div>

              <label className="field-label">Server name</label>
              <input
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. filesystem"
              />

              <label className="field-label">Description</label>
              <input
                className="input-field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this server provide?"
              />

              {addKind === 'local' ? (
                <>
                  <label className="field-label">MCP configuration JSON</label>
                  <textarea
                    className="input-field mcp-json-input"
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    spellCheck={false}
                  />
                </>
              ) : (
                <>
                  <label className="field-label">Server URL</label>
                  <input
                    className="input-field"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                  />
                  <label className="field-label">Authentication</label>
                  <select
                    className="input-field"
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as 'no_auth' | 'oauth')}
                  >
                    <option value="no_auth">No authentication</option>
                    <option value="oauth">OAuth (browser authorization)</option>
                  </select>
                </>
              )}

              {error && <div className="mcp-alert">{error}</div>}

              <div className="mcp-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy === 'add'}>
                  {busy === 'add' ? 'Connecting…' : 'Add & Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="mcp-toast">{toast}</div>}
    </main>
  );
};
