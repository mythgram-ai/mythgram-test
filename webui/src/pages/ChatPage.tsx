import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import {
  Settings,
  Monitor,
  Globe,
  FolderTree,
  Terminal as TerminalIcon,
  PanelRight,
  Gauge,
  Menu,
  X,
  Layers,
  Bot,
  Presentation,
  ListTodo,
} from 'lucide-react';
import { PromptBox } from '../components/PromptBox';
import type { UploadedAttachment } from '../components/PromptBox';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { ToolInlineCall } from '../components/ToolInlineCall';
import type {
  ToolActivityItem,
  PendingInteractiveItem,
} from '../components/ToolInlineCall';
import type { SubAgentRunItem } from '../components/SubAgentTab';

const ComputerTab = lazy(() =>
  import('../components/ComputerTab').then((m) => ({ default: m.ComputerTab }))
);
const BrowserTab = lazy(() =>
  import('../components/BrowserTab').then((m) => ({ default: m.BrowserTab }))
);
const FilesTab = lazy(() =>
  import('../components/FilesTab').then((m) => ({ default: m.FilesTab }))
);
const TerminalTab = lazy(() =>
  import('../components/TerminalTab').then((m) => ({ default: m.TerminalTab }))
);
const ArtifactTab = lazy(() =>
  import('../components/ArtifactTab').then((m) => ({ default: m.ArtifactTab }))
);
const SubAgentTab = lazy(() =>
  import('../components/SubAgentTab').then((m) => ({ default: m.SubAgentTab }))
);
const SlidesTab = lazy(() =>
  import('../components/SlidesTab').then((m) => ({ default: m.SlidesTab }))
);
const ContextDashboard = lazy(() =>
  import('../components/ContextDashboard').then((m) => ({ default: m.ContextDashboard }))
);

interface MessageItem {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string;
  tool_calls?: string;
  tool_call_id?: string;
  name?: string;
  created_at: number;
}

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

interface ChatPageProps {
  sessionId: string;
  workspace: string;
  activeProvider: string;
  activeModel: string;
  onOpenSettings: () => void;
  onOpenWorkspaceModal: () => void;
  onOpenSidebar: () => void;
  onSessionsChanged: (force?: boolean) => void;
}

export type RightTabType =
  | 'computer'
  | 'browser'
  | 'files'
  | 'terminal'
  | 'artifacts'
  | 'subagents'
  | 'slides';

const UserMessageRow: React.FC<{ msg: MessageItem }> = React.memo(({ msg }) => {
  const displayContent = msg.content.split('\n\n[System Attachment Notice:')[0];
  return (
    <div className="msg-user-row">
      <div className="msg-user-bubble">{displayContent}</div>
    </div>
  );
});

interface AssistantMessageRowProps {
  msg: MessageItem;
  sessionId: string;
  activityByCallId: Map<string, ToolActivityItem>;
  subAgentRuns: SubAgentRunItem[];
  pendingInteractions: PendingInteractiveItem[];
  onInspect: (activity: ToolActivityItem) => void;
  onOpenArtifactTab: (artifactId: string) => void;
  onOpenSubAgentTab: (runId: string) => void;
  onOpenSlidesTab: (projectId: string) => void;
  onOpenBrowserTab: (url: string) => void;
  onSubmitInteractive: (promptId: string, response: any) => Promise<void>;
}

