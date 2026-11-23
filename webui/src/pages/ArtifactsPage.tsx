import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Trash2,
  Eye,
  Code,
  Edit3,
  Save,
  Download,
  RefreshCw,
  Menu,
  Settings,
  Layers,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

export interface ArtifactItem {
  id: string;
  name: string;
  title: string;
  description: string;
  type: string;
  file: string;
  file_path: string;
  created_at: number;
  updated_at: number;
}

interface ArtifactsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

export const ArtifactsPage: React.FC<ArtifactsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<'rendered' | 'raw' | 'edit'>('rendered');

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/artifacts');
      const data = await res.json();
      if (Array.isArray(data.artifacts)) {
        setArtifacts(data.artifacts);
        if (!selectedId && data.artifacts.length > 0) {
          setSelectedId(data.artifacts[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadArtifacts();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setContent('');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/artifacts/${encodeURIComponent(selectedId)}`);
        const data = await res.json();
        if (data.artifact) {
          setContent(data.content || '');
          setEditTitle(data.artifact.title || data.artifact.name || '');
          setEditDescription(data.artifact.description || '');
          setEditContent(data.content || '');
        }
      } catch {
        setContent('');
      }
    })();
  }, [selectedId]);

  const selectedArtifact = artifacts.find((a) => a.id === selectedId) || null;

  const handleSaveEdit = async () => {
    if (!selectedArtifact) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/artifacts/${encodeURIComponent(selectedArtifact.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle,
            description: editDescription,
            content: editContent,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setContent(editContent);
        setViewMode('rendered');
        await loadArtifacts();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/artifacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const next = artifacts.filter((a) => a.id !== id);
    setArtifacts(next);
    if (selectedId === id) {
      setSelectedId(next[0]?.id || null);
    }
  };

  const handleDownload = () => {
    if (!selectedArtifact) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedArtifact.file || `${selectedArtifact.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderArtifactContent = () => {
    if (!selectedArtifact) return null;
    if (viewMode === 'edit') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, height: '100%' }}>
          <div>
            <label className="field-label">Artifact Title</label>
            <input
              className="input-field"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <input
              className="input-field"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 220 }}>
            <label className="field-label">Artifact Content</label>
            <textarea
              className="input-field"
              style={{
                flex: 1,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                resize: 'none',
              }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setViewMode('rendered')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary inline-center"
              onClick={handleSaveEdit}
              disabled={saving}
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      );
    }

    if (viewMode === 'raw') {
      return (
        <pre
          style={{
            margin: 0,
            padding: 16,
            height: '100%',
            overflowY: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: '#e4e4e7',
            whiteSpace: 'pre-wrap',
          }}
        >
          {content}
        </pre>
      );
    }

    const t = selectedArtifact.type;
    if (t === 'html' || t === 'design' || t === 'slides') {
      return (
        <iframe
          title={selectedArtifact.title}
          srcDoc={content}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#ffffff',
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      );
    }

    if (t === 'markdown' || t === 'docs') {
      return (
        <div style={{ padding: 18, height: '100%', overflowY: 'auto' }}>
          <MarkdownRenderer content={content} />
        </div>
      );
    }

    return (
      <div style={{ padding: 18, height: '100%', overflowY: 'auto' }}>
        <MarkdownRenderer content={`\`\`\`${t === 'json' ? 'json' : ''}\n${content}\n\`\`\``} />
      </div>
    );
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
            <Layers size={15} />
            <span>Artifacts Manager</span>
            <span className="version-block">.mythgram/artifacts</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={loadArtifacts}
            title="Refresh artifacts"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
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
        {/* Left List of Artifacts */}
        <div
          style={{
            width: 'clamp(240px, 32%, 340px)',
            borderRight: '1px solid #1e1e22',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0c0c0f',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #1c1c20',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#9e9ea7',
            }}
          >
            SAVED ARTIFACTS ({artifacts.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading && artifacts.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: '#71717a' }}>
                Loading artifacts...
              </div>
            )}
            {!loading && artifacts.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: '#71717a' }}>
                No artifacts saved yet. The agent can save reusable files using{' '}
                <code>save_artifacts</code>.
              </div>
            )}
            {artifacts.map((art) => (
              <div
                key={art.id}
                onClick={() => {
                  setSelectedId(art.id);
                  setViewMode('rendered');
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: selectedId === art.id ? '#1c1c22' : '#131317',
                  border:
                    selectedId === art.id
                      ? '1px solid #383842'
                      : '1px solid #1f1f25',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <FileText size={13} color="#60a5fa" />
                    <span>{art.title || art.name}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    onClick={(e) => handleDelete(art.id, e)}
                    title="Delete artifact"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: '#9e9ea7', lineHeight: 1.4 }}>
                  {art.description}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, fontSize: 10.5, color: '#64646c', fontFamily: 'JetBrains Mono, monospace' }}>
                  <span>{art.type}</span>
                  <span>{art.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Artifact Preview / Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#09090b' }}>
          {selectedArtifact ? (
            <>
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #1e1e22',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  backgroundColor: '#121215',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f4f4f5' }}>
                    {selectedArtifact.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'JetBrains Mono, monospace' }}>
                    {selectedArtifact.file_path}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11.5,
                      backgroundColor: viewMode === 'rendered' ? '#27272f' : undefined,
                    }}
                    onClick={() => setViewMode('rendered')}
                  >
                    <Eye size={12} />
                    Rendered
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11.5,
                      backgroundColor: viewMode === 'raw' ? '#27272f' : undefined,
                    }}
                    onClick={() => setViewMode('raw')}
                  >
                    <Code size={12} />
                    Raw
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11.5,
                      backgroundColor: viewMode === 'edit' ? '#27272f' : undefined,
                    }}
                    onClick={() => setViewMode('edit')}
                  >
                    <Edit3 size={12} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{ padding: '4px 10px', fontSize: 11.5 }}
                    onClick={handleDownload}
                  >
                    <Download size={12} />
                    Download
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {renderArtifactContent()}
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64646c',
                fontSize: 13,
              }}
            >
              Select an artifact to preview or edit its content.
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
