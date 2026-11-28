import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Shield,
  Check,
  Menu,
  Settings,
  Save,
  X,
} from 'lucide-react';

interface SubAgentItem {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  is_default: boolean;
  file_path?: string;
}

interface AllowedToolOption {
  name: string;
  description: string;
}

interface SubAgentsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

interface DraftSubAgentForm {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

export const SubAgentsPage: React.FC<SubAgentsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [subAgents, setSubAgents] = useState<SubAgentItem[]>([]);
  const [allowedTools, setAllowedTools] = useState<AllowedToolOption[]>([]);
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Support creating 1 or multiple custom sub-agents at once
  const [draftForms, setDraftForms] = useState<DraftSubAgentForm[]>([
    {
      name: '',
      description: '',
      systemPrompt: '',
      tools: [],
    },
  ]);

  const loadSubAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/sub-agents');
      const data = await res.json();
      if (Array.isArray(data.subAgents)) {
        setSubAgents(data.subAgents);
        if (!selectedAgentName && data.subAgents.length > 0) {
          setSelectedAgentName(data.subAgents[0].name);
        }
      }
      if (Array.isArray(data.allowedTools)) {
        setAllowedTools(data.allowedTools);
        setDraftForms((prev) =>
          prev.map((d) =>
            d.tools.length === 0
              ? { ...d, tools: data.allowedTools.map((t: any) => t.name) }
              : d
          )
        );
      }
    } catch {
      // ignore
    }
  }, [selectedAgentName]);

  useEffect(() => {
    loadSubAgents();
  }, []);

  const selectedAgent =
    subAgents.find((a) => a.name === selectedAgentName) || null;

  const handleOpenCreateModal = () => {
    const allToolNames = allowedTools.map((t) => t.name);
    setDraftForms([
      {
        name: '',
        description: '',
        systemPrompt: '',
        tools: allToolNames,
      },
    ]);
    setStatusMessage('');
    setShowCreateModal(true);
  };

  const handleAddAnotherDraft = () => {
    setDraftForms((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        systemPrompt: '',
        tools: allowedTools.map((t) => t.name),
      },
    ]);
  };

  const handleRemoveDraft = (idx: number) => {
    if (draftForms.length <= 1) return;
    setDraftForms((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleToolInDraft = (draftIdx: number, toolName: string) => {
    setDraftForms((prev) =>
      prev.map((d, idx) => {
        if (idx !== draftIdx) return d;
        const exists = d.tools.includes(toolName);
        return {
          ...d,
          tools: exists
            ? d.tools.filter((t) => t !== toolName)
            : [...d.tools, toolName],
        };
      })
    );
  };

  const handleSaveDraftAgents = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    try {
      const res = await fetch('/api/sub-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agents: draftForms,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatusMessage(data.error || 'Failed to save sub-agent(s).');
        return;
      }
      setSubAgents(data.subAgents || []);
      if (data.created?.[0]?.name) {
        setSelectedAgentName(data.created[0].name);
      }
      setShowCreateModal(false);
    } catch (err: any) {
      setStatusMessage(err?.message || 'Error creating sub-agent.');
    }
  };

  const handleDeleteAgent = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/sub-agents/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.ok && Array.isArray(data.subAgents)) {
      setSubAgents(data.subAgents);
      if (selectedAgentName === name) {
        setSelectedAgentName(data.subAgents[0]?.name || null);
      }
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
            <Bot size={15} />
            <span>Sub-Agents</span>
            <span className="version-block">{subAgents.length} total</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={handleOpenCreateModal}
          >
            <Plus size={13} />
            Create Sub-Agent(s)
          </button>
          <button
            type="button"
            className="topbar-btn"
            onClick={onOpenSettings}
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left List of Default + Custom Sub-Agents */}
        <div
          style={{
            width: 'clamp(250px, 32%, 340px)',
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
            DEFAULT SUB-AGENTS (10 BUILT-IN)
          </div>
          {subAgents
            .filter((a) => a.is_default)
            .map((agent) => (
              <div
                key={agent.name}
                onClick={() => setSelectedAgentName(agent.name)}
                style={{
                  padding: '9px 11px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedAgentName === agent.name ? '#121212' : '#0a0a0a',
                  border:
                    selectedAgentName === agent.name
                      ? '1px solid #303030'
                      : '1px solid #1f1f1f',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5, color: '#ededed', fontFamily: 'JetBrains Mono, monospace' }}>
                    {agent.name}
                  </span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, backgroundColor: '#000000', color: '#a1a1a1' }}>
                    Default
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#a1a1a1', marginTop: 4, lineHeight: 1.35 }}>
                  {agent.description}
                </div>
              </div>
            ))}

          <div style={{ fontSize: 11, fontWeight: 600, color: '#7d7d7d', padding: '10px 6px 4px 6px' }}>
            CUSTOM SUB-AGENTS (.mythgram/sub-agents)
          </div>
          {subAgents.filter((a) => !a.is_default).length === 0 && (
            <div style={{ padding: '4px 8px', fontSize: 11.5, color: '#7d7d7d' }}>
              No custom sub-agents yet. Click "Create Sub-Agent(s)" to add one or more.
            </div>
          )}
          {subAgents
            .filter((a) => !a.is_default)
            .map((agent) => (
              <div
                key={agent.name}
                onClick={() => setSelectedAgentName(agent.name)}
                style={{
                  padding: '9px 11px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedAgentName === agent.name ? '#121212' : '#0a0a0a',
                  border:
                    selectedAgentName === agent.name
                      ? '1px solid #303030'
                      : '1px solid #1f1f1f',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5, color: '#ededed', fontFamily: 'JetBrains Mono, monospace' }}>
                    {agent.name}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    onClick={(e) => handleDeleteAgent(agent.name, e)}
                    title="Delete custom sub-agent"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: '#a1a1a1', marginTop: 4, lineHeight: 1.35 }}>
                  {agent.description}
                </div>
              </div>
            ))}
        </div>

        {/* Right Sub-Agent Detail View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, backgroundColor: '#000000' }}>
          {selectedAgent ? (
            <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#ededed' }}>
                    {selectedAgent.name}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#a1a1a1' }}>
                    {selectedAgent.description}
                  </p>
                </div>
                {selectedAgent.is_default ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: 6,
                      backgroundColor: '#000000',
                      border: '1px solid #262626',
                      fontSize: 11.5,
                      color: '#a1a1a1',
                    }}
                  >
                    <Shield size={12} />
                    Built-in Default (Protected)
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={(e) => handleDeleteAgent(selectedAgent.name, e)}
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={13} />
                    Delete Custom Sub-Agent
                  </button>
                )}
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
                  }}
                >
                  {selectedAgent.system_prompt}
                </pre>
              </div>

              <div>
                <div className="field-label">
                  Enabled Native Tools ({selectedAgent.tools?.length || 0})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(selectedAgent.tools || []).map((t) => (
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
          ) : null}
        </div>
      </div>

      {/* Modal to Create 1 or Multiple Custom Sub-Agents */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <form
            onSubmit={handleSaveDraftAgents}
            className="workspace-modal"
            style={{ maxWidth: 760 }}
          >
            <div className="workspace-modal-title">
              <span>Create Custom Sub-Agent(s)</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {statusMessage && (
              <div style={{ padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 12 }}>
                {statusMessage}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
              {draftForms.map((draft, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: '#000000',
                    border: '1px solid #262626',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ededed' }}>
                      Sub-Agent #{idx + 1}
                    </span>
                    {draftForms.length > 1 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => handleRemoveDraft(idx)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">
                        Sub-Agent Name (lowercase, hyphens/underscores)
                      </label>
                      <input
                        required
                        className="input-field"
                        placeholder="e.g. api-tester"
                        value={draft.name}
                        onChange={(e) =>
                          setDraftForms((prev) =>
                            prev.map((d, i) =>
                              i === idx ? { ...d, name: e.target.value } : d
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">Description</label>
                      <input
                        required
                        className="input-field"
                        placeholder="What this sub-agent specializes in..."
                        value={draft.description}
                        onChange={(e) =>
                          setDraftForms((prev) =>
                            prev.map((d, i) =>
                              i === idx ? { ...d, description: e.target.value } : d
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label">System Prompt</label>
                    <textarea
                      required
                      rows={4}
                      className="input-field"
                      placeholder="System instructions defining role, workflow, and output format..."
                      value={draft.systemPrompt}
                      onChange={(e) =>
                        setDraftForms((prev) =>
                          prev.map((d, i) =>
                            i === idx
                              ? { ...d, systemPrompt: e.target.value }
                              : d
                          )
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Select Allowed Tools for Sub-Agent ({draft.tools.length} selected)
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {allowedTools.map((tool) => {
                        const checked = draft.tools.includes(tool.name);
                        return (
                          <button
                            key={tool.name}
                            type="button"
                            onClick={() => handleToggleToolInDraft(idx, tool.name)}
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
                              border: checked
                                ? '1px solid #ededed'
                                : '1px solid #121212',
                              color: checked ? '#ededed' : '#7d7d7d',
                            }}
                          >
                            {checked && <Check size={11} color="#ededed" />}
                            <span>{tool.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="workspace-footer">
              <button
                type="button"
                className="btn-secondary inline-center"
                onClick={handleAddAnotherDraft}
              >
                <Plus size={13} />
                Add Another Sub-Agent in Batch
              </button>
              <div className="workspace-footer-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary inline-center">
                  <Save size={13} />
                  Save {draftForms.length} Sub-Agent(s)
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