const AssistantMessageRow: React.FC<AssistantMessageRowProps> = React.memo(
  ({
    msg,
    sessionId,
    activityByCallId,
    subAgentRuns,
    pendingInteractions,
    onInspect,
    onOpenArtifactTab,
    onOpenSubAgentTab,
    onOpenSlidesTab,
    onOpenBrowserTab,
    onSubmitInteractive,
  }) => {
    let parsedToolCalls: any[] = [];
    if (msg.tool_calls) {
      try {
        parsedToolCalls = JSON.parse(msg.tool_calls);
      } catch {
        parsedToolCalls = [];
      }
    }

    return (
      <div className="msg-assistant-row">
        {msg.reasoning && (
          <div className="reasoning-inline">{msg.reasoning}</div>
        )}
        {msg.content && <MarkdownRenderer content={msg.content} />}

        {parsedToolCalls.map((tc: any, idx: number) => {
          const act = activityByCallId.get(tc.id) || {
            id: tc.id || `tc_${idx}`,
            tool_call_id: tc.id || `tc_${idx}`,
            tool_name: tc.function?.name || 'tool',
            args_json: tc.function?.arguments || '{}',
            result_json: '',
            status: 'running' as const,
            created_at: msg.created_at,
          };
          return (
            <ToolInlineCall
              key={act.id}
              activity={act}
              sessionId={sessionId}
              subAgentRuns={subAgentRuns}
              pendingInteractions={pendingInteractions}
              onInspectInComputer={onInspect}
              onOpenArtifactTab={onOpenArtifactTab}
              onOpenSubAgentTab={onOpenSubAgentTab}
              onOpenSlidesTab={onOpenSlidesTab}
              onOpenBrowserTab={onOpenBrowserTab}
              onSubmitInteractive={onSubmitInteractive}
            />
          );
        })}
      </div>
    );
  }
);

