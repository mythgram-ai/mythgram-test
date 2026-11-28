import React, { useState, useEffect, useCallback } from 'react';
import { Presentation, RefreshCw, Menu, Settings, Trash2 } from 'lucide-react';
import { SlideDeckViewer, SlideProjectData } from '../components/SlideDeckViewer';

interface SlidesPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

export const SlidesPage: React.FC<SlidesPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [projects, setProjects] = useState<SlideProjectData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slides');
      const data = await res.json();
      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
        if (!selectedId && data.projects.length > 0) {
          setSelectedId(data.projects[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDeleteProject = async (id: string) => {
    await fetch(`/api/slides/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    if (selectedId === id) {
      setSelectedId(next[0]?.id || null);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedId) || null;

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
            <Presentation size={15} />
            <span>Slides Decks</span>
            <span className="version-block">{projects.length} decks</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={loadProjects}
            title="Refresh slides"
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
        {/* Left List of Slide Decks */}
        <div
          style={{
            width: 'clamp(230px, 30%, 320px)',
            borderRight: '1px solid #1f1f1f',
            backgroundColor: '#000000',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: 8,
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7d7d7d', padding: '4px 6px' }}>
            CREATED SLIDE PROJECTS ({projects.length})
          </div>
          {!loading && projects.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: '#7d7d7d' }}>
              No slide decks created yet. Ask the agent to create slides and it will organize and present them here.
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                backgroundColor: selectedId === p.id ? '#0a0a0a' : '#000000',
                border:
                  selectedId === p.id
                    ? '1px solid #1f1f1f'
                    : '1px solid #1f1f1f',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 12.5, color: '#ededed' }}>
                  {p.name}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 24, height: 24 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(p.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#a1a1a1', marginTop: 4 }}>
                {p.slides_count} slide(s) • ID: {p.id}
              </div>
            </div>
          ))}
        </div>

        {/* Right Slide Viewer */}
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {selectedProject ? (
            <SlideDeckViewer
              project={selectedProject}
              onDeleteProject={handleDeleteProject}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7d7d7d',
                fontSize: 13,
              }}
            >
              Select a slide deck to preview, or download it as PNG, JPEG, SVG,
              PDF, PPTX, or HTML.
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
