import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Trash2 } from 'lucide-react';
import { HomePage } from './pages/HomePage';
import type { ProviderState } from './components/SettingsModal';
import type { UploadedAttachment } from './components/PromptBox';

const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((m) => ({ default: m.ChatPage }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const WorkspaceModal = lazy(() =>
  import('./components/WorkspaceModal').then((m) => ({ default: m.WorkspaceModal }))
);

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
  // Support `/chat/session=<30digits>` and `/chat?session=<30digits>`
  const pathMatch = loc.pathname.match(/^\/chat\/session=([a-zA-Z0-9]{1,64})/);
  if (pathMatch) return pathMatch[1];
  const params = new URLSearchParams(loc.search);
  if (loc.pathname.startsWith('/chat') && params.get('session')) {
    return params.get('session');
  }
  return null;
}

interface AppProps {
  onReady?: () => void;
}

export const App: React.FC<AppProps> = ({ onReady }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showSidebarSearch, setShowSidebarSearch] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    parseSessionIdFromLocation(window.location)
  );

  // Settings & Workspace state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [activeProvider, setActiveProvider] = useState('pollinations');
  const [activeModel, setActiveModel] = useState('openai');
  const [reasoningEffort, setReasoningEffort] = useState('default');
  const [defaultWorkspace, setDefaultWorkspace] = useState('');

  const loadSettings = useCallback(async () => {
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
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      }
    } catch {
      // ignore
    }
  }, []);

  // Let the boot shell fade out as soon as the app has mounted.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    loadSettings();
    loadSessions();
    // Poll sessions, but skip ticks while the tab is hidden to save bandwidth/CPU.
    const interval = setInterval(() => {
      if (!document.hidden) loadSessions();
    }, 4000);
    const onVisible = () => {
      if (!document.hidden) loadSessions();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadSessions, loadSettings]);

  useEffect(() => {
    const onPopState = () => {
      setActiveSessionId(parseSessionIdFromLocation(window.location));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Close the mobile drawer automatically when the viewport grows back to desktop.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const navigateToHome = useCallback(() => {
    window.history.pushState({}, '', '/');
    setActiveSessionId(null);
    setMobileNavOpen(false);
  }, []);

  const navigateToSession = useCallback((sessionId: string) => {
    const targetUrl = `/chat/session=${sessionId}`;
    window.history.pushState({}, '', targetUrl);
    setActiveSessionId(sessionId);
    setMobileNavOpen(false);
  }, []);

  const handleStartNewSessionWithPrompt = useCallback(
    async (prompt: string, attachments: UploadedAttachment[]) => {
      // 1. Request a 30-digit alphanumeric session ID
      const idRes = await fetch('/api/sessions/new-id', { method: 'POST' });
      const { sessionId } = await idRes.json();

      // 2. Submit user prompt to start background ReAct loop
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

      await loadSessions();
      // 3. Redirect to /chat/session=<30_digits_id>
      navigateToSession(sessionId);
    },
    [defaultWorkspace, activeProvider, activeModel, loadSessions, navigateToSession]
  );

  const handleDeleteSession = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      await loadSessions();
      setActiveSessionId((current) => {
        if (current === id) {
          window.history.pushState({}, '', '/');
          return null;
        }
        return current;
      });
    },
    [loadSessions]
  );

  const handleSelectWorkspace = useCallback(
    async (newWorkspace: string, setAsDefault: boolean) => {
      setDefaultWorkspace(newWorkspace);
      if (setAsDefault) {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultWorkspace: newWorkspace }),
        });
      }
    },
    []
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openWorkspaceModal = useCallback(() => setWorkspaceModalOpen(true), []);
  const closeWorkspaceModal = useCallback(() => setWorkspaceModalOpen(false), []);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

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

  return (
    <div className="app-shell">
      {/* Left Sidebar / Navigation Rail (matches design.html) */}
      <aside
        id="sidebar"
        className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''} ${
          mobileNavOpen ? 'is-mobile-open' : ''
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

            <button
              type="button"
              className="icon-btn sidebar-mobile-close"
              aria-label="Close navigation"
              title="Close"
              onClick={() => setMobileNavOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="primary-nav" aria-label="Primary">
          <button
            type="button"
            className={`nav-link ${!activeSessionId ? 'is-active' : ''}`}
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
                  >
                    {s.isRunning && <span className="running-dot" title="Running in background" />}
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

      {mobileNavOpen && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Route View: Home Page or Chat Page */}
      {activeSessionId ? (
        <Suspense fallback={<div className="route-fallback" />}>
          <ChatPage
            key={activeSessionId}
            sessionId={activeSessionId}
            workspace={defaultWorkspace}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onOpenSettings={openSettings}
            onOpenWorkspaceModal={openWorkspaceModal}
            onSessionsChanged={loadSessions}
            onOpenMobileNav={openMobileNav}
          />
        </Suspense>
      ) : (
        <HomePage
          workspace={defaultWorkspace}
          activeProvider={activeProvider}
          activeModel={activeModel}
          onOpenSettings={openSettings}
          onOpenWorkspaceModal={openWorkspaceModal}
          onStartNewSessionWithPrompt={handleStartNewSessionWithPrompt}
          onOpenMobileNav={openMobileNav}
        />
      )}

      {/* Settings Popup Modal (lazy: heavy provider/model UI only loads on demand) */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={settingsOpen}
            onClose={closeSettings}
            providers={providers}
            activeProvider={activeProvider}
            activeModel={activeModel}
            reasoningEffort={reasoningEffort}
            onRefreshSettings={loadSettings}
          />
        </Suspense>
      )}

      {/* Workspace Selector & Folder Creator Modal (lazy) */}
      {workspaceModalOpen && (
        <Suspense fallback={null}>
          <WorkspaceModal
            isOpen={workspaceModalOpen}
            currentWorkspace={defaultWorkspace}
            onClose={closeWorkspaceModal}
            onSelectWorkspace={handleSelectWorkspace}
          />
        </Suspense>
      )}
    </div>
  );
};
