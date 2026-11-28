import React, { useState, useEffect, useCallback } from 'react';
import { Presentation, RefreshCw } from 'lucide-react';
import { SlideDeckViewer, SlideProjectData } from './SlideDeckViewer';

interface SlidesTabProps {
  sessionId: string;
  selectedProjectId: string | null;
  onSelectProjectId: (id: string) => void;
}

export const SlidesTab: React.FC<SlidesTabProps> = ({
  selectedProjectId,
  onSelectProjectId,
}) => {
  const [projects, setProjects] = useState<SlideProjectData[]>([]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/slides');
      const data = await res.json();
      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
        if (!selectedProjectId && data.projects.length > 0) {
          onSelectProjectId(data.projects[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedProjectId, onSelectProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <Presentation size={13} color="#ededed" />
          <select
            className="input-field"
            style={{ padding: '4px 8px', fontSize: 12 }}
            value={activeProject?.id || ''}
            onChange={(e) => onSelectProjectId(e.target.value)}
          >
            {projects.length === 0 && (
              <option value="">No slide decks yet</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slides_count} slides)
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={loadProjects}
          title="Refresh slide projects"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {activeProject ? (
          <SlideDeckViewer project={activeProject} />
        ) : (
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
            No slide project presented yet. When the agent calls present_slides, the interactive deck will open here.
          </div>
        )}
      </div>
    </div>
  );
};
