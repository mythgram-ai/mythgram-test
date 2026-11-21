import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Settings,
  Monitor,
  Globe,
  FolderTree,
  Terminal as TerminalIcon,
  PanelRight,
  Cpu,
  Menu,
} from 'lucide-react';
import { PromptBox, UploadedAttachment } from '../components/PromptBox';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { ToolInlineCall, ToolActivityItem } from '../components/ToolInlineCall';

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

interface ChatPageProps {
  sessionId: string;
  workspace: string;
  activeProvider: string;
  activeModel: string;
  onOpenSettings: () => void;
  onOpenWorkspaceModal: () => void;
  onSessionsChanged: () => void;
  onOpenMobileNav?: () => void;
}

type RightTabType = 'computer' | 'browser' | 'files' | 'terminal';

function formatTokenCount(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
  workspace,
  activeProvider,
  activeModel,
  onOpenSettings,
  onOpenWorkspaceModal,
  onSessionsChanged,
  onOpenMobileNav,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loadingReplay, setLoadingReplay] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isThinkingNetwork, setIsThinkingNetwork] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activities, setActivities] = useState<ToolActivityItem[]>([]);
  const [contextTokens, setContextTokens] = useState(0);
  const [contextWindow, setContextWindow] = useState(128000);
  const [sessionWorkspace, setSessionWorkspace] = useState(workspace);

  // Right Panel State
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTabType>('computer');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activities, isRunning]);

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
            setIsRunning(Boolean(data.session.isRunning || data.session.status === 'running'));
            setContextTokens(data.session.context_tokens || 0);
            setContextWindow(data.session.contextWindow || 128000);
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
        onSessionsChanged();
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
        // Low or no network connection: never show network error, keep showing "thinking"
        setIsThinkingNetwork(true);
        setIsRunning(true);
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
        // Automatically open Computer tab when the agent starts taking action
        setRightPanelOpen(true);
        setRightTab('computer');
        setSelectedActivityId(activityId);
      });

      es.addEventListener('tool_call_done', (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        const { activityId, result, status } = evt.payload;
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
        setSelectedActivityId(activityId);
      });

      es.onerror = () => {
        // Never throw network error to user: keep showing thinking & silently reconnect
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

    // Optimistic user message display
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
            onSessionsChanged();
            break;
          }
          break;
        } catch {
          // Offline / low network resilience: wait and retry automatically while keeping "thinking" active
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

  // Map tool_call_id -> ToolActivityItem for inline rendering
  const activityByCallId = new Map<string, ToolActivityItem>();
  for (const act of activities) {
    activityByCallId.set(act.tool_call_id, act);
  }

  return (
    <main className="main-canvas">
      {/* Top Bar with Context Usage, Right Panel Toggles, and Settings */}
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn topbar-mobile-menu"
            aria-label="Open navigation"
            title="Menu"
            onClick={onOpenMobileNav}
          >
            <Menu size={16} />
          </button>

          <div className="app-topbar-brand">
            <span>Mythgram</span>
            <span className="version-block">v1</span>
          </div>

          <div
            className="topbar-badge"
            title="Live Context Window Token Usage captured from logs"
          >
            <Cpu size={12} />
            <span>
              Context: {formatTokenCount(contextTokens)} /{' '}
              {formatTokenCount(contextWindow)} tokens
            </span>
          </div>
        </div>

        <div className="topbar-right">
          {/* Right Sidebar Quick Tab Buttons in Chat Page */}
          <button
            type="button"
            className={`topbar-btn ${
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
            className={`topbar-btn ${
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
            className={`topbar-btn ${
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
            className={`topbar-btn ${
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
                .map((msg) => {
                  if (msg.role === 'user') {
                    // Strip internal system attachment footer for clean display while keeping user text
                    const displayContent = msg.content.split(
                      '\n\n[System Attachment Notice:'
                    )[0];
                    return (
                      <div key={msg.id} className="msg-user-row">
                        <div className="msg-user-bubble">{displayContent}</div>
                      </div>
                    );
                  }

                  let parsedToolCalls: any[] = [];
                  if (msg.tool_calls) {
                    try {
                      parsedToolCalls = JSON.parse(msg.tool_calls);
                    } catch {
                      parsedToolCalls = [];
                    }
                  }

                  return (
                    <div key={msg.id} className="msg-assistant-row">
                      {msg.reasoning && (
                        <div className="reasoning-inline">{msg.reasoning}</div>
                      )}
                      {msg.content && <MarkdownRenderer content={msg.content} />}

                      {/* Render tool calls in inline gray text with dropdown (no heavy blocks) */}
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
                            onInspectInComputer={(a) => {
                              setRightPanelOpen(true);
                              setRightTab('computer');
                              setSelectedActivityId(a.id);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}

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
                    onInspectInComputer={(a) => {
                      setRightPanelOpen(true);
                      setRightTab('computer');
                      setSelectedActivityId(a.id);
                    }}
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

        {/* Right Side Panel (1. Computer, 2. Browser, 3. Files, 4. Terminal) */}
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
            </div>

            <div className="right-panel-body">
              <Suspense
                fallback={
                  <div className="panel-loading">
                    <div className="spinner" />
                    <span>Loading panel…</span>
                  </div>
                }
              >
                {rightTab === 'computer' && (
                  <ComputerTab
                    activities={activities}
                    selectedActivityId={selectedActivityId}
                    onSelectActivity={setSelectedActivityId}
                  />
                )}
                {rightTab === 'browser' && <BrowserTab />}
                {rightTab === 'files' && <FilesTab workspace={sessionWorkspace} />}
                {rightTab === 'terminal' && (
                  <TerminalTab workspace={sessionWorkspace} />
                )}
              </Suspense>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
};
