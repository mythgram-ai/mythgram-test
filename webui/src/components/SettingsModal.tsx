import React, { useState, useMemo } from 'react';
import {
  X,
  Cpu,
  Search,
  RefreshCw,
  Plus,
  Check,
  Trash2,
  Eye,
  Sliders,
  Plug,
} from 'lucide-react';

export interface ModelMetadata {
  id: string;
  name: string;
  contextWindow?: number | null;
  contextWindowFormatted?: string | null;
  visionSupport?: boolean | null;
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
  } | null;
}

export interface ProviderState {
  id: string;
  name: string;
  baseUrl: string;
  modelsUrl?: string;
  apiKey: string;
  hasApiKey: boolean;
  requiresApiKey: boolean;
  selectedModel: string;
  isCustom: boolean;
  manualContextLimit?: string | null;
  manualVisionSupport?: boolean | null;
  models: ModelMetadata[];
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderState[];
  activeProvider: string;
  activeModel: string;
  reasoningEffort: string;
  onRefreshSettings: () => Promise<void>;
}

const PRESET_EFFORTS = ['default', 'low', 'medium', 'high', 'max'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  activeProvider,
  activeModel,
  reasoningEffort,
  onRefreshSettings,
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    activeProvider || 'openrouter'
  );
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<'models' | 'connectors'>('models');
  const [connectorSettings, setConnectorSettings] = useState<{
    configured: boolean;
    api_key_masked: string;
    enabled: boolean;
    allow_sub_agents: boolean;
  }>({
    configured: false,
    api_key_masked: '',
    enabled: true,
    allow_sub_agents: false,
  });
  const [connectorApiKey, setConnectorApiKey] = useState('');
  const [connectorStatus, setConnectorStatus] = useState<string | null>(null);
  const [savingConnectors, setSavingConnectors] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    fetch('/api/connectors/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) setConnectorSettings(data.settings);
      })
      .catch(() => undefined);
  }, [isOpen]);

  const saveConnectorSettings = async (patch: Record<string, any>) => {
    setSavingConnectors(true);
    try {
      const res = await fetch('/api/connectors/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data?.settings) setConnectorSettings(data.settings);
      if (data.ok) {
        window.dispatchEvent(
          new CustomEvent('mythgram:connector-settings-updated', {
            detail: { settings: data.settings, apiKeyChanged: Boolean(patch.api_key) },
          })
        );
      }
      setConnectorStatus(data.ok ? 'Saved.' : data.error || 'Failed to save.');
      if (data.ok && patch.api_key) setConnectorApiKey('');
      setTimeout(() => setConnectorStatus(null), 4000);
    } catch (err: any) {
      setConnectorStatus(err?.message || 'Failed to save.');
    } finally {
      setSavingConnectors(false);
    }
  };

  // Form states for the currently viewed provider
  const currentProvider = useMemo(
    () =>
      providers.find((p) => p.id === selectedProviderId) ||
      providers[0] ||
      null,
    [providers, selectedProviderId]
  );

  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editSelectedModel, setEditSelectedModel] = useState('');
  const [editManualContext, setEditManualContext] = useState('');
  const [editManualVision, setEditManualVision] = useState<'auto' | 'yes' | 'no'>('auto');

  // Custom provider creation form
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customFetchedModels, setCustomFetchedModels] = useState<ModelMetadata[]>([]);
  const [fetchingCustomModels, setFetchingCustomModels] = useState(false);

  // Reasoning effort state
  const isCustomEffort =
    reasoningEffort && !PRESET_EFFORTS.includes(reasoningEffort);
  const [effortMode, setEffortMode] = useState<string>(
    isCustomEffort ? 'custom' : reasoningEffort || 'default'
  );
  const [customEffortText, setCustomEffortText] = useState<string>(
    isCustomEffort ? reasoningEffort : ''
  );

  React.useEffect(() => {
    if (currentProvider) {
      setEditBaseUrl(currentProvider.baseUrl || '');
      setEditApiKey(currentProvider.apiKey || '');
      setEditSelectedModel(currentProvider.selectedModel || '');
      setEditManualContext(currentProvider.manualContextLimit || '');
      setEditManualVision(
        currentProvider.manualVisionSupport === true
          ? 'yes'
          : currentProvider.manualVisionSupport === false
          ? 'no'
          : 'auto'
      );
    }
  }, [currentProvider?.id]);

  if (!isOpen) return null;

  const filteredProviders = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
      p.id.toLowerCase().includes(providerSearch.toLowerCase()) ||
      p.models.some((m) =>
        m.id.toLowerCase().includes(providerSearch.toLowerCase())
      )
  );

  const filteredModels = (currentProvider?.models || []).filter(
    (m) =>
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const selectedModelMeta = (currentProvider?.models || []).find(
    (m) => m.id === editSelectedModel
  );

  const handleSaveProvider = async (setAsActive: boolean = true) => {
    if (!currentProvider) return;
    setStatusMessage('Saving...');
    await fetch('/api/providers/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentProvider.id,
        name: currentProvider.name,
        baseUrl: editBaseUrl,
        apiKey: editApiKey,
        selectedModel: editSelectedModel,
        manualContextLimit: editManualContext || null,
        manualVisionSupport:
          editManualVision === 'auto'
            ? null
            : editManualVision === 'yes'
            ? true
            : false,
        setAsActive,
      }),
    });
    await onRefreshSettings();
    setStatusMessage('Saved configuration');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleFetchModels = async () => {
    if (!currentProvider) return;
    setFetchingModels(true);
    setStatusMessage('Fetching models from provider...');
    try {
      const res = await fetch(`/api/providers/${currentProvider.id}/fetch-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: editBaseUrl,
          apiKey: editApiKey,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await onRefreshSettings();
        if (data.models?.length > 0 && !editSelectedModel) {
          setEditSelectedModel(data.models[0].id);
        }
        setStatusMessage(`Fetched ${data.models?.length || 0} models`);
      } else {
        setStatusMessage(data.error || 'Could not fetch models');
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Error fetching models');
    } finally {
      setFetchingModels(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleFetchCustomProviderModels = async () => {
    if (!customBaseUrl.trim()) return;
    setFetchingCustomModels(true);
    try {
      const tempId = `custom_temp_${Date.now()}`;
      const res = await fetch(`/api/providers/${tempId}/fetch-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: customBaseUrl.trim(),
          apiKey: customApiKey.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.models)) {
        setCustomFetchedModels(data.models);
        if (data.models.length > 0 && !customModel) {
          setCustomModel(data.models[0].id);
        }
      }
    } finally {
      setFetchingCustomModels(false);
    }
  };

  const handleCreateCustomProvider = async () => {
    if (!customName.trim() || !customBaseUrl.trim()) return;
    const newId = `custom_${customName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`;

    await fetch('/api/providers/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newId,
        name: customName.trim(),
        baseUrl: customBaseUrl.trim(),
        apiKey: customApiKey.trim(),
        selectedModel: customModel.trim() || customFetchedModels[0]?.id || 'gpt-4o',
        setAsActive: true,
      }),
    });

    await onRefreshSettings();
    setSelectedProviderId(newId);
    setShowAddCustom(false);
    setCustomName('');
    setCustomBaseUrl('');
    setCustomApiKey('');
    setCustomModel('');
    setCustomFetchedModels([]);
  };

  const handleDeleteCustomProvider = async (id: string) => {
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    await onRefreshSettings();
    setSelectedProviderId('openrouter');
  };

  const handleReasoningEffortChange = async (mode: string, customVal?: string) => {
    setEffortMode(mode);
    const finalEffort = mode === 'custom' ? customVal || 'default' : mode;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasoningEffort: finalEffort }),
    });
    await onRefreshSettings();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Settings Popup Left Sidebar: Only one button = Models */}
        <div className="settings-sidebar">
          <div className="settings-sidebar-label">Settings</div>
          <button
            type="button"
            className={`nav-link ${activeSection === 'models' ? 'is-active' : ''}`}
            onClick={() => setActiveSection('models')}
          >
            <Cpu size={14} />
            <span>Models</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeSection === 'connectors' ? 'is-active' : ''}`}
            onClick={() => setActiveSection('connectors')}
          >
            <Plug size={14} />
            <span>Connectors</span>
          </button>
        </div>

        {/* Settings Main Panel */}
        <div className="settings-content">
          <div className="settings-header">
            <div className="settings-header-title">
              <span>
                {activeSection === 'connectors'
                  ? 'Application Connectors'
                  : 'LLM Models & Providers'}
              </span>
              <span className="topbar-badge">
                {activeSection === 'connectors'
                  ? connectorSettings.configured
                    ? `Composio key ${connectorSettings.api_key_masked}`
                    : 'Composio not configured'
                  : `Active: ${activeProvider} / ${activeModel}`}
              </span>
            </div>
            <div className="settings-header-actions">
              {activeSection === 'models' && (
                <button
                  type="button"
                  className="btn-secondary inline-center"
                  onClick={() => setShowAddCustom(!showAddCustom)}
                >
                  <Plus size={13} />
                  Add Custom Provider
                </button>
              )}
              <button type="button" className="icon-btn" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="settings-body">
            {activeSection === 'connectors' ? (
              <div className="connectors-settings-pane">
                <div className="connectors-settings-card">
                  <div className="connectors-settings-head">
                    <Plug size={16} />
                    <div>
                      <h3>Composio API key</h3>
                      <p>
                        Create a key at composio.dev and paste it here. It unlocks 450+
                        OAuth connectors that the agent can use on your behalf.
                      </p>
                    </div>
                  </div>
                  {connectorSettings.configured && (
                    <div className="connectors-settings-current">
                      <Check size={13} />
                      <span>Key saved: {connectorSettings.api_key_masked}</span>
                    </div>
                  )}
                  <div className="connectors-key-row">
                    <input
                      className="input-field"
                      type="password"
                      placeholder={
                        connectorSettings.configured
                          ? 'Enter a new key to replace the saved one'
                          : 'Paste your Composio API key'
                      }
                      value={connectorApiKey}
                      onChange={(e) => setConnectorApiKey(e.target.value)}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="btn-primary inline-center"
                      disabled={savingConnectors || !connectorApiKey.trim()}
                      onClick={() => saveConnectorSettings({ api_key: connectorApiKey.trim() })}
                    >
                      Save key
                    </button>
                  </div>
                  <a
                    className="connectors-settings-link"
                    href="https://app.composio.dev/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Composio dashboard →
                  </a>
                </div>

                <div className="connectors-settings-card">
                  <h3>Agent access</h3>
                  <label className="mcp-toggle-row">
                    <span>
                      <span className="mcp-toggle-label">Enable connectors</span>
                      <span className="mcp-toggle-hint">
                        Turn off to hide every connected tool from the agent.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={connectorSettings.enabled}
                      className={`mcp-switch ${connectorSettings.enabled ? 'is-on' : ''}`}
                      onClick={() =>
                        saveConnectorSettings({ enabled: !connectorSettings.enabled })
                      }
                    >
                      <span className="mcp-switch-knob" />
                    </button>
                  </label>
                  <label className="mcp-toggle-row">
                    <span>
                      <span className="mcp-toggle-label">Share tools with sub-agents</span>
                      <span className="mcp-toggle-hint">
                        Off by default. Sub-agents only see connected app tools when enabled.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={connectorSettings.allow_sub_agents}
                      className={`mcp-switch ${connectorSettings.allow_sub_agents ? 'is-on' : ''}`}
                      onClick={() =>
                        saveConnectorSettings({
                          allow_sub_agents: !connectorSettings.allow_sub_agents,
                        })
                      }
                    >
                      <span className="mcp-switch-knob" />
                    </button>
                  </label>
                </div>

                <div className="connectors-settings-card">
                  <h3>Manage connections</h3>
                  <p>
                    Browse the OAuth catalogue, connect applications with real logos, and
                    disconnect apps you no longer use.
                  </p>
                  <a className="btn-secondary inline-center connectors-settings-link" href="/connectors">
                    Open Connectors page
                  </a>
                </div>

                {connectorStatus && <div className="connectors-settings-status">{connectorStatus}</div>}
              </div>
            ) : (
              <div className="settings-models-pane">
            {/* Reasoning Effort Bar */}
            <div className="reasoning-bar">
              <div className="reasoning-label">
                <Sliders size={14} color="#a1a1aa" />
                <span>Reasoning Effort</span>
              </div>
              <div className="reasoning-options">
                {[...PRESET_EFFORTS, 'custom'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleReasoningEffortChange(opt, customEffortText)}
                    className="effort-btn"
                    style={{
                      border:
                        effortMode === opt
                          ? '1px solid #52525b'
                          : '1px solid #27272a',
                      backgroundColor:
                        effortMode === opt ? '#27272c' : '#121215',
                      color: effortMode === opt ? '#f4f4f5' : '#9e9ea7',
                    }}
                  >
                    {opt}
                  </button>
                ))}
                {effortMode === 'custom' && (
                  <input
                    type="text"
                    className="input-field effort-custom-input"
                    placeholder="Custom effort..."
                    value={customEffortText}
                    onChange={(e) => {
                      setCustomEffortText(e.target.value);
                      handleReasoningEffortChange('custom', e.target.value);
                    }}
                  />
                )}
              </div>
            </div>

            {/* Custom Provider Creation Box */}
            {showAddCustom && (
              <div className="custom-provider-box">
                <div className="custom-provider-title">
                  <span>Add Custom OpenAI-Compatible Provider</span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setShowAddCustom(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="form-grid-2" style={{ marginBottom: 10 }}>
                  <div>
                    <label className="field-label">
                      Provider Name *
                    </label>
                    <input
                      className="input-field"
                      placeholder="e.g. My vLLM Server"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">
                      Provider Base URL *
                    </label>
                    <input
                      className="input-field"
                      placeholder="https://api.example.com/v1"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">
                      API Key (Optional)
                    </label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="sk-..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">
                      Model to Use
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {customFetchedModels.length > 0 ? (
                        <select
                          className="input-field"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                        >
                          {customFetchedModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input-field"
                          placeholder="Model ID or click Fetch"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                        />
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleFetchCustomProviderModels}
                        disabled={fetchingCustomModels}
                        title="Automatically fetch models from custom provider"
                        style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <RefreshCw size={12} />
                        {fetchingCustomModels ? 'Fetching...' : 'Fetch Models'}
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  className="settings-actions-buttons"
                  style={{ justifyContent: 'flex-end' }}
                >
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCreateCustomProvider}
                  >
                    Save Custom Provider
                  </button>
                </div>
              </div>
            )}

            {/* Split View: Provider List (Left) & Selected Provider Config (Right) */}
            <div className="settings-split">
              {/* Providers List */}
              <div className="provider-list">
                <div className="provider-search">
                  <Search size={13} color="#71717a" />
                  <input
                    placeholder="Search providers..."
                    value={providerSearch}
                    onChange={(e) => setProviderSearch(e.target.value)}
                  />
                </div>
                <div className="provider-list-items">
                  {filteredProviders.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProviderId(p.id)}
                      className="provider-item"
                      style={{
                        backgroundColor:
                          p.id === currentProvider?.id ? '#202026' : 'transparent',
                        color: p.id === currentProvider?.id ? '#f4f4f5' : '#a1a1aa',
                      }}
                    >
                      <span className="provider-item-name">{p.name}</span>
                      {p.id === activeProvider && (
                        <Check size={12} color="#22c55e" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider Details & Model Selector */}
              {currentProvider && (
                <div className="provider-details">
                  <div className="provider-head">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {currentProvider.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'JetBrains Mono, monospace' }}>
                        ID: {currentProvider.id}
                      </div>
                    </div>
                    <div className="provider-head-actions">
                      {currentProvider.id === 'local' && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditBaseUrl('http://localhost:11434/v1')}
                          >
                            Ollama Default
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditBaseUrl('http://localhost:1234/v1')}
                          >
                            LM Studio
                          </button>
                        </>
                      )}
                      {currentProvider.isCustom && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleDeleteCustomProvider(currentProvider.id)}
                          style={{ color: '#f87171' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">
                        Base URL
                      </label>
                      <input
                        className="input-field"
                        value={editBaseUrl}
                        onChange={(e) => setEditBaseUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">
                        API Key {currentProvider.requiresApiKey ? '' : '(Optional)'}
                      </label>
                      <input
                        type="password"
                        className="input-field"
                        placeholder={currentProvider.hasApiKey ? 'Configured' : 'Enter API Key...'}
                        value={editApiKey}
                        onChange={(e) => setEditApiKey(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Model Search & Auto-Fetch */}
                  <div>
                    <div className="models-header">
                      <label style={{ fontSize: 11.5, color: '#d4d4d8', fontWeight: 500 }}>
                        Models ({filteredModels.length})
                      </label>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleFetchModels}
                        disabled={fetchingModels}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', fontSize: 11 }}
                      >
                        <RefreshCw size={11} />
                        {fetchingModels ? 'Fetching...' : 'Fetch Models from Provider'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        className="input-field"
                        placeholder="Search models or type custom model ID..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                      />
                    </div>

                    <div className="model-list">
                      {filteredModels.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => setEditSelectedModel(m.id)}
                          className="model-item"
                          style={{
                            backgroundColor:
                              editSelectedModel === m.id ? '#23232a' : 'transparent',
                          }}
                        >
                          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {m.id}
                          </span>
                          <div className="model-meta">
                            {m.contextWindowFormatted && (
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: '#18181c',
                                  border: '1px solid #2b2b33',
                                }}
                              >
                                {m.contextWindowFormatted}
                              </span>
                            )}
                            {m.visionSupport && (
                              <span
                                title="Vision Supported"
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: '#18181c',
                                  border: '1px solid #2b2b33',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                <Eye size={10} /> Vision
                              </span>
                            )}
                            {m.pricing?.prompt !== undefined && m.pricing?.prompt !== null && (
                              <span>${String(m.pricing.prompt)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {filteredModels.length === 0 && (
                        <div style={{ padding: 8, fontSize: 11.5, color: '#71717a' }}>
                          No models matched. You can enter a model ID manually below or click Fetch Models.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Model ID & Metadata Fallback (Context Limit in k/m & Vision Support Yes/No) */}
                  <div className="form-grid-3">
                    <div>
                      <label className="field-label">
                        Selected Model ID
                      </label>
                      <input
                        className="input-field"
                        value={editSelectedModel}
                        onChange={(e) => setEditSelectedModel(e.target.value)}
                        placeholder="e.g. gpt-4o"
                      />
                    </div>
                    <div>
                      <label className="field-label">
                        Context Limit (e.g. 128k, 1m)
                      </label>
                      <input
                        className="input-field"
                        value={editManualContext}
                        onChange={(e) => setEditManualContext(e.target.value)}
                        placeholder={
                          selectedModelMeta?.contextWindowFormatted || '128k or 1m'
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">
                        Vision Support
                      </label>
                      <select
                        className="input-field"
                        value={editManualVision}
                        onChange={(e) =>
                          setEditManualVision(e.target.value as 'auto' | 'yes' | 'no')
                        }
                      >
                        <option value="auto">
                          Auto ({selectedModelMeta?.visionSupport ? 'Yes' : 'No'})
                        </option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-actions">
                    <span className="settings-status">{statusMessage || ''}</span>
                    <div className="settings-actions-buttons">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleSaveProvider(false)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSaveProvider(true)}
                      >
                        Use Provider & Model
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
