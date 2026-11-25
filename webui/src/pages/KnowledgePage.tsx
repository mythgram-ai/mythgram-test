import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Menu,
  Settings,
  Plus,
  Trash2,
  X,
  Upload,
  Globe,
  Terminal,
  FileText,
  Search,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

type KnowledgeSource = 'text' | 'upload' | 'folder' | 'docs' | 'curl';

interface KnowledgeEntry {
  id: string;
  name: string;
  description: string;
  source_type: KnowledgeSource;
  file: string;
  file_path: string;
  original_path?: string;
  source_url?: string;
  size: number;
  created_at: number;
  updated_at: number;
}

interface KnowledgePageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

type CreateMode = 'upload' | 'docs' | 'curl' | 'text';

const SOURCE_LABEL: Record<KnowledgeSource, string> = {
  text: 'Text',
  upload: 'File upload',
  folder: 'Folder import',
  docs: 'Website docs',
  curl: 'Curl capture',
};

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const KnowledgePage: React.FC<KnowledgePageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [knowledgeDir, setKnowledgeDir] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<CreateMode>('upload');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [curlCommand, setCurlCommand] = useState('');
  const [textContent, setTextContent] = useState('');
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId]
  );

  const visibleEntries = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle) ||
        entry.source_type.toLowerCase().includes(needle)
    );
  }, [entries, filter]);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 4000);
  };

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge');
      const data = await res.json();
      const list: KnowledgeEntry[] = Array.isArray(data.entries) ? data.entries : [];
      setEntries(list);
      setKnowledgeDir(data.knowledge_dir || '');
      setSelectedId((prev) => {
        if (prev && list.some((entry) => entry.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch {
      setError('Could not load knowledge files.');
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!selectedId) {
      setContent('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/knowledge/${encodeURIComponent(selectedId)}`);
        const data = await res.json();
        if (cancelled || !data.ok) return;
        setContent(data.content || '');
      } catch {
        if (!cancelled) setError('Could not load this knowledge file.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setSourcePath('');
    setDocsUrl('');
    setCurlCommand('');
    setTextContent('');
    setPickedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const createKnowledge = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      let body: Record<string, unknown> = { type: mode, description };

      if (mode === 'upload') {
        const paths: string[] = [];
        if (pickedFiles.length > 0) {
          const form = new FormData();
          pickedFiles.forEach((file) => {
            form.append('files', file);
            form.append(
              'relativePaths',
              (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
            );
          });
          const uploadRes = await fetch('/api/uploads', { method: 'POST', body: form });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok || !uploadData.ok) {
            setError(uploadData.error || 'Upload failed.');
            return;
          }
          paths.push(...(uploadData.files || []).map((file: any) => file.path));
        }
        if (sourcePath.trim()) paths.push(sourcePath.trim());
        if (paths.length === 0) {
          setError('Choose a file or folder, or enter an absolute path on this machine.');
          return;
        }
        body = { type: 'upload', description, paths };
      } else if (mode === 'docs') {
        body = { type: 'docs', description, url: docsUrl.trim(), name: name.trim() || undefined };
      } else if (mode === 'curl') {
        body = { type: 'curl', description, curlCommand, name: name.trim() || undefined };
      } else {
        body = { type: 'text', description, name: name.trim(), content: textContent };
      }

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to create the knowledge file.');
        return;
      }
      setEntries(data.entries || entries);
      if (data.created?.[0]?.id) setSelectedId(data.created[0].id);
      flash(`Created ${data.created?.length || 0} knowledge file(s).`);
      setShowCreate(false);
      resetCreateForm();
    } catch (err: any) {
      setError(err?.message || 'Failed to create the knowledge file.');
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (entry: KnowledgeEntry, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`Delete knowledge file "${entry.name}"?`)) return;
    const res = await fetch(`/api/knowledge/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setEntries(data.entries || []);
      if (selectedId === entry.id) setSelectedId(data.entries?.[0]?.id || null);
      flash('Knowledge file deleted.');
    } else {
      setError('Failed to delete the knowledge file.');
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
            <Database size={16} />
            <span>Knowledge</span>
            <span className="version-block">.mythgram/knowledge</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={13} />
            New knowledge file
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div className="resource-layout">
        <div className="resource-list">
          <div className="resource-search">
            <Search size={13} />
            <input
              value={filter}
              placeholder="Filter knowledge files…"
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="resource-list-heading">KNOWLEDGE FILES ({visibleEntries.length})</div>
          {visibleEntries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`resource-card ${selectedId === entry.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(entry.id)}
            >
              <div className="resource-card-head">
                <span className="resource-card-name">{entry.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="resource-card-delete"
                  title="Delete knowledge file"
                  onClick={(event) => deleteEntry(entry, event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') deleteEntry(entry, event as any);
                  }}
                >
                  <Trash2 size={12} />
                </span>
              </div>
              <div className="resource-card-desc">{entry.description || 'No description'}</div>
              <div className="resource-card-badges">
                <span className="resource-badge">{SOURCE_LABEL[entry.source_type]}</span>
                <span className="resource-badge">{formatSize(entry.size)}</span>
              </div>
            </button>
          ))}
          {visibleEntries.length === 0 && (
            <div className="resource-list-empty">
              No knowledge files yet. Add docs, uploads, or a curl capture.
            </div>
          )}
        </div>

        <div className="resource-detail">
          {selected ? (
            <div className="resource-detail-inner">
              <div className="resource-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <div className="resource-path">
                    <FileText size={12} />
                    {selected.file_path || `${knowledgeDir}/${selected.file}`}
                  </div>
                </div>
                <div className="resource-detail-actions">
                  {selected.source_url && (
                    <a
                      className="btn-secondary inline-center"
                      href={selected.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={13} />
                      Source
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={(event) => deleteEntry(selected, event as any)}
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>

              <div className="resource-meta-grid">
                <div>
                  <span className="field-label">Source</span>
                  <div className="resource-meta-value">{SOURCE_LABEL[selected.source_type]}</div>
                </div>
                <div>
                  <span className="field-label">Size</span>
                  <div className="resource-meta-value">{formatSize(selected.size)}</div>
                </div>
                <div>
                  <span className="field-label">Imported from</span>
                  <div className="resource-meta-value">
                    {selected.source_url || selected.original_path || 'Created in the app'}
                  </div>
                </div>
              </div>

              {selected.description && (
                <p className="resource-description">{selected.description}</p>
              )}

              <div className="resource-document">
                <MarkdownRenderer content={content} />
              </div>
            </div>
          ) : (
            <div className="resource-empty">
              <Database size={32} />
              <p>Select a knowledge file to read it.</p>
            </div>
          )}
        </div>
      </div>

      {(error || status) && (
        <div className={`resource-toast ${error ? 'is-error' : ''}`}>
          <span>{error || status}</span>
          <button type="button" className="icon-btn" onClick={() => setError('')}>
            <X size={13} />
          </button>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <form className="workspace-modal" style={{ maxWidth: 700 }} onSubmit={createKnowledge}>
            <div className="workspace-modal-title">
              <span>New knowledge file (.mythgram/knowledge)</span>
              <button type="button" className="icon-btn" onClick={() => setShowCreate(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="knowledge-mode-tabs">
              <button
                type="button"
                className={`knowledge-mode-tab ${mode === 'upload' ? 'is-active' : ''}`}
                onClick={() => setMode('upload')}
              >
                <Upload size={13} /> Upload file / folder
              </button>
              <button
                type="button"
                className={`knowledge-mode-tab ${mode === 'docs' ? 'is-active' : ''}`}
                onClick={() => setMode('docs')}
              >
                <Globe size={13} /> Docs from URL
              </button>
              <button
                type="button"
                className={`knowledge-mode-tab ${mode === 'curl' ? 'is-active' : ''}`}
                onClick={() => setMode('curl')}
              >
                <Terminal size={13} /> Curl capture
              </button>
              <button
                type="button"
                className={`knowledge-mode-tab ${mode === 'text' ? 'is-active' : ''}`}
                onClick={() => setMode('text')}
              >
                <FileText size={13} /> Plain text
              </button>
            </div>

            {mode !== 'upload' && (
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Name {mode === 'text' ? '*' : '(optional)'}</label>
                <input
                  className="input-field"
                  value={name}
                  placeholder="Reference name"
                  onChange={(event) => setName(event.target.value)}
                  required={mode === 'text'}
                />
              </div>
            )}

            {mode === 'upload' && (
              <>
                <div className="knowledge-upload-row">
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    Choose files
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    Choose folder
                  </button>
                  <span className="knowledge-upload-count">
                    {pickedFiles.length > 0
                      ? `${pickedFiles.length} file(s) selected`
                      : 'No files selected'}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) =>
                    setPickedFiles(Array.from(event.target.files || []))
                  }
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  hidden
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  onChange={(event) =>
                    setPickedFiles(Array.from(event.target.files || []))
                  }
                />
                <div style={{ marginBottom: 10 }}>
                  <label className="field-label">Or import an absolute path on this machine</label>
                  <input
                    className="input-field"
                    value={sourcePath}
                    placeholder="/Users/me/docs/api-reference"
                    onChange={(event) => setSourcePath(event.target.value)}
                  />
                </div>
              </>
            )}

            {mode === 'docs' && (
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Website URL *</label>
                <input
                  className="input-field"
                  value={docsUrl}
                  placeholder="https://docs.example.com/api"
                  onChange={(event) => setDocsUrl(event.target.value)}
                  required
                />
                <div className="resource-toggle-hint" style={{ marginTop: 6 }}>
                  The page is fetched with the configured scraper (built-in by default) and stored as a
                  Markdown knowledge file.
                </div>
              </div>
            )}

            {mode === 'curl' && (
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Curl command *</label>
                <textarea
                  className="resource-textarea"
                  style={{ minHeight: 130 }}
                  value={curlCommand}
                  placeholder={"curl -X GET 'https://api.example.com/v1/items' \\\n  -H 'Authorization: Bearer $TOKEN'"}
                  onChange={(event) => setCurlCommand(event.target.value)}
                  required
                />
                <div className="resource-toggle-hint" style={{ marginTop: 6 }}>
                  The command runs through fetch (no shell), and the response body is stored as a
                  knowledge file.
                </div>
              </div>
            )}

            {mode === 'text' && (
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">Content *</label>
                <textarea
                  className="resource-textarea"
                  style={{ minHeight: 170 }}
                  value={textContent}
                  placeholder="# Notes&#10;&#10;Paste reference material here."
                  onChange={(event) => setTextContent(event.target.value)}
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Description (optional)</label>
              <input
                className="input-field"
                value={description}
                placeholder="What this knowledge is for"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="settings-actions-buttons" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Loader2 size={13} className="spin" />}
                Create knowledge file
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
