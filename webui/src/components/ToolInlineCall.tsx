import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  FilePlus,
  FolderOpen,
  Search,
  Code,
  FileEdit,
  GitBranch,
  Image,
  QrCode,
  ScanText,
  Archive,
  PackageOpen,
  Terminal,
  ChevronRight,
  ChevronDown,
  Clock,
  Layers,
  Paperclip,
  HelpCircle,
  MessageSquare,
  Globe,
  ListTodo,
  ClipboardCheck,
  Bot,
  BookOpen,
  Presentation,
  Download,
  Eye,
  Check,
  X,
  Plug,
  Volume2,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { SubAgentRunItem } from './SubAgentTab';

export interface ToolActivityItem {
  id: string;
  session_id?: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
  result_json: string;
  status: 'running' | 'completed' | 'error';
  created_at: number;
}

export interface PendingInteractiveItem {
  promptId: string;
  toolCallId: string;
  activityId?: string;
  kind: 'ask_for_something' | 'ask_question_to_user' | 'submit_plan' | 'connect_connector';
  data: any;
  createdAt: number;
}

const ConnectorConnectCard: React.FC<{
  pending: PendingInteractiveItem;
  onSubmit: (promptId: string, response: any) => Promise<void>;
}> = ({ pending, onSubmit }) => {
  const data = pending.data || {};
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'connected' | 'error' | 'timeout'>(
    'idle'
  );
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const stopPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startPolling = () => {
    stopPolling();
    const startedAt = Date.now();
    timerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > (data.timeout_seconds || 180) * 1000) {
        stopPolling();
        setPhase('timeout');
        setMessage('Connection timed out. You can retry from the Connectors page.');
        return;
      }
      try {
        const res = await fetch(
          `/api/connectors/${encodeURIComponent(data.connector_name)}/status`
        );
        const status = await res.json();
        if (status.connected) {
          stopPolling();
          setPhase('connected');
          setMessage(`${data.name || data.connector_name} connected.`);
          await onSubmit(pending.promptId, {
            connected: true,
            connector_name: data.connector_name,
          });
        } else if (status.status === 'error') {
          stopPolling();
          setPhase('error');
          setMessage(status.error || 'Connection failed.');
        }
      } catch {
        // keep polling until the timeout
      }
    }, 3000);
  };

  const handleConnect = () => {
    setPhase('waiting');
    setMessage('Waiting for authorization in the opened tab…');
    if (data.redirect_url) window.open(data.redirect_url, '_blank', 'noopener');
    startPolling();
  };

  const handleCancel = async () => {
    stopPolling();
    await onSubmit(pending.promptId, { connected: false, cancelled: true });
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#000000',
        border: '1px solid #ededed',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: '#000000',
            border: '1px solid #262626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {data.logo ? (
            <img
              src={data.logo}
              alt={data.name || data.connector_name}
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
          ) : (
            <Plug size={16} />
          )}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#ededed' }}>
            Connect {data.name || data.connector_name}
          </span>
          <span style={{ fontSize: 11.5, color: '#a1a1a1' }}>
            {data.description || 'Authorize this application to give the agent access.'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="btn-primary inline-center"
          onClick={handleConnect}
          disabled={phase === 'waiting' || phase === 'connected'}
        >
          <Plug size={13} />
          {phase === 'connected' ? 'Connected' : phase === 'waiting' ? 'Waiting…' : 'Connect'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
        {message && (
          <span
            style={{
              fontSize: 11.5,
              color: phase === 'error' || phase === 'timeout' ? '#f87171' : '#a1a1a1',
            }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
};

interface ToolInlineCallProps {
  activity: ToolActivityItem;
  sessionId?: string;
  subAgentRuns?: SubAgentRunItem[];
  pendingInteractions?: PendingInteractiveItem[];
  onInspectInComputer?: (activity: ToolActivityItem) => void;
  onOpenArtifactTab?: (artifactId: string) => void;
  onOpenSubAgentTab?: (runId: string) => void;
  onOpenSlidesTab?: (projectId: string) => void;
  onOpenBrowserTab?: (url: string) => void;
  onSubmitInteractive?: (promptId: string, response: any) => Promise<void>;
}

export function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'file_write':
      return <FilePlus size={13} />;
    case 'file_read':
      return <FileText size={13} />;
    case 'file_list':
    case 'read_directory':
      return <FolderOpen size={13} />;
    case 'grep':
    case 'glob':
      return <Search size={13} />;
    case 'astgrep':
      return <Code size={13} />;
    case 'str_replace':
      return <FileEdit size={13} />;
    case 'apply_patch':
      return <GitBranch size={13} />;
    case 'read_image':
      return <Image size={13} />;
    case 'scan_qr_code':
      return <QrCode size={13} />;
    case 'fetch_text_from_image':
      return <ScanText size={13} />;
    case 'archive_files':
      return <Archive size={13} />;
    case 'extract_archive':
      return <PackageOpen size={13} />;
    case 'shall_tool':
      return <Terminal size={13} />;
    case 'wait':
      return <Clock size={13} />;
    case 'schedule_create':
    case 'schedule_list':
    case 'schedule_get':
    case 'schedule_run_now':
    case 'schedule_delete':
      return <Clock size={13} />;
    case 'save_artifacts':
    case 'list_artifacts':
    case 'show_artifact_to_user':
      return <Layers size={13} />;
    case 'attach_files':
      return <Paperclip size={13} />;
    case 'ask_for_something':
      return <HelpCircle size={13} />;
    case 'ask_question_to_user':
      return <MessageSquare size={13} />;
    case 'embed_url':
      return <Globe size={13} />;
    case 'read_todos':
    case 'todo_write':
      return <ListTodo size={13} />;
    case 'submit_plan':
      return <ClipboardCheck size={13} />;
    case 'create_sub_agent':
    case 'call_sub_agent':
    case 'list_sub_agents':
      return <Bot size={13} />;
    case 'create_skill':
    case 'list_skills':
      return <BookOpen size={13} />;
    case 'manage_slides':
    case 'present_slides':
    case 'organize_slides':
      return <Presentation size={13} />;
    case 'list_available_application_connectors':
    case 'connect_applications_connectors':
      return <Plug size={13} />;
    case 'generate_speech':
      return <Volume2 size={13} />;
    default:
      return <Terminal size={13} />;
  }
}

export function formatToolSummaryText(toolName: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson || '{}');
    switch (toolName) {
      case 'file_write':
        return `file_write ${args.file_path || ''}`;
      case 'file_read':
        return `file_read ${args.file_path || ''}`;
      case 'file_list':
        return `file_list ${args.path || ''}`;
      case 'read_directory':
        return `read_directory ${args.directory_path || ''}`;
      case 'grep':
        return `grep "${args.pattern || ''}" ${args.path || ''}`;
      case 'astgrep':
        return `astgrep "${args.pattern || ''}"`;
      case 'glob':
        return `glob "${args.pattern || ''}"`;
      case 'str_replace':
        return `str_replace ${args.file_path || ''}`;
      case 'apply_patch':
        return `apply_patch`;
      case 'read_image':
        return `read_image ${args.file_path || ''}`;
      case 'scan_qr_code':
        return `scan_qr_code ${args.image_path || ''}`;
      case 'fetch_text_from_image':
        return `fetch_text_from_image ${args.image_source || ''}`;
      case 'archive_files':
        return `archive_files ${args.archive_name || ''}.${args.archive_format || ''}`;
      case 'extract_archive':
        return `extract_archive ${args.archive_path || ''}`;
      case 'shall_tool':
        return `shall_tool $ ${args.command || ''}`;
      case 'wait':
        return `wait ${args.seconds ?? 1}s`;
      case 'schedule_create':
        return `schedule_create "${args.schedule_name || ''}" (${args.cadence || ''})`;
      case 'schedule_list':
        return `schedule_list ${args.status || 'all'}`;
      case 'schedule_get':
        return `schedule_get ${args.schedule_id || ''}`;
      case 'schedule_run_now':
        return `schedule_run_now ${args.schedule_id || ''}`;
      case 'schedule_delete':
        return `schedule_delete ${args.schedule_id || ''}`;
      case 'save_artifacts':
        return `save_artifacts "${args.title || ''}" (${args.type || ''})`;
      case 'list_artifacts':
        return `list_artifacts`;
      case 'show_artifact_to_user':
        return `show_artifact_to_user ${args.artifact_id || ''}`;
      case 'attach_files':
        return `attach_files (${Array.isArray(args.file_paths) ? args.file_paths.length : 0} file(s))`;
      case 'ask_for_something':
        return `ask_for_something (${Array.isArray(args.items) ? args.items.length : 1} input request(s))`;
      case 'ask_question_to_user':
        return `ask_question_to_user (${Array.isArray(args.questions) ? args.questions.length : 1} question(s))`;
      case 'embed_url':
        return `embed_url ${args.url || ''}`;
      case 'read_todos':
        return `read_todos`;
      case 'todo_write':
        return `todo_write (${Array.isArray(args.todos) ? args.todos.length : 0} task(s))`;
      case 'submit_plan':
        return `submit_plan`;
      case 'create_sub_agent':
        return `create_sub_agent "${args.name || ''}"`;
      case 'call_sub_agent': {
        const names = Array.isArray(args.agents)
          ? args.agents.map((a: any) => a.agent).join(', ')
          : '';
        return `call_sub_agent [${names}]`;
      }
      case 'list_sub_agents':
        return `list_sub_agents`;
      case 'create_skill':
        return `create_skill "${args.name || ''}"`;
      case 'list_skills':
        return `list_skills`;
      case 'list_available_application_connectors':
        return `list_available_application_connectors`;
      case 'connect_applications_connectors':
        return `connect_applications_connectors ${args.connector_name || ''}`;
      case 'organize_slides':
        return `organize_slides "${args.project_name || ''}" (${Array.isArray(args.slides) ? args.slides.length : 0} slides)`;
      case 'manage_slides':
        return `manage_slides ${args.action || ''} (${args.project_id || ''})`;
      case 'present_slides':
        return `present_slides [${Array.isArray(args.project_ids) ? args.project_ids.join(', ') : ''}]`;
      case 'generate_speech':
        return `generate_speech → ${args.output_directory || ''}`;
      default:
        return toolName;
    }
  } catch {
    return toolName;
  }
}

