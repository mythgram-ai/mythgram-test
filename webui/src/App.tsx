import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from 'react';
import {
  Trash2,
  X,
  Layers,
  Bot,
  BookOpen,
  Presentation,
} from 'lucide-react';
import { HomePage } from './pages/HomePage';
import type { ProviderState } from './components/SettingsModal';
import type { UploadedAttachment } from './components/PromptBox';
import { McpIcon } from './components/McpIcon';

const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((m) => ({ default: m.ChatPage }))
);
const ArtifactsPage = lazy(() =>
  import('./pages/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage }))
);
const SubAgentsPage = lazy(() =>
  import('./pages/SubAgentsPage').then((m) => ({ default: m.SubAgentsPage }))
);
const SkillsPage = lazy(() =>
  import('./pages/SkillsPage').then((m) => ({ default: m.SkillsPage }))
);
const SlidesPage = lazy(() =>
  import('./pages/SlidesPage').then((m) => ({ default: m.SlidesPage }))
);
const McpPage = lazy(() =>
  import('./pages/McpPage').then((m) => ({ default: m.McpPage }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const WorkspaceModal = lazy(() =>
  import('./components/WorkspaceModal').then((m) => ({ default: m.WorkspaceModal }))
);

const preloadChatPage = () => {
  void import('./pages/ChatPage');
};
const preloadArtifactsPage = () => {
  void import('./pages/ArtifactsPage');
};
const preloadSubAgentsPage = () => {
  void import('./pages/SubAgentsPage');
};
const preloadSkillsPage = () => {
  void import('./pages/SkillsPage');
};
const preloadSlidesPage = () => {
  void import('./pages/SlidesPage');
};
const preloadMcpPage = () => {
  void import('./pages/McpPage');
};

type ActivePageType =
  | 'home'
  | 'chat'
  | 'artifacts'
  | 'subagents'
  | 'skills'
  | 'slides'
  | 'mcp';

interface SessionSummary {
  id: string;
  title: string;
  workspace: string;
  provider_id: string;
  model_id: string;
  status: string;
  isRunning?: boolean;
  created_at: number;
  updated_at: number;
}

function parseSessionIdFromLocation(loc: Location): string | null {
  const pathMatch = loc.pathname.match(/^\/chat\/session=([a-zA-Z0-9]{1,64})/);
  if (pathMatch) return pathMatch[1];
  const params = new URLSearchParams(loc.search);
  if (loc.pathname.startsWith('/chat') && params.get('session')) {
    return params.get('session');
  }
  return null;
}

function parsePageFromLocation(loc: Location): ActivePageType {
  if (parseSessionIdFromLocation(loc)) return 'chat';
  if (loc.pathname.startsWith('/artifacts')) return 'artifacts';
  if (loc.pathname.startsWith('/sub-agents')) return 'subagents';
  if (loc.pathname.startsWith('/skills')) return 'skills';
  if (loc.pathname.startsWith('/slides')) return 'slides';
  if (loc.pathname.startsWith('/mcp')) return 'mcp';
  return 'home';
}

const PageSkeleton: React.FC = () => (
  <main className="main-canvas" aria-busy="true">
    <header className="main-topbar">
      <div className="topbar-left">
        <div className="app-topbar-brand">
          <span>Mythgram</span>
          <span className="version-block">v1</span>
        </div>
      </div>
      <div className="topbar-right">
        <span className="skeleton skeleton-btn" />
        <span className="skeleton skeleton-btn" />
      </div>
    </header>
    <div className="chat-split-layout">
      <div className="chat-conversation-column">
        <div className="chat-messages-scroll">
          <div className="chat-messages-inner">
            <span className="skeleton skeleton-msg skeleton-msg-user" />
            <span className="skeleton skeleton-msg skeleton-msg-line" />
            <span className="skeleton skeleton-msg skeleton-msg-line" />
            <span className="skeleton skeleton-msg skeleton-msg-line" />
          </div>
        </div>
      </div>
    </div>
  </main>
);

const ModalFallback: React.FC = () => (
  <div className="modal-backdrop">
    <div className="modal-loading">
      <div className="spinner" />
    </div>
  </div>
);

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showSidebarSearch, setShowSidebarSearch] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    parseSessionIdFromLocation(window.location)
  );
  const [activePage, setActivePage] = useState<ActivePageType>(() =>
    parsePageFromLocation(window.location)
  );

  // Settings & Workspace state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [activeProvider, setActiveProvider] = useState('pollinations');
  const [activeModel, setActiveModel] = useState('openai');
  const [reasoningEffort, setReasoningEffort] = useState('default');
  const [defaultWorkspace, setDefaultWorkspace] = useState('');

  const settingsRequestRef = useRef<Promise<void> | null>(null);
  const sessionsRequestRef = useRef<Promise<void> | null>(null);

  const loadSettings = useCallback(async () => {
    if (settingsRequestRef.current) return settingsRequestRef.current;
    const request = (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.providers) setProviders(data.providers);
        if (data.activeProvider) setActiveProvider(data.activeProvider);
        if (data.activeModel) setActiveModel(data.activeModel);
        if (data.reasoningEffort) setReasoningEffort(data.reasoningEffort);
        if (data.defaultWorkspace) setDefaultWorkspace(data.defaultWorkspace);
      } catch {
        // ignore
      }
    })();
    settingsRequestRef.current = request;
    try {
      await request;
    } finally {
      if (settingsRequestRef.current === request) settingsRequestRef.current = null;
    }
  }, []);

  const loadSessions = useCallback(async (force = false) => {
    if (!force && sessionsRequestRef.current) return sessionsRequestRef.current;
    const request = (async () => {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      } catch {
        // ignore
      }
    })();
    sessionsRequestRef.current = request;
    try {
      await request;
    } finally {
      if (sessionsRequestRef.current === request) sessionsRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSessions();

    let interval: number | undefined;
    const startPolling = () => {
      if (interval === undefined) {
        interval = window.setInterval(loadSessions, 4000);
      }
    };
    const stopPolling = () => {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        loadSessions();
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadSettings, loadSessions]);

  useEffect(() => {
    const onPopState = () => {
      setActiveSessionId(parseSessionIdFromLocation(window.location));
      setActivePage(parsePageFromLocation(window.location));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (desktop.matches) setMobileSidebarOpen(false);
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setActiveSessionId(null);
    setActivePage('home');
    setMobileSidebarOpen(false);
  };

  const navigateToPage = (page: ActivePageType, pathUrl: string) => {
    window.history.pushState({}, '', pathUrl);
    setActiveSessionId(null);
    setActivePage(page);
    setMobileSidebarOpen(false);
  };

  const navigateToSession = (sessionId: string) => {
    const targetUrl = `/chat/session=${sessionId}`;
    window.history.pushState({}, '', targetUrl);
    setActiveSessionId(sessionId);
    setActivePage('chat');
    setMobileSidebarOpen(false);
  };

  const handleStartNewSessionWithPrompt = async (
    prompt: string,
    attachments: UploadedAttachment[]
  ) => {
    preloadChatPage();

    const idRes = await fetch('/api/sessions/new-id', { method: 'POST' });
    const { sessionId } = await idRes.json();

    await fetch(`/api/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        workspace: defaultWorkspace,
        providerId: activeProvider,
        modelId: activeModel,
        attachments,
      }),
    });

    await loadSessions(true);
    navigateToSession(sessionId);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    await loadSessions(true);
    if (activeSessionId === id) {
      navigateToHome();
    }
  };

  const handleSelectWorkspace = async (
    newWorkspace: string,
    setAsDefault: boolean
  ) => {
    setDefaultWorkspace(newWorkspace);
    if (setAsDefault) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultWorkspace: newWorkspace }),
      });
    }
  };

  // Group sessions chronologically (Today, Yesterday, Previous)
  const groupedSessions = useMemo(() => {
    const filtered = sessions.filter((s) =>
      s.title.toLowerCase().includes(sidebarSearch.toLowerCase())
    );
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const startOfYesterday = startOfToday - 86400 * 1000;

    const today: SessionSummary[] = [];
    const yesterday: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const s of filtered) {
      if (s.updated_at >= startOfToday) today.push(s);
      else if (s.updated_at >= startOfYesterday) yesterday.push(s);
      else older.push(s);
    }

    return { today, yesterday, older };
  }, [sessions, sidebarSearch]);

  const renderMainContent = () => {
    if (activePage === 'chat' && activeSessionId) {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <ChatPage
            key={activeSessionId}
            sessionId={activeSessionId}
            workspace={defaultWorkspace}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onSessionsChanged={loadSessions}
          />
        </Suspense>
      );
    }

    if (activePage === 'artifacts') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <ArtifactsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'subagents') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <SubAgentsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'skills') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <SkillsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'slides') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <SlidesPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'mcp') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <McpPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    return (
      <HomePage
        workspace={defaultWorkspace}
        activeProvider={activeProvider}
        activeModel={activeModel}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
        onStartNewSessionWithPrompt={handleStartNewSessionWithPrompt}
      />
    );
  };

  return (
    <div className="app-shell">
      {/* Left Sidebar / Navigation Rail */}
      <aside
        id="sidebar"
        className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''} ${
          mobileSidebarOpen ? 'is-mobile-open' : ''
        }`}
        aria-label="Sidebar"
        onClick={(e) => {
          if (!sidebarCollapsed) return;
          if ((e.target as HTMLElement).closest('a, button')) return;
          setSidebarCollapsed(false);
        }}
      >
        <div className="sidebar-header">
          <button
            type="button"
            className="brand-link"
            title="Mythgram"
            onClick={navigateToHome}
          >
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 10.2L7.5 5.7C6.8 6.4 6.4 7.2 6.2 8.2L10 12L6.2 15.8C6.4 16.8 6.8 17.6 7.5 18.3L12 13.8L16.5 18.3C17.2 17.6 17.6 16.8 17.8 15.8L14 12L17.8 8.2C17.6 7.2 17.2 6.4 16.5 5.7L12 10.2Z" />
              </svg>
            </span>
            <span className="brand-name">Mythgram</span>
          </button>

          <div className="sidebar-header-actions">
            <button
              type="button"
              className="icon-btn search-btn"
              aria-label="Search chats"
              title="Search"
              onClick={() => setShowSidebarSearch(!showSidebarSearch)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="20" y1="20" x2="16.2" y2="16.2" />
              </svg>
            </button>

            <button
              type="button"
              className="icon-btn sidebar-close-btn"
              aria-label="Close navigation"
              title="Close navigation"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X size={18} />
            </button>

            <button
              type="button"
              className="icon-btn collapse-toggle-btn"
              aria-label="Collapse sidebar to navigation rail"
              title="Collapse to rail"
              onClick={() => setSidebarCollapsed(true)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </button>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="primary-nav" aria-label="Primary">
          <button
            type="button"
            className={`nav-link ${activePage === 'home' ? 'is-active' : ''}`}
            title="New Task"
            onClick={navigateToHome}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14, flexShrink: 0 }}
            >
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
            <span className="nav-label">New</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'artifacts' ? 'is-active' : ''}`}
            title="Artifacts"
            onPointerEnter={preloadArtifactsPage}
            onClick={() => navigateToPage('artifacts', '/artifacts')}
          >
            <Layers size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Artifacts</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'subagents' ? 'is-active' : ''}`}
            title="Sub-Agents"
            onPointerEnter={preloadSubAgentsPage}
            onClick={() => navigateToPage('subagents', '/sub-agents')}
          >
            <Bot size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Sub-Agents</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'skills' ? 'is-active' : ''}`}
            title="Skills"
            onPointerEnter={preloadSkillsPage}
            onClick={() => navigateToPage('skills', '/skills')}
          >
            <BookOpen size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Skills</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'slides' ? 'is-active' : ''}`}
            title="Slides"
            onPointerEnter={preloadSlidesPage}
            onClick={() => navigateToPage('slides', '/slides')}
          >
            <Presentation size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Slides</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'mcp' ? 'is-active' : ''}`}
            title="MCP Servers"
            onPointerEnter={preloadMcpPage}
            onClick={() => navigateToPage('mcp', '/mcp')}
          >
            <McpIcon size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">MCP</span>
          </button>
        </nav>

        {showSidebarSearch && !sidebarCollapsed && (
          <div className="sidebar-search-box">
            <input
              className="sidebar-search-input"
              placeholder="Filter chat sessions..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
          </div>
        )}

        {/* Scrollable Chronological Chat History */}
        <div className="sidebar-scroll" aria-label="Chat history">
          {groupedSessions.today.length > 0 && (
            <div>
              <div className="section-label">Today</div>
              <div className="list-group">
                {groupedSessions.today.map((s) => (
                  <div
                    key={s.id}
                    className={`list-item ${
                      activeSessionId === s.id ? 'is-selected' : ''
                    }`}
                    onClick={() => navigateToSession(s.id)}
                    onPointerEnter={preloadChatPage}
                  >
                    {s.isRunning && (
                      <span
                        className="running-dot"
                        title="Running in background"
                      />
                    )}
                    <span className="list-item-label">{s.title}</span>
                    <Trash2
                      size={12}
                      style={{ opacity: 0.45, flexShrink: 0 }}
                      onClick={(e) => handleDeleteSession(s.id, e)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedSessions.yesterday.length > 0 && (
            <div>
              <div className="section-label">Yesterday</div>
              <div className="list-group">
                {groupedSessions.yesterday.map((s) => (
                  <div
                    key={s.id}
                    className={`list-item ${
                      activeSessionId === s.id ? 'is-selected' : ''
                    }`}
                    onClick={() => navigateToSession(s.id)}
                    onPointerEnter={preloadChatPage}
                  >
                    {s.isRunning && <span className="running-dot" />}
                    <span className="list-item-label">{s.title}</span>
                    <Trash2
                      size={12}
                      style={{ opacity: 0.45, flexShrink: 0 }}
                      onClick={(e) => handleDeleteSession(s.id, e)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedSessions.older.length > 0 && (
            <div>
              <div className="section-label">Previous 7 Days</div>
              <div className="list-group">
                {groupedSessions.older.map((s) => (
                  <div
                    key={s.id}
                    className={`list-item ${
                      activeSessionId === s.id ? 'is-selected' : ''
                    }`}
                    onClick={() => navigateToSession(s.id)}
                    onPointerEnter={preloadChatPage}
                  >
                    {s.isRunning && <span className="running-dot" />}
                    <span className="list-item-label">{s.title}</span>
                    <Trash2
                      size={12}
                      style={{ opacity: 0.45, flexShrink: 0 }}
                      onClick={(e) => handleDeleteSession(s.id, e)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <div style={{ padding: '4px 10px', fontSize: 12, color: '#64646c' }}>
              No chat sessions yet.
            </div>
          )}
        </div>

        {/* Rail Bottom Expand Button */}
        <div className="rail-footer">
          <button
            type="button"
            className="icon-btn rail-expand-btn"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{ display: 'inline-flex' }}
            onClick={() => setSidebarCollapsed(false)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
        </div>
      </aside>

      {mobileSidebarOpen && (
        <div
          className="sidebar-overlay"
          aria-hidden="true"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Route View */}
      {renderMainContent()}

      {settingsOpen && (
        <Suspense fallback={<ModalFallback />}>
          <SettingsModal
            isOpen
            onClose={() => setSettingsOpen(false)}
            providers={providers}
            activeProvider={activeProvider}
            activeModel={activeModel}
            reasoningEffort={reasoningEffort}
            onRefreshSettings={loadSettings}
          />
        </Suspense>
      )}

      {workspaceModalOpen && (
        <Suspense fallback={<ModalFallback />}>
          <WorkspaceModal
            isOpen
            currentWorkspace={defaultWorkspace}
            onClose={() => setWorkspaceModalOpen(false)}
            onSelectWorkspace={handleSelectWorkspace}
          />
        </Suspense>
      )}
    </div>
  );
};