const PanelFallback: React.FC = () => (
  <div className="panel-loading">
    <div className="spinner" />
    <span>Loading panel...</span>
  </div>
);

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
  workspace,
  activeProvider,
  activeModel,
  onOpenSettings,
  onOpenWorkspaceModal,
  onOpenSidebar,
  onSessionsChanged,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loadingReplay, setLoadingReplay] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isThinkingNetwork, setIsThinkingNetwork] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activities, setActivities] = useState<ToolActivityItem[]>([]);
  const [subAgentRuns, setSubAgentRuns] = useState<SubAgentRunItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [pendingInteractions, setPendingInteractions] = useState<
    PendingInteractiveItem[]
  >([]);
  const [contextTokens, setContextTokens] = useState(0);
  const [contextWindow, setContextWindow] = useState(128000);
  const [sessionModel, setSessionModel] = useState('');
  const [sessionProvider, setSessionProvider] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [sessionWorkspace, setSessionWorkspace] = useState(workspace);

  // Right Panel State
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTabType>('computer');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedSubAgentRunId, setSelectedSubAgentRunId] = useState<string | null>(null);
  const [selectedSlideProjectId, setSelectedSlideProjectId] = useState<string | null>(null);
  const [embeddedBrowserUrl, setEmbeddedBrowserUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activities, isRunning, pendingInteractions]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRightPanelOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Connect to SSE stream with automatic reconnection & seamless refresh replay
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: any = null;

    setLoadingReplay(true);

    const connectSSE = () => {
      if (cancelled) return;
      es = new EventSource(`/api/sessions/${sessionId}/stream`);

      es.addEventListener('replay_snapshot', (e: MessageEvent) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(e.data);
          if (data.session) {
            setIsRunning(
              Boolean(data.session.isRunning || data.session.status === 'running')
            );
            setContextTokens(data.session.context_tokens || 0);
            setContextWindow(data.session.contextWindow || 128000);
            if (data.session.model_id) setSessionModel(data.session.model_id);
            if (data.session.provider_id) setSessionProvider(data.session.provider_id);
            if (data.session.workspace) {
              setSessionWorkspace(data.session.workspace);
            }
          }
          if (Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
          if (Array.isArray(data.activities)) {
            setActivities(data.activities);
            if (data.activities.length > 0) {
              setRightPanelOpen(true);
            }
          }
          if (Array.isArray(data.subAgentRuns)) {
            setSubAgentRuns(data.subAgentRuns);
          }
          if (Array.isArray(data.todos)) {
            setTodos(data.todos);
          }
          if (Array.isArray(data.pendingInteractions)) {
            setPendingInteractions(data.pendingInteractions);
          }
        } finally {
          setLoadingReplay(false);
          setIsThinkingNetwork(false);
        }
      });

      es.addEventListener('session_status', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const status = evt.payload?.status;
        setIsRunning(status === 'running');
        if (status !== 'running') {
          setIsThinkingNetwork(false);
        }
        onSessionsChanged(true);
      });

      es.addEventListener('context_usage', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        if (evt.payload?.contextTokens !== undefined) {
          setContextTokens(evt.payload.contextTokens);
        }
        if (evt.payload?.contextWindow !== undefined) {
          setContextWindow(evt.payload.contextWindow);
        }
      });

      es.addEventListener('network_waiting', () => {
        setIsThinkingNetwork(true);
        setIsRunning(true);
      });

      es.addEventListener('ui_action', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { action, data } = evt.payload || {};
        if (action === 'open_browser' && data?.url) {
          setEmbeddedBrowserUrl(data.url);
          setRightPanelOpen(true);
          setRightTab('browser');
        } else if (action === 'open_artifact' && data?.artifact_id) {
          setSelectedArtifactId(data.artifact_id);
          setRightPanelOpen(true);
          setRightTab('artifacts');
        } else if (action === 'open_slides' && data?.project_ids?.[0]) {
          setSelectedSlideProjectId(data.project_ids[0]);
          setRightPanelOpen(true);
          setRightTab('slides');
        } else if (action === 'todos_updated' && Array.isArray(data?.todos)) {
          setTodos(data.todos);
        }
      });

      es.addEventListener('sub_agent_status', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const p = evt.payload || {};
        setSubAgentRuns((prev) => {
          const exists = prev.some((r) => r.id === p.runId);
          if (!exists) {
            return [
              ...prev,
              {
                id: p.runId,
                parent_session_id: sessionId,
                parent_tool_call_id: p.parentToolCallId || '',
                agent_name: p.agentName || 'sub-agent',
                task: p.task || '',
                status: p.status || 'running',
                final_output: p.finalOutput || '',
                output_file_path: p.outputFilePath,
                created_at: evt.timestamp || Date.now(),
                updated_at: evt.timestamp || Date.now(),
              },
            ];
          }
          return prev.map((r) =>
            r.id === p.runId
              ? {
                  ...r,
                  status: p.status || r.status,
                  final_output: p.finalOutput ?? r.final_output,
                  output_file_path: p.outputFilePath ?? r.output_file_path,
                  updated_at: evt.timestamp || Date.now(),
                }
              : r
          );
        });
      });

      es.addEventListener('interactive_request', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const p = evt.payload;
        if (!p?.promptId) return;
        setPendingInteractions((prev) => {
          if (prev.some((item) => item.promptId === p.promptId)) return prev;
          return [
            ...prev,
            {
              promptId: p.promptId,
              toolCallId: p.toolCallId,
              activityId: p.activityId,
              kind: p.kind,
              data: p.data,
              createdAt: evt.timestamp || Date.now(),
            },
          ];
        });
      });

      es.addEventListener('interactive_resolved', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const p = evt.payload;
        setPendingInteractions((prev) =>
          prev.filter((item) => item.promptId !== p?.promptId)
        );
      });

      es.addEventListener('error', (e) => {
        const data = (e as MessageEvent).data;
        if (!data) return;
        let message = 'The agent stopped because of an error.';
        try {
          const evt = JSON.parse(data);
          message = evt.payload?.message || message;
        } catch {
          // ignore
        }
        setIsRunning(false);
        setIsThinkingNetwork(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `error_${Date.now()}`,
            session_id: sessionId,
            role: 'assistant',
            content: `⚠️ ${message}`,
            created_at: Date.now(),
          },
        ]);
        onSessionsChanged(true);
      });

      es.addEventListener('assistant_start', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const msgId = evt.payload.messageId;
        setIsRunning(true);
        setIsThinkingNetwork(false);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId,
              session_id: sessionId,
              role: 'assistant',
              content: '',
              reasoning: '',
              created_at: evt.timestamp || Date.now(),
            },
          ];
        });
      });

      es.addEventListener('assistant_reasoning', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { messageId, delta } = evt.payload;
        setIsThinkingNetwork(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, reasoning: (m.reasoning || '') + delta }
              : m
          )
        );
      });

      es.addEventListener('assistant_delta', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { messageId, delta } = evt.payload;
        setIsThinkingNetwork(false);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === messageId);
          if (!exists) {
            return [
              ...prev,
              {
                id: messageId,
                session_id: sessionId,
                role: 'assistant',
                content: delta,
                reasoning: '',
                created_at: Date.now(),
              },
            ];
          }
          return prev.map((m) =>
            m.id === messageId ? { ...m, content: (m.content || '') + delta } : m
          );
        });
      });

      es.addEventListener('assistant_done', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { messageId, content, reasoning, toolCalls } = evt.payload;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: content ?? m.content,
                  reasoning: reasoning ?? m.reasoning,
                  tool_calls:
                    toolCalls && toolCalls.length > 0
                      ? JSON.stringify(toolCalls)
                      : m.tool_calls,
                }
              : m
          )
        );
      });

      es.addEventListener('tool_call_start', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { activityId, toolCallId, toolName, args } = evt.payload;
        const newAct: ToolActivityItem = {
          id: activityId,
          session_id: sessionId,
          tool_call_id: toolCallId,
          tool_name: toolName,
          args_json: JSON.stringify(args || {}),
          result_json: '',
          status: 'running',
          created_at: evt.timestamp || Date.now(),
        };
        setActivities((prev) => {
          const exists = prev.some((a) => a.id === activityId);
          return exists ? prev : [...prev, newAct];
        });

        setRightPanelOpen(true);
        if (toolName === 'embed_url' && args?.url) {
          setEmbeddedBrowserUrl(args.url);
          setRightTab('browser');
        } else if (toolName === 'show_artifact_to_user' && args?.artifact_id) {
          setSelectedArtifactId(args.artifact_id);
          setRightTab('artifacts');
        } else if (toolName === 'present_slides' && args?.project_ids?.[0]) {
          setSelectedSlideProjectId(args.project_ids[0]);
          setRightTab('slides');
        } else {
          setSelectedActivityId(activityId);
        }
      });

      es.addEventListener('tool_call_done', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { activityId, toolName, result, status } = evt.payload;
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activityId
              ? {
                  ...a,
                  result_json: JSON.stringify(result || {}),
                  status: status || 'completed',
                }
              : a
          )
        );
        if (
          toolName !== 'embed_url' &&
          toolName !== 'show_artifact_to_user' &&
          toolName !== 'present_slides'
        ) {
          setSelectedActivityId(activityId);
        }
      });

      es.onerror = () => {
        if (!cancelled) {
          es?.close();
          reconnectTimer = setTimeout(connectSSE, 2000);
        }
      };
    };

    connectSSE();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [sessionId]);

  const handleSendPrompt = async (attachments: UploadedAttachment[]) => {
    const text = prompt;
    setPrompt('');
    setIsRunning(true);

    const tempUserMsg: MessageItem = {
      id: `temp_${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: text,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const attemptSend = async () => {
      while (true) {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: text,
              workspace: sessionWorkspace,
              providerId: activeProvider,
              modelId: activeModel,
              attachments,
            }),
          });
          if (res.ok) {
            onSessionsChanged(true);
            break;
          }
          break;
        } catch {
          setIsThinkingNetwork(true);
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    };

    attemptSend();
  };

  const handleAbort = async () => {
    await fetch(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
    setIsRunning(false);
    setIsThinkingNetwork(false);
  };

  const handleSubmitInteractive = useCallback(
    async (promptId: string, response: any) => {
      await fetch(`/api/sessions/${sessionId}/interactive-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, response }),
      });
      setPendingInteractions((prev) =>
        prev.filter((item) => item.promptId !== promptId)
      );
    },
    [sessionId]
  );

  // Map tool_call_id -> ToolActivityItem for inline rendering
  const activityByCallId = useMemo(() => {
    const map = new Map<string, ToolActivityItem>();
    for (const act of activities) {
      map.set(act.tool_call_id, act);
    }
    return map;
  }, [activities]);

  const handleInspect = useCallback((activity: ToolActivityItem) => {
    setRightPanelOpen(true);
    setRightTab('computer');
    setSelectedActivityId(activity.id);
  }, []);

  const handleOpenArtifactTab = useCallback((artifactId: string) => {
    setSelectedArtifactId(artifactId);
    setRightPanelOpen(true);
    setRightTab('artifacts');
  }, []);

  const handleOpenSubAgentTab = useCallback((runId: string) => {
    setSelectedSubAgentRunId(runId);
    setRightPanelOpen(true);
    setRightTab('subagents');
  }, []);

  const handleOpenSlidesTab = useCallback((projectId: string) => {
    setSelectedSlideProjectId(projectId);
    setRightPanelOpen(true);
    setRightTab('slides');
  }, []);

  const handleOpenBrowserTab = useCallback((url: string) => {
    setEmbeddedBrowserUrl(url);
    setRightPanelOpen(true);
    setRightTab('browser');
  }, []);

  const contextPct =
    contextWindow > 0
      ? Math.min(100, Math.round((contextTokens / contextWindow) * 1000) / 10)
      : 0;

  return (
    <main className="main-canvas">
      {/* Top Bar with Context Usage, Right Panel Toggles, and Settings */}
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            aria-label="Open navigation"
            title="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu size={18} />
          </button>

          <div className="app-topbar-brand">
            <span>Mythgram</span>
            <span className="version-block">v1</span>
          </div>

          {todos.length > 0 && (
            <div
              className="topbar-badge"
              title="Active Session Todo Progress"
            >
              <ListTodo size={12} />
              <span>
                {todos.filter((t) => t.status === 'completed').length}/{todos.length} Todos
              </span>
            </div>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn context-trigger"
            onClick={() => setContextOpen(true)}
            title="Open context window dashboard"
            aria-haspopup="dialog"
            aria-expanded={contextOpen}
          >
            <Gauge size={13} />
            <span>Context</span>
            <span className="context-trigger-pct">{contextPct}%</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'computer' ? 'is-active' : ''
            }`}
            onClick={() => {
              if (rightPanelOpen && rightTab === 'computer') {
                setRightPanelOpen(false);
              } else {
                setRightPanelOpen(true);
                setRightTab('computer');
              }
            }}
          >
            <Monitor size={13} />
            <span>Computer</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'browser' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('browser');
            }}
          >
            <Globe size={13} />
            <span>Browser</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'artifacts' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('artifacts');
            }}
          >
            <Layers size={13} />
            <span>Artifact</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'subagents' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('subagents');
            }}
          >
            <Bot size={13} />
            <span>Sub-Agent</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'slides' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('slides');
            }}
          >
            <Presentation size={13} />
            <span>Slides</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'files' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('files');
            }}
          >
            <FolderTree size={13} />
            <span>Files</span>
          </button>

          <button
            type="button"
            className={`topbar-btn panel-quick-btn ${
              rightPanelOpen && rightTab === 'terminal' ? 'is-active' : ''
            }`}
            onClick={() => {
              setRightPanelOpen(true);
              setRightTab('terminal');
            }}
          >
            <TerminalIcon size={13} />
            <span>Terminal</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title="Toggle Right Panel"
          >
            <PanelRight size={15} />
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

      {/* Split Layout: Conversation Stream + Optional Right Panel */}
      <div className="chat-split-layout">
        <div className="chat-conversation-column">
          <div className="chat-messages-scroll">
            <div className="chat-messages-inner">
              {loadingReplay && (
                <div className="thinking-row">
                  <div className="spinner" />
                  <span>Loading chat session & replaying stream...</span>
                </div>
              )}

              {messages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((msg) =>
                  msg.role === 'user' ? (
                    <UserMessageRow key={msg.id} msg={msg} />
                  ) : (
                    <AssistantMessageRow
                      key={msg.id}
                      msg={msg}
                      sessionId={sessionId}
                      activityByCallId={activityByCallId}
                      subAgentRuns={subAgentRuns}
                      pendingInteractions={pendingInteractions}
                      onInspect={handleInspect}
                      onOpenArtifactTab={handleOpenArtifactTab}
                      onOpenSubAgentTab={handleOpenSubAgentTab}
                      onOpenSlidesTab={handleOpenSlidesTab}
                      onOpenBrowserTab={handleOpenBrowserTab}
                      onSubmitInteractive={handleSubmitInteractive}
                    />
                  )
                )}

              {/* Also render any active running tool calls not yet attached to a completed assistant message */}
              {activities
                .filter(
                  (a) =>
                    !messages.some(
                      (m) => m.tool_calls && m.tool_calls.includes(a.tool_call_id)
                    )
                )
                .map((act) => (
                  <ToolInlineCall
                    key={act.id}
                    activity={act}
                    sessionId={sessionId}
                    subAgentRuns={subAgentRuns}
                    pendingInteractions={pendingInteractions}
                    onInspectInComputer={handleInspect}
                    onOpenArtifactTab={handleOpenArtifactTab}
                    onOpenSubAgentTab={handleOpenSubAgentTab}
                    onOpenSlidesTab={handleOpenSlidesTab}
                    onOpenBrowserTab={handleOpenBrowserTab}
                    onSubmitInteractive={handleSubmitInteractive}
                  />
                ))}

              {(isRunning || isThinkingNetwork) && (
                <div className="thinking-row">
                  <div className="spinner" />
                  <span>Thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Prompt Dock at Bottom */}
          <div className="chat-prompt-dock">
            <div className="prompt-wrapper">
              <PromptBox
                prompt={prompt}
                onChangePrompt={setPrompt}
                onSubmit={handleSendPrompt}
                onAbort={handleAbort}
                isRunning={isRunning}
                workspace={sessionWorkspace}
                onOpenWorkspaceModal={onOpenWorkspaceModal}
                activeProvider={activeProvider}
                activeModel={activeModel}
                onOpenSettingsModal={onOpenSettings}
              />
            </div>
          </div>
        </div>

        {/* Right Side Panel (Computer, Browser, Artifact, Sub-Agent, Slides, Files, Terminal) */}
        {rightPanelOpen && (
          <div
            className="panel-overlay"
            aria-hidden="true"
            onClick={() => setRightPanelOpen(false)}
          />
        )}
        {rightPanelOpen && (
          <aside className="right-panel">
            <div className="right-panel-header">
              <div className="right-panel-tabs">
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'computer' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('computer')}
                >
                  <Monitor size={13} />
                  <span>Computer</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'browser' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('browser')}
                >
                  <Globe size={13} />
                  <span>Browser</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'artifacts' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('artifacts')}
                >
                  <Layers size={13} />
                  <span>Artifact</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'subagents' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('subagents')}
                >
                  <Bot size={13} />
                  <span>Sub-Agent</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'slides' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('slides')}
                >
                  <Presentation size={13} />
                  <span>Slides</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'files' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('files')}
                >
                  <FolderTree size={13} />
                  <span>Files</span>
                </button>
                <button
                  type="button"
                  className={`panel-tab-btn ${
                    rightTab === 'terminal' ? 'is-active' : ''
                  }`}
                  onClick={() => setRightTab('terminal')}
                >
                  <TerminalIcon size={13} />
                  <span>Terminal</span>
                </button>
              </div>

              <button
                type="button"
                className="icon-btn right-panel-close"
                aria-label="Close panel"
                title="Close panel"
                onClick={() => setRightPanelOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="right-panel-body">
              <Suspense fallback={<PanelFallback />}>
                {rightTab === 'computer' && (
                  <ComputerTab
                    activities={activities}
                    selectedActivityId={selectedActivityId}
                    onSelectActivity={setSelectedActivityId}
                  />
                )}
                {rightTab === 'browser' && (
                  <BrowserTab embeddedUrl={embeddedBrowserUrl} />
                )}
                {rightTab === 'artifacts' && (
                  <ArtifactTab
                    selectedArtifactId={selectedArtifactId}
                    onSelectArtifactId={setSelectedArtifactId}
                  />
                )}
                {rightTab === 'subagents' && (
                  <SubAgentTab
                    runs={subAgentRuns}
                    selectedRunId={selectedSubAgentRunId}
                    onSelectRunId={setSelectedSubAgentRunId}
                  />
                )}
                {rightTab === 'slides' && (
                  <SlidesTab
                    sessionId={sessionId}
                    selectedProjectId={selectedSlideProjectId}
                    onSelectProjectId={setSelectedSlideProjectId}
                  />
                )}
                {rightTab === 'files' && (
                  <FilesTab workspace={sessionWorkspace} />
                )}
                {rightTab === 'terminal' && (
                  <TerminalTab workspace={sessionWorkspace} />
                )}
              </Suspense>
            </div>
          </aside>
        )}
      </div>

      {contextOpen && (
        <Suspense fallback={null}>
          <ContextDashboard
            usedTokens={contextTokens}
            contextWindow={contextWindow}
            provider={sessionProvider || activeProvider}
            model={sessionModel || activeModel}
            messageCount={messages.length}
            toolCallCount={activities.length}
            isRunning={isRunning}
            onClose={() => setContextOpen(false)}
          />
        </Suspense>
      )}
    </main>
  );
};
