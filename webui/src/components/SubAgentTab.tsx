import React, { useState, useEffect, useRef } from 'react';
import { Bot, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolInlineCall, ToolActivityItem } from './ToolInlineCall';

export interface SubAgentRunItem {
  id: string;
  parent_session_id: string;
  parent_tool_call_id: string;
  agent_name: string;
  task: string;
  status: 'running' | 'completed' | 'aborted' | 'error';
  final_output: string;
  output_file_path?: string;
  isRunning?: boolean;
  created_at: number;
  updated_at: number;
}

interface SubAgentMessage {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string;
  tool_calls?: string;
  created_at: number;
}

interface SubAgentTabProps {
  runs: SubAgentRunItem[];
  selectedRunId: string | null;
  onSelectRunId: (id: string) => void;
}

export const SubAgentTab: React.FC<SubAgentTabProps> = ({
  runs,
  selectedRunId,
  onSelectRunId,
}) => {
  const [messages, setMessages] = useState<SubAgentMessage[]>([]);
  const [activities, setActivities] = useState<ToolActivityItem[]>([]);
  const [runStatus, setRunStatus] = useState<string>('idle');
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeRunId = selectedRunId || runs[runs.length - 1]?.id || null;
  const activeRun = runs.find((r) => r.id === activeRunId) || null;

  useEffect(() => {
    if (!activeRunId) {
      setMessages([]);
      setActivities([]);
      return;
    }

    let cancelled = false;
    const es = new EventSource(
      `/api/sub-agent-runs/${encodeURIComponent(activeRunId)}/stream`
    );

    es.addEventListener('replay_snapshot', (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(e.data);
        if (data.run) {
          setRunStatus(data.run.status || 'running');
        }
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        if (Array.isArray(data.activities)) {
          setActivities(data.activities);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('assistant_start', (e: MessageEvent) => {
      const evt = JSON.parse(e.data);
      const msgId = evt.payload.messageId;
      setRunStatus('running');
      setMessages((prev) => {
        if (prev.some((m) => m.id === msgId)) return prev;
        return [
          ...prev,
          {
            id: msgId,
            session_id: activeRunId,
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: (m.content || '') + delta }
            : m
        )
      );
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
      setActivities((prev) => {
        if (prev.some((a) => a.id === activityId)) return prev;
        return [
          ...prev,
          {
            id: activityId,
            session_id: activeRunId,
            tool_call_id: toolCallId,
            tool_name: toolName,
            args_json: JSON.stringify(args || {}),
            result_json: '',
            status: 'running',
            created_at: evt.timestamp || Date.now(),
          },
        ];
      });
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
    });

    es.addEventListener('session_status', (e: MessageEvent) => {
      const evt = JSON.parse(e.data);
      setRunStatus(evt.payload?.status || 'completed');
    });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [activeRunId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activities]);

  const activityByCallId = new Map<string, ToolActivityItem>();
  for (const act of activities) {
    activityByCallId.set(act.tool_call_id, act);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Sub-Agent Run Selector Bar */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #1f1f1f',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
        }}
      >
        {runs.length === 0 && (
          <span style={{ fontSize: 12, color: '#7d7d7d' }}>
            No sub-agent runs in this session yet.
          </span>
        )}
        {runs.map((r) => {
          const isSelected = r.id === activeRunId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectRunId(r.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                border: isSelected ? '1px solid #ededed' : '1px solid #262626',
                backgroundColor: isSelected ? '#191919' : '#0a0a0a',
                color: isSelected ? '#ededed' : '#a1a1a1',
                fontSize: 11.5,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Bot size={12} color="#ededed" />
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {r.agent_name}
              </span>
              {r.status === 'running' && (
                <Clock size={11} color="#eab308" />
              )}
              {r.status === 'completed' && (
                <CheckCircle2 size={11} color="#22c55e" />
              )}
              {r.status === 'error' && (
                <AlertCircle size={11} color="#ef4444" />
              )}
            </button>
          );
        })}
      </div>

      {/* Live Stream Body (Same reasoning + tool blocks UI as main agent) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 14,
          backgroundColor: '#000000',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {activeRun ? (
          <>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#000000',
                border: '1px solid #262626',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#ededed', fontFamily: 'JetBrains Mono, monospace' }}>
                  Sub-Agent: {activeRun.agent_name}
                </span>
                <span style={{ fontSize: 11, color: '#a1a1a1' }}>
                  Status: {runStatus || activeRun.status}
                </span>
              </div>
              <div style={{ color: '#d4d4d4', whiteSpace: 'pre-wrap' }}>
                {activeRun.task}
              </div>
              {activeRun.output_file_path && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#7d7d7d', fontFamily: 'JetBrains Mono, monospace' }}>
                  Background Output File: {activeRun.output_file_path}
                </div>
              )}
            </div>

            {messages
              .filter((m) => m.role === 'assistant')
              .map((msg) => {
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
                    {parsedToolCalls.map((tc: any, idx: number) => {
                      const act = activityByCallId.get(tc.id) || {
                        id: tc.id || `sub_tc_${idx}`,
                        tool_call_id: tc.id || `sub_tc_${idx}`,
                        tool_name: tc.function?.name || 'tool',
                        args_json: tc.function?.arguments || '{}',
                        result_json: '',
                        status: 'running' as const,
                        created_at: msg.created_at,
                      };
                      return <ToolInlineCall key={act.id} activity={act} />;
                    })}
                  </div>
                );
              })}

            {activities
              .filter(
                (a) =>
                  !messages.some(
                    (m) => m.tool_calls && m.tool_calls.includes(a.tool_call_id)
                  )
              )
              .map((act) => (
                <ToolInlineCall key={act.id} activity={act} />
              ))}

            {runStatus === 'running' && (
              <div className="thinking-row">
                <div className="spinner" />
                <span>Sub-agent {activeRun.agent_name} is executing...</span>
              </div>
            )}

            <div ref={endRef} />
          </>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7d7d7d',
              fontSize: 12.5,
              textAlign: 'center',
            }}
          >
            Click any running or completed sub-agent tool block in chat to watch its live reasoning and tool stream here.
          </div>
        )}
      </div>
    </div>
  );
};
