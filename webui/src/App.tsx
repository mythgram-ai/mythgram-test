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
  Plug,
  Brain,
  Database,
  Sparkles,
  Volume2,
  Image,
  Terminal,
  CalendarClock,
  History,
  ChevronUp,
} from 'lucide-react';
import { HomePage } from './pages/HomePage';
import type { ProviderState } from './components/SettingsModal';
import type { UploadedAttachment } from './components/PromptBox';
import { McpIcon } from './components/McpIcon';
import { fetchActiveProfile } from './lib/profilesApi';
import type { ProfileSummary } from './lib/profilesApi';

const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((m) => ({ default: m.ChatPage }))
);
const ArtifactsPage = lazy(() =>
  import('./pages/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage }))
);
const SubAgentsPage = lazy(() =>
  import('./pages/SubAgentsPage').then((m) => ({ default: m.SubAgentsPage }))
);
const CustomAgentsPage = lazy(() =>
  import('./pages/CustomAgentsPage').then((m) => ({ default: m.CustomAgentsPage }))
);
const SkillsPage = lazy(() =>
  import('./pages/SkillsPage').then((m) => ({ default: m.SkillsPage }))
);
const SlidesPage = lazy(() =>
  import('./pages/SlidesPage').then((m) => ({ default: m.SlidesPage }))
);
const MemoryPage = lazy(() =>
  import('./pages/MemoryPage').then((m) => ({ default: m.MemoryPage }))
);
const KnowledgePage = lazy(() =>
  import('./pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage }))
);
const McpPage = lazy(() =>
  import('./pages/McpPage').then((m) => ({ default: m.McpPage }))
);
const ConnectorsPage = lazy(() =>
  import('./pages/ConnectorsPage').then((m) => ({ default: m.ConnectorsPage }))
);
const TtsPage = lazy(() =>
  import('./pages/TtsPage').then((m) => ({ default: m.TtsPage }))
);
const MediaGenerationPage = lazy(() =>
  import('./pages/MediaGenerationPage').then((m) => ({
    default: m.MediaGenerationPage,
  }))
);
const AcpPage = lazy(() =>
  import('./pages/AcpPage').then((m) => ({ default: m.AcpPage }))
);
const AutomationPage = lazy(() =>
  import('./pages/AutomationPage').then((m) => ({ default: m.AutomationPage }))
);
const CheckpointsPage = lazy(() =>
  import('./pages/CheckpointsPage').then((m) => ({ default: m.CheckpointsPage }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const WorkspaceModal = lazy(() =>
  import('./components/WorkspaceModal').then((m) => ({ default: m.WorkspaceModal }))
);
const ProfilesPage = lazy(() =>
  import('./pages/ProfilesPage').then((m) => ({ default: m.ProfilesPage }))
);
const ProfileMenu = lazy(() =>
  import('./components/ProfileMenu').then((m) => ({ default: m.ProfileMenu }))
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
const preloadCustomAgentsPage = () => {
  void import('./pages/CustomAgentsPage');
};
const preloadSkillsPage = () => {
  void import('./pages/SkillsPage');
};
const preloadSlidesPage = () => {
  void import('./pages/SlidesPage');
};
const preloadMemoryPage = () => {
  void import('./pages/MemoryPage');
};
const preloadKnowledgePage = () => {
  void import('./pages/KnowledgePage');
};
const preloadMcpPage = () => {
  void import('./pages/McpPage');
};
const preloadConnectorsPage = () => {
  void import('./pages/ConnectorsPage');
};
const preloadTtsPage = () => {
  void import('./pages/TtsPage');
};
const preloadMediaGenerationPage = () => {
  void import('./pages/MediaGenerationPage');
};
const preloadAcpPage = () => {
  void import('./pages/AcpPage');
};
const preloadAutomationPage = () => {
  void import('./pages/AutomationPage');
};
const preloadCheckpointsPage = () => {
  void import('./pages/CheckpointsPage');
};
const preloadProfilesPage = () => {
  void import('./pages/ProfilesPage');
};

type ActivePageType =
  | 'home'
  | 'chat'
  | 'artifacts'
  | 'subagents'
  | 'customagents'
  | 'skills'
  | 'memory'
  | 'knowledge'
  | 'slides'
  | 'mcp'
  | 'connectors'
  | 'tts'
  | 'mediageneration'
  | 'acp'
  | 'automation'
  | 'checkpoints'
  | 'profiles';

interface SessionSummary {
  id: string;
  title: string;
  workspace: string;
  provider_id: string;
  model_id: string;
  status: string;
  isRunning?: boolean;
  schedule_id?: string | null;
  origin?: string | null;
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
  if (loc.pathname.startsWith('/custom-agents')) return 'customagents';
  if (loc.pathname.startsWith('/skills')) return 'skills';
  if (loc.pathname.startsWith('/memory')) return 'memory';
  if (loc.pathname.startsWith('/knowledge')) return 'knowledge';
  if (loc.pathname.startsWith('/slides')) return 'slides';
  if (loc.pathname.startsWith('/mcp')) return 'mcp';
  if (loc.pathname.startsWith('/connectors')) return 'connectors';
  if (loc.pathname.startsWith('/tts')) return 'tts';
  if (loc.pathname.startsWith('/media-generation') || loc.pathname.startsWith('/media')) {
    return 'mediageneration';
  }
  if (loc.pathname.startsWith('/acp')) return 'acp';
  if (
    loc.pathname.startsWith('/automation') ||
    loc.pathname.startsWith('/schedules') ||
    loc.pathname.startsWith('/cron')
  ) {
    return 'automation';
  }
  if (loc.pathname.startsWith('/checkpoints')) return 'checkpoints';
  if (loc.pathname.startsWith('/profiles')) return 'profiles';
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

  // Active profile (isolated workspace) shown at the bottom of the sidebar
  const [activeProfile, setActiveProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [profileMenuError, setProfileMenuError] = useState('');

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

  const loadActiveProfile = useCallback(async () => {
    const profile = await fetchActiveProfile();
    setActiveProfile(profile);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    void loadActiveProfile();
  }, [loadActiveProfile]);

  const handleActivateProfile = useCallback(async (profileId: string) => {
    if (!profileId) return;
    setProfileMenuError('');
    setProfileSwitching(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/activate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data?.ok) {
        setProfileMenuError(data?.error || 'Could not switch profile.');
        setProfileSwitching(false);
        return;
      }
      window.location.assign('/');
    } catch {
      setProfileMenuError('Could not reach the server.');
      setProfileSwitching(false);
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

    if (activePage === 'customagents') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <CustomAgentsPage
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

    if (activePage === 'memory') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <MemoryPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'knowledge') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <KnowledgePage
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

    if (activePage === 'connectors') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <ConnectorsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'tts') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <TtsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'mediageneration') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <MediaGenerationPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onNavigateMcp={() => navigateToPage('mcp', '/mcp')}
            onNavigateConnectors={() => navigateToPage('connectors', '/connectors')}
          />
        </Suspense>
      );
    }

    if (activePage === 'acp') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <AcpPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'automation') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <AutomationPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onOpenSession={navigateToSession}
          />
        </Suspense>
      );
    }

    if (activePage === 'checkpoints') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <CheckpointsPage
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        </Suspense>
      );
    }

    if (activePage === 'profiles') {
      return (
        <Suspense fallback={<PageSkeleton />}>
          <ProfilesPage
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
        onOpenCustomAgents={() => navigateToPage('customagents', '/custom-agents')}
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
              <img src="/logo.svg" alt="" />
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
            className={`nav-link ${activePage === 'customagents' ? 'is-active' : ''}`}
            title="Custom Agents"
            onPointerEnter={preloadCustomAgentsPage}
            onClick={() => navigateToPage('customagents', '/custom-agents')}
          >
            <Sparkles size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Custom Agents</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'automation' ? 'is-active' : ''}`}
            title="Automation"
            onPointerEnter={preloadAutomationPage}
            onClick={() => navigateToPage('automation', '/automation')}
          >
            <CalendarClock size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Automation</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'checkpoints' ? 'is-active' : ''}`}
            title="Checkpoints"
            onPointerEnter={preloadCheckpointsPage}
            onClick={() => navigateToPage('checkpoints', '/checkpoints')}
          >
            <History size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Checkpoints</span>
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
            className={`nav-link ${activePage === 'memory' ? 'is-active' : ''}`}
            title="Memory"
            onPointerEnter={preloadMemoryPage}
            onClick={() => navigateToPage('memory', '/memory')}
          >
            <Brain size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Memory</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'knowledge' ? 'is-active' : ''}`}
            title="Knowledge"
            onPointerEnter={preloadKnowledgePage}
            onClick={() => navigateToPage('knowledge', '/knowledge')}
          >
            <Database size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Knowledge</span>
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

          <button
            type="button"
            className={`nav-link ${activePage === 'acp' ? 'is-active' : ''}`}
            title="ACP (Agent Client Protocol)"
            onPointerEnter={preloadAcpPage}
            onClick={() => navigateToPage('acp', '/acp')}
          >
            <Terminal size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">ACP</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'connectors' ? 'is-active' : ''}`}
            title="Connectors"
            onPointerEnter={preloadConnectorsPage}
            onClick={() => navigateToPage('connectors', '/connectors')}
          >
            <Plug size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Connectors</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'tts' ? 'is-active' : ''}`}
            title="Voice Generation (Local TTS)"
            onPointerEnter={preloadTtsPage}
            onClick={() => navigateToPage('tts', '/tts')}
          >
            <Volume2 size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">TTS</span>
          </button>

          <button
            type="button"
            className={`nav-link ${activePage === 'mediageneration' ? 'is-active' : ''}`}
            title="Media Generation"
            onPointerEnter={preloadMediaGenerationPage}
            onClick={() => navigateToPage('mediageneration', '/media-generation')}
          >
            <Image size={14} style={{ flexShrink: 0 }} />
            <span className="nav-label">Media Gen</span>
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
                    {s.schedule_id && (
                      <CalendarClock
                        size={11}
                        className="session-schedule-icon"
                        aria-label="Scheduled chat"
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
                    {s.schedule_id && (
                      <CalendarClock
                        size={11}
                        className="session-schedule-icon"
                        aria-label="Scheduled chat"
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
                    {s.schedule_id && (
                      <CalendarClock
                        size={11}
                        className="session-schedule-icon"
                        aria-label="Scheduled chat"
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
        {/* Active Profile + Menu */}
        <div className="sidebar-profile">
          <button
            id="sidebar-profile-btn"
            type="button"
            className={`sidebar-profile-btn ${profileMenuOpen ? 'is-open' : ''}`}
            title={activeProfile ? `${activeProfile.name} - profile menu` : 'Profile menu'}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            onPointerEnter={preloadProfilesPage}
            onClick={() => {
              setProfileMenuError('');
              setProfileMenuOpen((open) => !open);
            }}
          >
            {profileLoading ? (
              <span className="profile-avatar skeleton" aria-hidden="true" />
            ) : (
              <img
                className="profile-avatar"
                src={activeProfile?.logo || '/logo.svg'}
                alt=""
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).src = '/logo.svg';
                }}
              />
            )}
            <span className="sidebar-profile-text">
              <span className="sidebar-profile-name">
                {profileLoading ? 'Loading profile…' : activeProfile?.name || 'Profile'}
              </span>
              <span className="sidebar-profile-sub">
                {activeProfile?.is_default
                  ? 'Default profile'
                  : activeProfile
                  ? 'Custom profile'
                  : 'Profile'}
              </span>
            </span>
            <ChevronUp
              size={14}
              className={`sidebar-profile-chevron ${profileMenuOpen ? 'is-open' : ''}`}
            />
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

      {profileMenuOpen && (
        <Suspense
          fallback={
            <div className={`profile-menu ${sidebarCollapsed ? 'is-rail' : ''}`}>
              <div className="profile-menu-loading">
                <span
                  className="skeleton"
                  style={{ width: 36, height: 36, borderRadius: 10 }}
                />
                <div style={{ flex: 1 }}>
                  <span className="skeleton" style={{ width: '60%', height: 10 }} />
                  <span
                    className="skeleton"
                    style={{ width: '40%', height: 9, marginTop: 6 }}
                  />
                </div>
              </div>
            </div>
          }
        >
          <ProfileMenu
            profile={activeProfile}
            loading={profileLoading}
            error={profileMenuError}
            switching={profileSwitching}
            rail={sidebarCollapsed}
            onClose={() => {
              setProfileMenuOpen(false);
              setProfileMenuError('');
            }}
            onOpenProfiles={() => {
              setProfileMenuOpen(false);
              setProfileMenuError('');
              preloadProfilesPage();
              navigateToPage('profiles', '/profiles');
            }}
            onOpenSettings={() => {
              setProfileMenuOpen(false);
              setProfileMenuError('');
              setSettingsOpen(true);
            }}
            onSwitchToDefault={() => void handleActivateProfile('default')}
          />
        </Suspense>
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

      {profileSwitching && (
        <div className="profile-switch-overlay" role="status" aria-live="polite">
          <div className="profile-switch-card">
            <img src={activeProfile?.logo || '/logo.svg'} alt="" />
            <div className="profile-switch-text">
              <span className="profile-switch-title">Switching profile…</span>
              <span className="profile-switch-sub">Loading a fresh workspace…</span>
            </div>
            <span className="spinner" />
          </div>
        </div>
      )}
    </div>
  );
};
