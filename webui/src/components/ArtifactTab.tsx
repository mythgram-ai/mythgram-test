import React, { useState, useEffect, useCallback } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ArtifactItem } from '../pages/ArtifactsPage';

interface ArtifactTabProps {
  selectedArtifactId: string | null;
  onSelectArtifactId: (id: string) => void;
}

export const ArtifactTab: React.FC<ArtifactTabProps> = ({
  selectedArtifactId,
  onSelectArtifactId,
}) => {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [activeContent, setActiveContent] = useState<string>('');
  const [activeArtifact, setActiveArtifact] = useState<ArtifactItem | null>(null);

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch('/api/artifacts');
      const data = await res.json();
      if (Array.isArray(data.artifacts)) {
        setArtifacts(data.artifacts);
        if (!selectedArtifactId && data.artifacts.length > 0) {
          onSelectArtifactId(data.artifacts[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedArtifactId, onSelectArtifactId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    if (!selectedArtifactId) {
      setActiveArtifact(null);
      setActiveContent('');
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/artifacts/${encodeURIComponent(selectedArtifactId)}`
        );
        const data = await res.json();
        if (data.artifact) {
          setActiveArtifact(data.artifact);
          setActiveContent(data.content || '');
        }
      } catch {
        setActiveContent('');
      }
    })();
  }, [selectedArtifactId]);

  const renderRenderedContentOnly = () => {
    if (!activeArtifact) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7d7d7d',
            fontSize: 12.5,
            padding: 16,
            textAlign: 'center',
          }}
        >
          No artifact selected. Open an artifact manually from the selector above or wait for the agent to call show_artifact_to_user.
        </div>
      );
    }

    const t = activeArtifact.type;
    if (t === 'html' || t === 'design' || t === 'slides') {
      return (
        <iframe
          title={activeArtifact.title}
          srcDoc={activeContent}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#ededed',
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      );
    }

    if (t === 'markdown' || t === 'docs') {
      return (
        <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
          <MarkdownRenderer content={activeContent} />
        </div>
      );
    }

    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <MarkdownRenderer
          content={`\`\`\`${t === 'json' ? 'json' : ''}\n${activeContent}\n\`\`\``}
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Selector Bar to open any artifact manually */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #1f1f1f',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <Layers size={13} color="#ededed" />
          <select
            className="input-field"
            style={{ padding: '4px 8px', fontSize: 12 }}
            value={selectedArtifactId || ''}
            onChange={(e) => onSelectArtifactId(e.target.value)}
          >
            {artifacts.length === 0 && (
              <option value="">No artifacts available</option>
            )}
            {artifacts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title || a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={loadArtifacts}
          title="Refresh artifacts list"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Rendered Content Only */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#000000' }}>
        {renderRenderedContentOnly()}
      </div>
    </div>
  );
};
