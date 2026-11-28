import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Check,
  Menu,
  Settings,
  Save,
  X,
  Upload,
  Pencil,
  Power,
  Image as ImageIcon,
} from 'lucide-react';

interface CustomAgentItem {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  logo: string;
  created_at: number;
  updated_at: number;
}

interface ToolOption {
  name: string;
  description: string;
}

interface CustomAgentsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

interface AgentDraft {
  id?: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  logoDataUrl?: string;
  logoPreview: string;
  useDefaultLogo: boolean;
}

const DEFAULT_LOGO = '/logo.svg';
const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });
}

const AgentLogo: React.FC<{ src: string; size: number; radius?: number }> = ({
  src,
  size,
  radius = 8,
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        border: '1px solid #262626',
      }}
    >
      <img
        src={failed ? DEFAULT_LOGO : src || DEFAULT_LOGO}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </span>
  );
};

export const CustomAgentsPage: React.FC<CustomAgentsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [agents, setAgents] = useState<CustomAgentItem[]>([]);
  const [allTools, setAllTools] = useState<ToolOption[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [toolFilter, setToolFilter] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-agents');
      const data = await res.json();
      if (Array.isArray(data.agents)) setAgents(data.agents);
      if (Array.isArray(data.tools)) setAllTools(data.tools);
      setActiveAgentId(data.activeAgentId || null);
      setSelectedAgentId((prev) => {
        if (prev && data.agents?.some((a: CustomAgentItem) => a.id === prev)) return prev;
        return data.agents?.[0]?.id || null;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;

  const startCreate = () => {
    setDraft({
      name: '',
      description: '',
      systemPrompt: '',
      tools: allTools.map((t) => t.name),
      logoPreview: DEFAULT_LOGO,
      useDefaultLogo: true,
    });
    setToolFilter('');
    setErrorMessage('');
    setStatusMessage('');
  };

  const startEdit = (agent: CustomAgentItem) => {
    setDraft({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt,
      tools: agent.tools.length > 0 ? [...agent.tools] : allTools.map((t) => t.name),
      logoPreview: agent.logo || DEFAULT_LOGO,
      useDefaultLogo: !agent.logo || agent.logo === DEFAULT_LOGO,
    });
    setToolFilter('');
    setErrorMessage('');
    setStatusMessage('');
  };

  const closeEditor = () => {
    setDraft(null);
    setErrorMessage('');
  };

  const updateDraft = (patch: Partial<AgentDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please choose an image file (PNG, JPEG, WEBP, GIF, or SVG).');
      return;
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setErrorMessage('Logo file is too large. Maximum size is 2 MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateDraft({ logoDataUrl: dataUrl, logoPreview: dataUrl, useDefaultLogo: false });
      setErrorMessage('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not read the image.');
    }
  };

  const handlePromptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PROMPT_FILE_BYTES) {
      setErrorMessage('System prompt file is too large. Maximum size is 1 MB.');
      return;
    }
    try {
      const text = await readFileAsText(file);
      updateDraft({ systemPrompt: text });
      setErrorMessage('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not read the system prompt file.');
    }
  };

  const toggleTool = (toolName: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const exists = prev.tools.includes(toolName);
      return {
        ...prev,
        tools: exists ? prev.tools.filter((t) => t !== toolName) : [...prev.tools, toolName],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const res = await fetch('/api/custom-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          systemPrompt: draft.systemPrompt,
          tools: draft.tools,
          logoDataUrl: draft.logoDataUrl,
          useDefaultLogo: draft.useDefaultLogo && !draft.logoDataUrl,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || 'Failed to save custom agent.');
        return;
      }
      const createdId: string | undefined = data.agent?.id;
      const isNew = !draft.id;
      if (isNew && createdId) {
        await fetch(`/api/custom-agents/${encodeURIComponent(createdId)}/activate`, {
          method: 'POST',
        });
      }
      await loadAgents();
      if (createdId) setSelectedAgentId(createdId);
      setDraft(null);
      setStatusMessage(
        isNew ? 'Custom agent created and activated.' : 'Custom agent updated.'
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error saving custom agent.');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (id: string | null) => {
    setBusy(true);
    setErrorMessage('');
    try {
      const res = await fetch(
        id
          ? `/api/custom-agents/${encodeURIComponent(id)}/activate`
          : '/api/custom-agents/deactivate',
        { method: 'POST' }
      );
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || 'Failed to activate agent.');
        return;
      }
      setActiveAgentId(data.activeAgentId || null);
      setStatusMessage(
        id ? 'Custom agent activated for new runs.' : 'Default agent activated for new runs.'
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error activating agent.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (agent: CustomAgentItem) => {
    if (!window.confirm(`Delete custom agent "${agent.name}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/custom-agents/${encodeURIComponent(agent.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || 'Failed to delete custom agent.');
        return;
      }
      if (draft?.id === agent.id) setDraft(null);
      await loadAgents();
      setStatusMessage('Custom agent deleted.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error deleting custom agent.');
    } finally {
      setBusy(false);
    }
  };

  const filteredTools = allTools.filter(
    (t) =>
      !toolFilter.trim() ||
      t.name.toLowerCase().includes(toolFilter.trim().toLowerCase()) ||
      t.description.toLowerCase().includes(toolFilter.trim().toLowerCase())
  );

  const cardStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: '9px 11px',
    borderRadius: 8,
    cursor: 'pointer',
    backgroundColor: isSelected ? '#000000' : '#000000',
    border: isSelected ? '1px solid #303030' : '1px solid #1f1f1f',
  });

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
            <Bot size={15} />
            <span>Custom Agents</span>
            <span className="version-block">{agents.length} custom</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={startCreate}
          >
            <Plus size={13} />
            Create Agent
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Agent list */}
        <div
          style={{
            width: 'clamp(260px, 30%, 350px)',
            borderRight: '1px solid #1f1f1f',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#000000',
            overflowY: 'auto',
            padding: 8,
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7d7d7d', padding: '4px 6px' }}>
            DEFAULT AGENT
          </div>
          <div
            onClick={() => {
              setSelectedAgentId(null);
              setDraft(null);
            }}
            style={{
              ...cardStyle(!draft && !selectedAgent),
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <AgentLogo src={DEFAULT_LOGO} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 12.5, color: '#ededed' }}>
                  Default Mythgram Agent
                </span>
                {!activeAgentId && (
                  <span
                    style={{
                      fontSize: 9.5,
                      padding: '1px 5px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(34,197,94,0.16)',
                      color: '#4ade80',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#a1a1a1', marginTop: 2 }}>
                Full runtime, all tools, no modifications.
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#7d7d7d',
              padding: '10px 6px 4px 6px',
            }}
          >
            CUSTOM AGENTS (.mythgram/custom-agents)
          </div>

          {agents.length === 0 && (
            <div style={{ padding: '4px 8px', fontSize: 11.5, color: '#7d7d7d', lineHeight: 1.45 }}>
              No custom agents yet. Create one to give the same Mythgram runtime a custom
              name, logo, prompt, and toolset.
            </div>
          )}

          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => {
                setSelectedAgentId(agent.id);
                setDraft(null);
              }}
              style={{
                ...cardStyle(!draft && selectedAgentId === agent.id),
                display: 'flex',
                alignItems: 'center',
                gap: 9,
              }}
            >
              <AgentLogo src={agent.logo} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 12.5,
                      color: '#ededed',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {agent.name}
                  </span>
                  {activeAgentId === agent.id && (
                    <span
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 4,
                        backgroundColor: 'rgba(34,197,94,0.16)',
                        color: '#4ade80',
                      }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#a1a1a1',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {agent.description || 'No description'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail / editor */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, backgroundColor: '#000000' }}>
          {statusMessage && !draft && (
            <div
              style={{
                maxWidth: 820,
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 6,
                backgroundColor: 'rgba(34,197,94,0.12)',
                color: '#86efac',
                fontSize: 12,
              }}
            >
              {statusMessage}
            </div>
          )}
          {errorMessage && !draft && (
            <div
              style={{
                maxWidth: 820,
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 6,
                backgroundColor: 'rgba(239,68,68,0.15)',
                color: '#fca5a5',
                fontSize: 12,
              }}
            >
              {errorMessage}
            </div>
          )}

          {draft ? (
            <form
              onSubmit={handleSave}
              style={{
                maxWidth: 820,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#ededed' }}>
                    {draft.id ? 'Edit Custom Agent' : 'Create Custom Agent'}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#a1a1a1' }}>
                    Custom agents run on the exact same Mythgram runtime with the full tool
                    system. No sub-agent restrictions apply.
                  </p>
                </div>
                <button type="button" className="icon-btn" onClick={closeEditor} title="Close editor">
                  <X size={16} />
                </button>
              </div>

              {errorMessage && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(239,68,68,0.15)',
                    color: '#fca5a5',
                    fontSize: 12,
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="field-label">Agent Logo</div>
                  <AgentLogo src={draft.logoPreview} size={72} radius={14} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      style={{ padding: '4px 9px', fontSize: 11.5 }}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload size={12} />
                      Upload
                    </button>
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      style={{ padding: '4px 9px', fontSize: 11.5 }}
                      onClick={() =>
                        updateDraft({
                          logoDataUrl: undefined,
                          logoPreview: DEFAULT_LOGO,
                          useDefaultLogo: true,
                        })
                      }
                    >
                      <ImageIcon size={12} />
                      Default
                    </button>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={handleLogoUpload}
                  />
                  <div style={{ fontSize: 10.5, color: '#7d7d7d', maxWidth: 170, lineHeight: 1.4 }}>
                    PNG, JPEG, WEBP, GIF, or SVG up to 2 MB.
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label className="field-label">Agent Name</label>
                    <input
                      required
                      className="input-field"
                      placeholder="e.g. Research Copilot"
                      value={draft.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Description</label>
                    <textarea
                      rows={2}
                      className="input-field"
                      placeholder="What this custom agent is for and how it should behave..."
                      value={draft.description}
                      onChange={(e) => updateDraft({ description: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <label className="field-label" style={{ margin: 0 }}>
                    System Prompt
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10.5, color: '#7d7d7d' }}>
                      {draft.systemPrompt.length.toLocaleString()} chars
                    </span>
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      style={{ padding: '4px 9px', fontSize: 11.5 }}
                      onClick={() => promptInputRef.current?.click()}
                    >
                      <Upload size={12} />
                      Upload from computer
                    </button>
                    <input
                      ref={promptInputRef}
                      type="file"
                      accept=".md,.markdown,.txt,.text,.prompt,text/plain,text/markdown"
                      style={{ display: 'none' }}
                      onChange={handlePromptUpload}
                    />
                  </div>
                </div>
                <textarea
                  required
                  rows={10}
                  className="input-field"
                  style={{ marginTop: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                  placeholder="Write the custom agent instructions, or upload a .md / .txt file from your computer..."
                  value={draft.systemPrompt}
                  onChange={(e) => updateDraft({ systemPrompt: e.target.value })}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <label className="field-label" style={{ margin: 0 }}>
                    Tools ({draft.tools.length} of {allTools.length} selected)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      className="input-field"
                      style={{ width: 170, padding: '4px 8px', fontSize: 11.5 }}
                      placeholder="Filter tools..."
                      value={toolFilter}
                      onChange={(e) => setToolFilter(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      onClick={() => updateDraft({ tools: allTools.map((t) => t.name) })}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      onClick={() => updateDraft({ tools: [] })}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: '#7d7d7d', marginTop: 4 }}>
                  No tool restrictions: every native tool, MCP tool, and connector tool is
                  selectable. Selecting none enables all tools at runtime.
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 8,
                    maxHeight: 260,
                    overflowY: 'auto',
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: '#000000',
                    border: '1px solid #1f1f1f',
                  }}
                >
                  {filteredTools.map((tool) => {
                    const checked = draft.tools.includes(tool.name);
                    return (
                      <button
                        key={tool.name}
                        type="button"
                        title={tool.description}
                        onClick={() => toggleTool(tool.name)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontFamily: 'JetBrains Mono, monospace',
                          cursor: 'pointer',
                          backgroundColor: checked ? '#0a0a0a' : '#000000',
                          border: checked ? '1px solid #ededed' : '1px solid #262626',
                          color: checked ? '#ededed' : '#7d7d7d',
                        }}
                      >
                        {checked && <Check size={11} color="#ededed" />}
                        <span>{tool.name}</span>
                      </button>
                    );
                  })}
                  {filteredTools.length === 0 && (
                    <span style={{ fontSize: 11.5, color: '#7d7d7d' }}>No tools match.</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={closeEditor}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary inline-center"
                  disabled={busy}
                  style={{ opacity: busy ? 0.7 : 1 }}
                >
                  <Save size={13} />
                  {draft.id ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          ) : selectedAgent ? (
            <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <AgentLogo src={selectedAgent.logo} size={56} radius={12} />
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: '#ededed' }}>
                      {selectedAgent.name}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#a1a1a1' }}>
                      {selectedAgent.description || 'No description'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {activeAgentId === selectedAgent.id ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 10px',
                        borderRadius: 6,
                        backgroundColor: 'rgba(34,197,94,0.14)',
                        border: '1px solid rgba(34,197,94,0.35)',
                        fontSize: 11.5,
                        color: '#4ade80',
                      }}
                    >
                      <Check size={12} />
                      Active Agent
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary inline-center"
                      disabled={busy}
                      onClick={() => handleActivate(selectedAgent.id)}
                    >
                      <Power size={13} />
                      Activate
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={() => startEdit(selectedAgent)}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{ color: '#f87171' }}
                    onClick={() => handleDelete(selectedAgent)}
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>

              <div>
                <div className="field-label">System Prompt</div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: '#000000',
                    border: '1px solid #262626',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 12,
                    color: '#ededed',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  {selectedAgent.system_prompt}
                </pre>
              </div>

              <div>
                <div className="field-label">
                  Enabled Tools ({selectedAgent.tools.length > 0 ? selectedAgent.tools.length : allTools.length})
                  {selectedAgent.tools.length === 0 && ' — all tools'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(selectedAgent.tools.length > 0
                    ? selectedAgent.tools
                    : allTools.map((t) => t.name)
                  ).map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        backgroundColor: '#000000',
                        border: '1px solid #262626',
                        fontSize: 11.5,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#d4d4d4',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                maxWidth: 820,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <AgentLogo src={DEFAULT_LOGO} size={56} radius={12} />
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#ededed' }}>
                    Default Mythgram Agent
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#a1a1a1' }}>
                    The unmodified main runtime with its full system prompt and every tool.
                  </p>
                </div>
              </div>
              <div>
                {activeAgentId ? (
                  <button
                    type="button"
                    className="btn-primary inline-center"
                    disabled={busy}
                    onClick={() => handleActivate(null)}
                  >
                    <Power size={13} />
                    Activate Default Agent
                  </button>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 10px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(34,197,94,0.14)',
                      border: '1px solid rgba(34,197,94,0.35)',
                      fontSize: 11.5,
                      color: '#4ade80',
                    }}
                  >
                    <Check size={12} />
                    Active Agent
                  </span>
                )}
              </div>
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: '#000000',
                  border: '1px solid #1f1f1f',
                  fontSize: 12.5,
                  color: '#a1a1a1',
                  lineHeight: 1.55,
                }}
              >
                Create a custom agent to reuse this same runtime with a custom name, logo,
                description, system prompt, and selected tools. Activate any agent at any time;
                the change applies to the next agent run without restarting the server.
              </div>
              <div>
                <button
                  type="button"
                  className="btn-primary inline-center"
                  onClick={startCreate}
                >
                  <Plus size={13} />
                  Create Custom Agent
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
