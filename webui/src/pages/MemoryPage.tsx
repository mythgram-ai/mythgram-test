import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Menu,
  Settings,
  Plus,
  Trash2,
  Save,
  X,
  RotateCcw,
  Send,
  EyeOff,
  FileText,
} from 'lucide-react';

interface MemoryEntry {
  id: string;
  name: string;
  file: string;
  file_path: string;
  description: string;
  is_default: boolean;
  send_on_request: boolean;
  created_at: number;
  updated_at: number;
}

interface MemoryPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const formatDate = (value: number) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const MemoryPage: React.FC<MemoryPageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [memoryDir, setMemoryDir] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [sendOnRequest, setSendOnRequest] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSendOnRequest, setNewSendOnRequest] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId]
  );

  const loadEntries = useCallback(async (keepSelection = true) => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      const list: MemoryEntry[] = Array.isArray(data.entries) ? data.entries : [];
      setEntries(list);
      setMemoryDir(data.memory_dir || '');
      setSelectedId((prev) => {
        if (keepSelection && prev && list.some((entry) => entry.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch {
      setError('Could not load memory files.');
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!selectedId) {
      setContent('');
      setDescription('');
      setDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/memory/${encodeURIComponent(selectedId)}`);
        const data = await res.json();
        if (cancelled || !data.ok) return;
        setContent(data.content || '');
        setDescription(data.entry?.description || '');
        setSendOnRequest(data.entry?.send_on_request !== false);
        setDirty(false);
      } catch {
        if (!cancelled) setError('Could not load this memory file.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 3500);
  };

  const saveEntry = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(selected.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, description, send_on_request: sendOnRequest }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to save memory file.');
        return;
      }
      setEntries(data.entries || entries);
      setDirty(false);
      flash('Memory saved.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save memory file.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSendOnRequest = async () => {
    if (!selected) return;
    const next = !sendOnRequest;
    setSendOnRequest(next);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(selected.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_on_request: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries || entries);
        flash(next ? 'Sent on the first request.' : 'Not sent on the first request.');
      }
    } catch {
      setError('Failed to update the send-on-request setting.');
    }
  };

  const createEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          content: newContent,
          send_on_request: newSendOnRequest,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to create memory file.');
        return;
      }
      setEntries(data.entries || entries);
      setSelectedId(data.entry?.id || null);
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      setNewContent('');
      setNewSendOnRequest(true);
      flash('Memory file created.');
    } catch (err: any) {
      setError(err?.message || 'Failed to create memory file.');
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (entry: MemoryEntry, event: React.MouseEvent) => {
    event.stopPropagation();
    if (entry.is_default) return;
    if (!window.confirm(`Delete memory file "${entry.file}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/memory/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setEntries(data.entries || []);
      if (selectedId === entry.id) setSelectedId(data.entries?.[0]?.id || null);
      flash('Memory file deleted.');
    } else {
      setError(data.error || 'Failed to delete memory file.');
    }
  };

  const restoreDefaults = async () => {
    const res = await fetch('/api/memory/restore', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      setEntries(data.entries || []);
      flash('Default memory files restored.');
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
            <Brain size={16} />
            <span>Memory</span>
            <span className="version-block">.mythgram/memory</span>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" onClick={restoreDefaults} title="Restore deleted default memory files">
            <RotateCcw size={13} />
            <span>Restore defaults</span>
          </button>
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={13} />
            New memory file
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div className="resource-layout">
        <div className="resource-list">
          <div className="resource-list-heading">MEMORY FILES ({entries.length})</div>
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`resource-card ${selectedId === entry.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(entry.id)}
            >
              <div className="resource-card-head">
                <span className="resource-card-name">{entry.file}</span>
                {!entry.is_default && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="resource-card-delete"
                    title="Delete memory file"
                    onClick={(event) => deleteEntry(entry, event)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') deleteEntry(entry, event as any);
                    }}
                  >
                    <Trash2 size={12} />
                  </span>
                )}
              </div>
              <div className="resource-card-desc">{entry.description || entry.name}</div>
              <div className="resource-card-badges">
                {entry.is_default && <span className="resource-badge">built-in</span>}
                <span className={`resource-badge ${entry.send_on_request ? 'is-on' : ''}`}>
                  {entry.send_on_request ? (
                    <>
                      <Send size={10} /> first request
                    </>
                  ) : (
                    <>
                      <EyeOff size={10} /> on demand
                    </>
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="resource-detail">
          {selected ? (
            <div className="resource-detail-inner">
              <div className="resource-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <div className="resource-path">
                    <FileText size={12} />
                    {selected.file_path || `${memoryDir}/${selected.file}`}
                  </div>
                </div>
                <div className="resource-detail-actions">
                  <button
                    type="button"
                    className="btn-primary inline-center"
                    onClick={saveEntry}
                    disabled={busy || !dirty}
                  >
                    <Save size={13} />
                    Save
                  </button>
                </div>
              </div>

              <div className="resource-meta-grid">
                <div>
                  <label className="field-label">Description</label>
                  <input
                    className="input-field"
                    value={description}
                    placeholder="What this memory file holds"
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="resource-toggle-card">
                  <span>
                    <span className="resource-toggle-title">Send on first request</span>
                    <span className="resource-toggle-hint">
                      {sendOnRequest
                        ? 'This file is inlined into the system prompt on the first message of every session.'
                        : 'Only a short notice is sent; the agent uses memory_search to read it.'}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sendOnRequest}
                    className={`mcp-switch ${sendOnRequest ? 'is-on' : ''}`}
                    onClick={toggleSendOnRequest}
                  >
                    <span className="mcp-switch-knob" />
                  </button>
                </div>
              </div>

              <div className="resource-editor">
                <label className="field-label">Markdown content</label>
                <textarea
                  className="resource-textarea"
                  value={content}
                  spellCheck={false}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>

              <div className="resource-footer">
                <span className="resource-footer-meta">
                  Updated {formatDate(selected.updated_at)}
                  {dirty ? ' • unsaved changes' : ''}
                </span>
                <span className="resource-footer-status">{status}</span>
              </div>
            </div>
          ) : (
            <div className="resource-empty">
              <Brain size={32} />
              <p>Select a memory file to edit it.</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mcp-alert resource-alert">
          <X size={14} />
          <span>{error}</span>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <form className="workspace-modal" style={{ maxWidth: 620 }} onSubmit={createEntry}>
            <div className="workspace-modal-title">
              <span>New memory file (.mythgram/memory)</span>
              <button type="button" className="icon-btn" onClick={() => setShowCreate(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-grid-2" style={{ marginBottom: 10 }}>
              <div>
                <label className="field-label">Name *</label>
                <input
                  className="input-field"
                  value={newName}
                  placeholder="Project Alpha Notes"
                  onChange={(event) => setNewName(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="field-label">Description</label>
                <input
                  className="input-field"
                  value={newDescription}
                  placeholder="What the agent should remember here"
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </div>
            </div>

            <label className="resource-toggle-card" style={{ marginBottom: 10 }}>
              <span>
                <span className="resource-toggle-title">Send on request</span>
                <span className="resource-toggle-hint">
                  On: the file content is attached to the first request of each session. Off: only a
                  short notice is sent and the agent searches it on demand.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={newSendOnRequest}
                className={`mcp-switch ${newSendOnRequest ? 'is-on' : ''}`}
                onClick={() => setNewSendOnRequest(!newSendOnRequest)}
              >
                <span className="mcp-switch-knob" />
              </button>
            </label>

            <label className="field-label">Initial content (Markdown)</label>
            <textarea
              className="resource-textarea"
              style={{ minHeight: 160 }}
              value={newContent}
              placeholder={'# Project Alpha\n\n- Stack: TypeScript + Hono\n- Convention: absolute paths only'}
              onChange={(event) => setNewContent(event.target.value)}
            />

            <div className="settings-actions-buttons" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
                Create memory file
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