export const ToolInlineCall: React.FC<ToolInlineCallProps> = React.memo(
  ({
    activity,
    subAgentRuns,
    pendingInteractions,
    onInspectInComputer,
    onOpenArtifactTab,
    onOpenSubAgentTab,
    onOpenSlidesTab,
    onOpenBrowserTab,
    onSubmitInteractive,
  }) => {
    const [expanded, setExpanded] = useState(false);
    const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
    const [previewContent, setPreviewContent] = useState<string>('');

    // Form states for ask_for_something
    const [formValues, setFormValues] = useState<Record<number, string>>({});
    // Form states for ask_question_to_user
    const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});
    const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});
    // Form states for submit_plan
    const [editingPlan, setEditingPlan] = useState(false);
    const [editedPlanText, setEditedPlanText] = useState('');
    const [submittingInteractive, setSubmittingInteractive] = useState(false);

    const summary = formatToolSummaryText(activity.tool_name, activity.args_json);

    let parsedArgs: any = {};
    let parsedResult: any = {};
    try {
      parsedArgs = JSON.parse(activity.args_json || '{}');
    } catch {
      parsedArgs = {};
    }
    try {
      parsedResult = JSON.parse(activity.result_json || '{}');
    } catch {
      parsedResult = {};
    }

    const matchingPending = pendingInteractions?.find(
      (p) =>
        p.toolCallId === activity.tool_call_id ||
        p.activityId === activity.id
    );

    const matchingSubAgentRuns = (subAgentRuns || []).filter(
      (r) => r.parent_tool_call_id === activity.tool_call_id
    );

    const handlePreviewFile = async (filePath: string) => {
      if (previewFilePath === filePath) {
        setPreviewFilePath(null);
        return;
      }
      setPreviewFilePath(filePath);
      try {
        const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        setPreviewContent(data.content || data.error || '');
      } catch {
        setPreviewContent('Unable to preview file.');
      }
    };

    const renderSpecialInteractiveBlock = () => {
      const tool = activity.tool_name;

      // 1. attach_files card: preview & download attached files
      if (tool === 'attach_files' && Array.isArray(parsedResult.attached_files)) {
        return (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {parsedResult.attached_files.map((f: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    backgroundColor: '#000000',
                    border: '1px solid #262626',
                    fontSize: 12,
                  }}
                >
                  <Paperclip size={13} color="#ededed" />
                  <span style={{ fontWeight: 500, color: '#ededed' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: '#7d7d7d' }}>{f.size} B</span>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    style={{ padding: '2px 7px', fontSize: 11, minHeight: 24 }}
                    onClick={() => handlePreviewFile(f.file_path)}
                  >
                    <Eye size={11} />
                    Preview
                  </button>
                  <a
                    href={`/api/files/download?path=${encodeURIComponent(f.file_path)}`}
                    download={f.name}
                    className="btn-secondary inline-center"
                    style={{
                      padding: '2px 7px',
                      fontSize: 11,
                      minHeight: 24,
                      textDecoration: 'none',
                    }}
                  >
                    <Download size={11} />
                    Download
                  </a>
                </div>
              ))}
            </div>
            {previewFilePath && (
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  borderRadius: 6,
                  backgroundColor: '#000000',
                  border: '1px solid #262626',
                  maxHeight: 240,
                  overflowY: 'auto',
                  fontSize: 11.5,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {previewContent}
              </pre>
            )}
          </div>
        );
      }

      // 2. call_sub_agent card: click running/completed sub-agent to stream in Sub-Agent tab
      if (tool === 'call_sub_agent') {
        const agentsList = Array.isArray(parsedArgs.agents) ? parsedArgs.agents : [];
        return (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {matchingSubAgentRuns.length > 0
              ? matchingSubAgentRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onOpenSubAgentTab?.(run.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 11px',
                      borderRadius: 8,
                      backgroundColor: '#121212',
                      border: '1px solid #262626',
                      color: '#ededed',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    title="Click to open live Sub-Agent stream tab"
                  >
                    <Bot size={14} color="#ededed" />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                      {run.agent_name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 4,
                        backgroundColor:
                          run.status === 'running'
                            ? 'rgba(234,179,8,0.18)'
                            : 'rgba(34,197,94,0.18)',
                        color: run.status === 'running' ? '#fde047' : '#86efac',
                      }}
                    >
                      {run.status === 'running' ? 'Streaming live...' : run.status}
                    </span>
                  </button>
                ))
              : agentsList.map((a: any, i: number) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 10px',
                      borderRadius: 6,
                      backgroundColor: '#121212',
                      border: '1px solid #262626',
                      fontSize: 12,
                    }}
                  >
                    <Bot size={13} color="#ededed" />
                    <span>{a.agent}</span>
                  </span>
                ))}
          </div>
        );
      }

      // 3. show_artifact_to_user / save_artifacts quick button
      if (tool === 'show_artifact_to_user' || tool === 'save_artifacts') {
        const artId = parsedResult.artifact_id || parsedArgs.artifact_id;
        if (artId && onOpenArtifactTab) {
          return (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn-secondary inline-center"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
                onClick={() => onOpenArtifactTab(artId)}
              >
                <Layers size={12} color="#ededed" />
                Open Artifact in Tab ({parsedResult.title || parsedArgs.title || artId})
              </button>
            </div>
          );
        }
      }

      // 4. present_slides / organize_slides quick button
      if (tool === 'present_slides' || tool === 'organize_slides') {
        const projId =
          parsedResult.project_id ||
          parsedResult.project_ids?.[0] ||
          parsedArgs.project_ids?.[0];
        if (projId && onOpenSlidesTab) {
          return (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn-secondary inline-center"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
                onClick={() => onOpenSlidesTab(projId)}
              >
                <Presentation size={12} color="#ededed" />
                Open Slides Deck ({projId})
              </button>
            </div>
          );
        }
      }

      // 5. embed_url quick button
      if (tool === 'embed_url' && (parsedResult.embedded_url || parsedArgs.url)) {
        const u = parsedResult.embedded_url || parsedArgs.url;
        return (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn-secondary inline-center"
              style={{ padding: '4px 10px', fontSize: 11.5 }}
              onClick={() => onOpenBrowserTab?.(u)}
            >
              <Globe size={12} color="#ededed" />
              Open Embedded URL ({u})
            </button>
          </div>
        );
      }

      // 6. todo_write / read_todos inline task list
      if (
        (tool === 'todo_write' || tool === 'read_todos') &&
        Array.isArray(parsedResult.todos || parsedArgs.todos)
      ) {
        const todos = parsedResult.todos || parsedArgs.todos || [];
        if (todos.length > 0) {
          return (
            <div
              style={{
                marginTop: 6,
                padding: '8px 12px',
                borderRadius: 8,
                backgroundColor: '#000000',
                border: '1px solid #262626',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              {todos.map((t: any) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: t.status === 'completed' ? '#7d7d7d' : '#ededed',
                    textDecoration:
                      t.status === 'completed' ? 'line-through' : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor:
                        t.status === 'completed'
                          ? '#22c55e'
                          : t.status === 'in_progress'
                          ? '#eab308'
                          : '#262626',
                    }}
                  />
                  <span style={{ flex: 1 }}>{t.content}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 4,
                      backgroundColor: '#000000',
                      color: '#a1a1a1',
                    }}
                  >
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          );
        }
      }

      // 7. ask_for_something interactive form
      if (tool === 'ask_for_something' && matchingPending && onSubmitInteractive) {
        const items = Array.isArray(parsedArgs.items) ? parsedArgs.items : [];
        return (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmittingInteractive(true);
              const payload = items.map((it: any, idx: number) => ({
                request: it.request,
                value: formValues[idx] || '',
              }));
              await onSubmitInteractive(matchingPending.promptId, payload);
              setSubmittingInteractive(false);
            }}
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#000000',
              border: '1px solid #ededed',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ededed' }}>
              Information Requested by Agent
            </div>
            {items.map((item: any, idx: number) => (
              <div key={idx}>
                <label className="field-label" style={{ color: '#ededed' }}>
                  {item.request}
                </label>
                <input
                  required
                  className="input-field"
                  placeholder={item.placeholder || 'Enter value...'}
                  value={formValues[idx] || ''}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [idx]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn-primary inline-center"
                disabled={submittingInteractive}
              >
                <Check size={13} />
                Submit Information
              </button>
            </div>
          </form>
        );
      }

      // 8. connect_applications_connectors connector card with real logo + auth button
      if (tool === 'connect_applications_connectors' && matchingPending && onSubmitInteractive) {
        return <ConnectorConnectCard pending={matchingPending} onSubmit={onSubmitInteractive} />;
      }

      // 9. ask_question_to_user interactive options + custom input
      if (tool === 'ask_question_to_user' && matchingPending && onSubmitInteractive) {
        const questions = Array.isArray(parsedArgs.questions)
          ? parsedArgs.questions
          : [];
        return (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmittingInteractive(true);
              const answers = questions.map((q: any, idx: number) => {
                const chosen = selectedOptions[idx] || q.options?.[0] || '';
                const answer =
                  chosen === '__custom__'
                    ? customAnswers[idx] || ''
                    : chosen;
                return {
                  question: q.question,
                  answer,
                };
              });
              await onSubmitInteractive(matchingPending.promptId, answers);
              setSubmittingInteractive(false);
            }}
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#000000',
              border: '1px solid #ededed',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {questions.map((q: any, qIdx: number) => {
              const currentSelection =
                selectedOptions[qIdx] ?? q.options?.[0] ?? '';
              return (
                <div key={qIdx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ededed' }}>
                    {q.question}
                  </div>
                  {q.context && (
                    <div style={{ fontSize: 11.5, color: '#a1a1a1' }}>
                      {q.context}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(q.options || []).map((opt: string, oIdx: number) => (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() =>
                          setSelectedOptions((prev) => ({ ...prev, [qIdx]: opt }))
                        }
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor:
                            currentSelection === opt ? '#ededed' : '#121212',
                          border:
                            currentSelection === opt
                              ? '1px solid #ededed'
                              : '1px solid #262626',
                          color: '#ededed',
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedOptions((prev) => ({
                          ...prev,
                          [qIdx]: '__custom__',
                        }))
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        backgroundColor:
                          currentSelection === '__custom__'
                            ? '#ededed'
                            : '#121212',
                        border:
                          currentSelection === '__custom__'
                            ? '1px solid #ededed'
                            : '1px solid #262626',
                        color: '#ededed',
                      }}
                    >
                      Custom Answer...
                    </button>
                  </div>
                  {currentSelection === '__custom__' && (
                    <input
                      required
                      className="input-field"
                      placeholder="Type your custom answer..."
                      value={customAnswers[qIdx] || ''}
                      onChange={(e) =>
                        setCustomAnswers((prev) => ({
                          ...prev,
                          [qIdx]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn-primary inline-center"
                disabled={submittingInteractive}
              >
                <Check size={13} />
                Submit Answer(s)
              </button>
            </div>
          </form>
        );
      }

      // 9. submit_plan review card
      if (tool === 'submit_plan') {
        const planText = parsedArgs.plan || '';
        return (
          <div
            style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 10,
              backgroundColor: '#000000',
              border: matchingPending ? '1px solid #ededed' : '1px solid #262626',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ededed' }}>
              Implementation Plan Submitted for Review
            </div>
            {editingPlan ? (
              <textarea
                rows={8}
                className="input-field"
                value={editedPlanText}
                onChange={(e) => setEditedPlanText(e.target.value)}
              />
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <MarkdownRenderer content={planText} />
              </div>
            )}
            {matchingPending && onSubmitInteractive && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary inline-center"
                  onClick={() => {
                    if (!editingPlan) {
                      setEditedPlanText(planText);
                      setEditingPlan(true);
                    } else {
                      setEditingPlan(false);
                    }
                  }}
                >
                  {editingPlan ? 'Preview Plan' : 'Edit Plan'}
                </button>
                <button
                  type="button"
                  className="btn-secondary inline-center"
                  style={{ color: '#f87171' }}
                  disabled={submittingInteractive}
                  onClick={async () => {
                    setSubmittingInteractive(true);
                    await onSubmitInteractive(matchingPending.promptId, {
                      decision: 'rejected',
                      feedback: 'User rejected the implementation plan.',
                    });
                    setSubmittingInteractive(false);
                  }}
                >
                  <X size={13} />
                  Reject Plan
                </button>
                <button
                  type="button"
                  className="btn-primary inline-center"
                  disabled={submittingInteractive}
                  onClick={async () => {
                    setSubmittingInteractive(true);
                    await onSubmitInteractive(matchingPending.promptId, {
                      decision: 'approved',
                      editedPlan: editingPlan ? editedPlanText : planText,
                    });
                    setSubmittingInteractive(false);
                  }}
                >
                  <Check size={13} />
                  Approve Plan
                </button>
              </div>
            )}
          </div>
        );
      }

      return null;
    };

    return (
      <div className="tool-inline-item">
        <div className="tool-inline-row">
          <button
            type="button"
            className="tool-inline-trigger"
            onClick={() => {
              if (
                activity.tool_name === 'call_sub_agent' &&
                matchingSubAgentRuns.length > 0 &&
                onOpenSubAgentTab
              ) {
                onOpenSubAgentTab(matchingSubAgentRuns[0].id);
              }
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {getToolIcon(activity.tool_name)}
            <span>{summary}</span>
            {activity.status === 'running' && (
              <span style={{ color: '#a1a1a1', fontSize: 11 }}>(running...)</span>
            )}
            {activity.status === 'error' && (
              <span style={{ color: '#f87171', fontSize: 11 }}>(error)</span>
            )}
          </button>
          {onInspectInComputer && (
            <button
              type="button"
              onClick={() => onInspectInComputer(activity)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7d7d7d',
                fontSize: 11,
                cursor: 'pointer',
              }}
              title="View in Computer tab"
            >
              [open]
            </button>
          )}
        </div>

        {renderSpecialInteractiveBlock()}

        {expanded && (
          <div className="tool-inline-dropdown">
            <div style={{ marginBottom: 4, color: '#7d7d7d' }}>
              Arguments: {activity.args_json}
            </div>
            <div>
              Output:{' '}
              {activity.result_json
                ? activity.result_json.slice(0, 3000)
                : 'Waiting for output...'}
            </div>
          </div>
        )}
      </div>
    );
  }
);
