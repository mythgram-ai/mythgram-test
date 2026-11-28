import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  HardDrive,
  History,
  Menu,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react';

interface CheckpointItem {
  id: string;
  name: string;
  description: string;
  file: string;
  file_path: string;
  workspace: string;
  files_count: number;
  size_bytes: number;
  created_at: number;
  updated_at: number;
}

interface BackupItem {
  file: string;
  file_path: string;
  size_bytes: number;
  created_at: number;
}

interface CheckpointsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const formatDate = (value: number) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
};

export const CheckpointsPage: React.FC<CheckpointsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [checkpointsDir, setCheckpointsDir] = useState('');
  const [backupsDir, setBackupsDir] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [view, setView] = useState<'checkpoints' | 'backups'>('checkpoints');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const selected = useMemo(
    () => checkpoints.find((item) => item.id === selectedId) || null,
    [checkpoints, selectedId]
  );
  const selectedBackupItem = useMemo(
    () => backups.find((item) => item.file === selectedBackup) || null,
    [backups, selectedBackup]
  );
  const dirty = Boolean(
    selected &&
      (nameDraft !== selected.name || descriptionDraft !== selected.description)
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/checkpoints');
      const data = await res.json();
      const list: CheckpointItem[] = Array.isArray(data.checkpoints) ? data.checkpoints : [];
      const backupList: BackupItem[] = Array.isArray(data.backups) ? data.backups : [];
      setCheckpoints(list);
      setBackups(backupList);
      setCheckpointsDir(data.checkpoints_dir || '');
      setBackupsDir(data.backups_dir || '');
      setWorkspace(data.workspace || '');
      setSelectedId((prev) => (prev && list.some((item) => item.id === prev) ? prev : list[0]?.id || null));
      setSelectedBackup((prev) =>
        prev && backupList.some((item) => item.file === prev) ? prev : backupList[0]?.file || null
      );
    } catch {
      setError('Could not load checkpoints.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setNameDraft(selected?.name || '');
    setDescriptionDraft(selected?.description || '');
  }, [selected?.id, selected?.name, selected?.description]);

  const flash = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(''), 8000);
  };

  const createCheckpoint = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/checkpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim() || undefined,
          description: newDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to create checkpoint');
        return;
      }
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      setView('checkpoints');
      await load();
      if (data.checkpoint?.id) setSelectedId(data.checkpoint.id);
      flash(`Checkpoint "${data.checkpoint?.name}" created.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const saveSelected = async () => {
    if (!selected) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/checkpoints/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft, description: descriptionDraft }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to update checkpoint');
        return;
      }
      setCheckpoints(data.checkpoints || checkpoints);
      flash('Checkpoint updated.');
    } catch (err: any) {
      setError(err?.message || 'Failed to update checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const restoreSelected = async (checkpoint: CheckpointItem) => {
    if (
      !window.confirm(
        `Restore checkpoint "${checkpoint.name}" into the current workspace?\n\nThe current workspace is zipped into .mythgram/checkpoints/backup first, so this can be undone.`
      )
    ) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/checkpoints/${encodeURIComponent(checkpoint.id)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to restore checkpoint');
        return;
      }
      setCheckpoints(data.checkpoints || checkpoints);
      setBackups(data.backups || backups);
      flash(data.result?.message || 'Checkpoint restored.');
    } catch (err: any) {
      setError(err?.message || 'Failed to restore checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async (checkpoint: CheckpointItem) => {
    if (!window.confirm(`Delete checkpoint "${checkpoint.name}"? This cannot be undone.`)) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/checkpoints/${encodeURIComponent(checkpoint.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
      flash('Checkpoint deleted.');
    } catch (err: any) {
      setError(err?.message || 'Failed to delete checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const restoreSelectedBackup = async (backup: BackupItem) => {
    if (
      !window.confirm(
        `Restore backup "${backup.file}" into the current workspace?\n\nThe current workspace is backed up again first, so this can be undone.`
      )
    ) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch(
        `/api/checkpoints/backups/${encodeURIComponent(backup.file)}/restore`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to restore backup');
        return;
      }
      await load();
      flash(data.result?.message || 'Backup restored.');
    } catch (err: any) {
      setError(err?.message || 'Failed to restore backup');
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedBackup = async (backup: BackupItem) => {
    if (!window.confirm(`Delete backup "${backup.file}"? This cannot be undone.`)) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/checkpoints/backups/${encodeURIComponent(backup.file)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to delete backup');
        return;
      }
      setBackups(data.backups || []);
      flash('Backup deleted.');
    } catch (err: any) {
      setError(err?.message || 'Failed to delete backup');
    } finally {
      setBusy(false);
    }
  };

  const download = (url: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <main className="main-canvas checkpoints-page">
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
            <History size={16} />
            <span>Checkpoints</span>
            <span className="version-block">.mythgram/checkpoints</span>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" onClick={() => void load()} title="Refresh">
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn-primary inline-center checkpoint-create-btn"
            onClick={() => setShowCreate(true)}
            title="New checkpoint"
            aria-label="New checkpoint"
          >
            <Plus size={13} />
            <span className="btn-label">New checkpoint</span>
          </button>
          <button
            type="button"
            className="topbar-btn"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '7px 14px',
          borderBottom: '1px solid #1f1f1f',
          fontSize: 11.5,
          color: '#a1a1a1',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Archive size={12} /> {checkpointsDir || '.mythgram/checkpoints'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <HardDrive size={12} /> Workspace: {workspace || '—'}
        </span>
      </div>

      <div className="resource-layout">
        <div className="resource-list">
          <div className="checkpoint-view-tabs">
            <button
              type="button"
              className={`topbar-btn checkpoint-view-tab ${
                view === 'checkpoints' ? 'is-active' : ''
              }`}
              onClick={() => setView('checkpoints')}
              aria-pressed={view === 'checkpoints'}
            >
              <span>Checkpoints ({checkpoints.length})</span>
            </button>
            <button
              type="button"
              className={`topbar-btn checkpoint-view-tab ${
                view === 'backups' ? 'is-active' : ''
              }`}
              onClick={() => setView('backups')}
              aria-pressed={view === 'backups'}
            >
              <span>Backups ({backups.length})</span>
            </button>
          </div>

          {view === 'checkpoints' ? (
            <>
              <div className="resource-list-heading">CHECKPOINTS</div>
              {checkpoints.length === 0 && (
                <div className="resource-list-empty">
                  No checkpoints yet. Create one to snapshot the current workspace.
                </div>
              )}
              {checkpoints.map((checkpoint) => (
                <button
                  type="button"
                  key={checkpoint.id}
                  className={`resource-card ${
                    selectedId === checkpoint.id ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelectedId(checkpoint.id)}
                >
                  <div className="resource-card-head">
                    <span className="resource-card-name">{checkpoint.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="resource-card-delete"
                      title="Delete checkpoint"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteSelected(checkpoint);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                          void deleteSelected(checkpoint);
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </span>
                  </div>
                  <div className="resource-card-desc">
                    {checkpoint.description || checkpoint.file}
                  </div>
                  <div className="resource-card-badges">
                    <span className="resource-badge">{formatBytes(checkpoint.size_bytes)}</span>
                    <span className="resource-badge">{checkpoint.files_count} files</span>
                    <span className="resource-badge">{formatDate(checkpoint.created_at)}</span>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="resource-list-heading">WORKSPACE BACKUPS</div>
              {backups.length === 0 && (
                <div className="resource-list-empty">
                  No backups yet. A backup is created automatically before every restore.
                </div>
              )}
              {backups.map((backup) => (
                <button
                  type="button"
                  key={backup.file}
                  className={`resource-card ${
                    selectedBackup === backup.file ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelectedBackup(backup.file)}
                >
                  <div className="resource-card-head">
                    <span className="resource-card-name">{backup.file}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="resource-card-delete"
                      title="Delete backup"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteSelectedBackup(backup);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                          void deleteSelectedBackup(backup);
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </span>
                  </div>
                  <div className="resource-card-badges">
                    <span className="resource-badge">{formatBytes(backup.size_bytes)}</span>
                    <span className="resource-badge">{formatDate(backup.created_at)}</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="resource-detail">
          {view === 'checkpoints' && selected && (
            <div className="resource-detail-inner">
              <div className="resource-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <div className="resource-path">
                    <Archive size={12} />
                    {selected.file_path}
                  </div>
                </div>
                <div className="resource-detail-actions">
                  <button
                    type="button"
                    className="btn-primary inline-center"
                    onClick={saveSelected}
                    disabled={busy || !dirty}
                  >
                    <Save size={13} />
                    Save
                  </button>
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => download(`/api/checkpoints/${encodeURIComponent(selected.id)}/download`)}
                    disabled={busy}
                    title="Download checkpoint"
                    aria-label="Download checkpoint"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => void restoreSelected(selected)}
                    disabled={busy}
                    title="Restore this checkpoint into the current workspace"
                    aria-label="Restore checkpoint"
                  >
                    <RotateCcw size={13} />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => void deleteSelected(selected)}
                    disabled={busy}
                    title="Delete checkpoint"
                    aria-label="Delete checkpoint"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="resource-meta-grid">
                <div>
                  <label className="field-label">Created</label>
                  <div className="resource-meta-value">{formatDate(selected.created_at)}</div>
                </div>
                <div>
                  <label className="field-label">Size</label>
                  <div className="resource-meta-value">{formatBytes(selected.size_bytes)}</div>
                </div>
                <div>
                  <label className="field-label">Files</label>
                  <div className="resource-meta-value">{selected.files_count}</div>
                </div>
                <div>
                  <label className="field-label">Checkpoint ID</label>
                  <div className="resource-meta-value">{selected.id}</div>
                </div>
                <div>
                  <label className="field-label">Source workspace</label>
                  <div className="resource-meta-value">{selected.workspace || '—'}</div>
                </div>
              </div>

              <div className="form-grid-2">
                <div>
                  <label className="field-label">Name</label>
                  <input
                    className="input-field"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Description</label>
                  <input
                    className="input-field"
                    value={descriptionDraft}
                    placeholder="What this checkpoint captures"
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                  />
                </div>
              </div>

              <div className="resource-toggle-card">
                <span>
                  <span className="resource-toggle-title">Restore behavior</span>
                  <span className="resource-toggle-hint">
                    Restoring zips the current workspace into {backupsDir || '.mythgram/checkpoints/backup'} first,
                    then extracts this checkpoint over the workspace. Files that are not in the checkpoint stay in place.
                  </span>
                </span>
              </div>
            </div>
          )}

          {view === 'checkpoints' && !selected && (
            <div className="resource-empty">
              <History size={32} />
              <p>Select a checkpoint to inspect, rename, restore, or delete it.</p>
            </div>
          )}

          {view === 'backups' && selectedBackupItem && (
            <div className="resource-detail-inner">
              <div className="resource-detail-head">
                <div>
                  <h2>{selectedBackupItem.file}</h2>
                  <div className="resource-path">
                    <HardDrive size={12} />
                    {selectedBackupItem.file_path}
                  </div>
                </div>
                <div className="resource-detail-actions">
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() =>
                      download(
                        `/api/checkpoints/backups/${encodeURIComponent(selectedBackupItem.file)}/download`
                      )
                    }
                    disabled={busy}
                    title="Download backup"
                    aria-label="Download backup"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => void restoreSelectedBackup(selectedBackupItem)}
                    disabled={busy}
                    title="Restore backup into the current workspace"
                    aria-label="Restore backup"
                  >
                    <RotateCcw size={13} />
                    <span>Restore backup</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => void deleteSelectedBackup(selectedBackupItem)}
                    disabled={busy}
                    title="Delete backup"
                    aria-label="Delete backup"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="resource-meta-grid">
                <div>
                  <label className="field-label">Created</label>
                  <div className="resource-meta-value">
                    {formatDate(selectedBackupItem.created_at)}
                  </div>
                </div>
                <div>
                  <label className="field-label">Size</label>
                  <div className="resource-meta-value">
                    {formatBytes(selectedBackupItem.size_bytes)}
                  </div>
                </div>
              </div>

              <div className="resource-toggle-card">
                <span>
                  <span className="resource-toggle-title">Safety backup</span>
                  <span className="resource-toggle-hint">
                    Backups are created automatically before a checkpoint or backup is restored. Restoring
                    a backup creates another backup of the current workspace first.
                  </span>
                </span>
              </div>
            </div>
          )}

          {view === 'backups' && !selectedBackupItem && (
            <div className="resource-empty">
              <Archive size={32} />
              <p>No workspace backup selected.</p>
            </div>
          )}
        </div>
      </div>

      {status && (
        <div className="mcp-alert resource-alert" style={{ color: '#86efac' }}>
          <CheckCircle2 size={14} />
          <span>{status}</span>
        </div>
      )}

      {error && (
        <div className="mcp-alert resource-alert">
          <X size={14} />
          <span>{error}</span>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <form className="workspace-modal" style={{ maxWidth: 560 }} onSubmit={createCheckpoint}>
            <div className="workspace-modal-title">
              <span>New checkpoint</span>
              <button type="button" className="icon-btn" onClick={() => setShowCreate(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="field-label">Name</label>
                <input
                  className="input-field"
                  value={newName}
                  placeholder="before-refactor (optional)"
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Description</label>
                <input
                  className="input-field"
                  value={newDescription}
                  placeholder="What this checkpoint captures (optional)"
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </div>
              <div className="resource-toggle-card">
                <span>
                  <span className="resource-toggle-title">What is saved</span>
                  <span className="resource-toggle-hint">
                    The current workspace is zipped into {checkpointsDir || '.mythgram/checkpoints'}.
                    The .mythgram data directory is excluded.
                  </span>
                </span>
              </div>
            </div>

            <div className="settings-actions-buttons" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreate(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                Create checkpoint
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
