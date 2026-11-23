import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Folder,
  FileText,
  Terminal,
  Eye,
  Code,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ToolActivityItem, getToolIcon } from './ToolInlineCall';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ComputerTabProps {
  activities: ToolActivityItem[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
}

interface SubTab {
  id: string;
  title: string;
  activityId: string | null;
}

export const ComputerTab: React.FC<ComputerTabProps> = ({
  activities,
  selectedActivityId,
  onSelectActivity,
}) => {
  const [subTabs, setSubTabs] = useState<SubTab[]>([
    { id: 'tab_main', title: 'Live Activity', activityId: null },
  ]);
  const [activeSubTabId, setActiveSubTabId] = useState<string>('tab_main');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  useEffect(() => {
    if (selectedActivityId) {
      setSubTabs((prev) =>
        prev.map((t) =>
          t.id === activeSubTabId ? { ...t, activityId: selectedActivityId } : t
        )
      );
    }
  }, [selectedActivityId]);

  const currentSubTab =
    subTabs.find((t) => t.id === activeSubTabId) || subTabs[0];

  const activeActivity =
    activities.find((a) => a.id === currentSubTab?.activityId) ||
    activities[activities.length - 1] ||
    null;

  const handleOpenNewSubTab = () => {
    const newId = `tab_${Date.now()}`;
    const latest = activities[activities.length - 1]?.id || null;
    setSubTabs([
      ...subTabs,
      {
        id: newId,
        title: `Activity ${subTabs.length + 1}`,
        activityId: latest,
      },
    ]);
    setActiveSubTabId(newId);
  };

  const handleCloseSubTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (subTabs.length <= 1) return;
    const next = subTabs.filter((t) => t.id !== id);
    setSubTabs(next);
    if (activeSubTabId === id) {
      setActiveSubTabId(next[next.length - 1].id);
    }
  };

  const renderActivityDetail = (act: ToolActivityItem) => {
    let args: any = {};
    let res: any = {};
    try {
      args = JSON.parse(act.args_json || '{}');
    } catch {
      args = {};
    }
    try {
      res = JSON.parse(act.result_json || '{}');
    } catch {
      res = { raw: act.result_json };
    }

    const tool = act.tool_name;

    // 1. file_write & file_read
    if (tool === 'file_write' || tool === 'file_read') {
      const filePath: string = res.file_path || args.file_path || '';
      const content: string =
        tool === 'file_write' ? args.content || '' : res.content || '';
      const lower = filePath.toLowerCase();
      const isMarkdown = lower.endsWith('.md') || lower.endsWith('.markdown');
      const isHtmlOrSvg = lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.svg');

      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #1f1f24',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#121215',
            }}
          >
            <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {filePath}
            </div>
            {(isMarkdown || isHtmlOrSvg) && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    backgroundColor: viewMode === 'preview' ? '#27272f' : '#16161a',
                  }}
                  onClick={() => setViewMode('preview')}
                >
                  <Eye size={11} style={{ marginRight: 4 }} />
                  Preview
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    backgroundColor: viewMode === 'raw' ? '#27272f' : '#16161a',
                  }}
                  onClick={() => setViewMode('raw')}
                >
                  <Code size={11} style={{ marginRight: 4 }} />
                  Raw
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {isMarkdown && viewMode === 'preview' ? (
              <MarkdownRenderer content={content} />
            ) : isHtmlOrSvg && viewMode === 'preview' ? (
              <iframe
                title="HTML/SVG Preview"
                srcDoc={content}
                  className="activity-iframe"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: '1px solid #27272a',
                    borderRadius: 6,
                    backgroundColor: '#ffffff',
                  }}
              />
            ) : (
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: '#e4e4e7',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {content}
              </pre>
            )}
          </div>
        </div>
      );
    }

    // 2. str_replace (old_string vs new_string diff view)
    if (tool === 'str_replace') {
      const oldStr = String(args.old_string || '');
      const newStr = String(args.new_string || '');
      return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          <div style={{ marginBottom: 10, color: '#a1a1aa' }}>
            File: {args.file_path}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>
              - Removed (old_string):
            </div>
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 6,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                color: '#fca5a5',
                whiteSpace: 'pre-wrap',
              }}
            >
              {oldStr}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 4 }}>
              + Added (new_string):
            </div>
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 6,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.28)',
                color: '#86efac',
                whiteSpace: 'pre-wrap',
              }}
            >
              {newStr || '(deleted lines)'}
            </pre>
          </div>
        </div>
      );
    }

    // 3. apply_patch rendered diff
    if (tool === 'apply_patch') {
      const patchLines = String(args.input || '').split(/\r?\n/);
      return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {patchLines.map((line, idx) => {
            let bg = 'transparent';
            let color = '#d4d4d8';
            if (line.startsWith('***')) {
              color = '#60a5fa';
            } else if (line.startsWith('@@')) {
              color = '#c084fc';
            } else if (line.startsWith('+')) {
              bg = 'rgba(34, 197, 94, 0.12)';
              color = '#86efac';
            } else if (line.startsWith('-')) {
              bg = 'rgba(239, 68, 68, 0.12)';
              color = '#fca5a5';
            }
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: bg,
                  color,
                  padding: '1px 6px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      );
    }

    // 4. shall_tool simulated terminal UI with terminal log colors
    if (tool === 'shall_tool') {
      return (
        <div
          style={{
            height: '100%',
            backgroundColor: '#09090b',
            padding: 14,
            overflowY: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <div style={{ color: '#22c55e', marginBottom: 8 }}>
            <span style={{ color: '#60a5fa' }}>{res.cwd || 'workspace'}</span> ${' '}
            <span style={{ color: '#f4f4f5', fontWeight: 500 }}>{args.command}</span>
          </div>
          {res.stdout && (
            <pre style={{ margin: 0, color: '#e4e4e7', whiteSpace: 'pre-wrap' }}>
              {res.stdout}
            </pre>
          )}
          {res.stderr && (
            <pre style={{ margin: '6px 0 0 0', color: '#f87171', whiteSpace: 'pre-wrap' }}>
              {res.stderr}
            </pre>
          )}
          {act.status !== 'running' && (
            <div style={{ marginTop: 10, fontSize: 11, color: res.exit_code === 0 ? '#4ade80' : '#f87171' }}>
              [Process exited with code {res.exit_code ?? 0}]
            </div>
          )}
        </div>
      );
    }

    // 5. file_list & read_directory tree rendering
    if (tool === 'file_list' || tool === 'read_directory') {
      const items = res.items || res.files || [];
      return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
          <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10, fontFamily: 'JetBrains Mono, monospace' }}>
            Directory: {res.directory || res.directory_path || args.path || args.directory_path}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map((item: any, idx: number) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: 6,
                  backgroundColor: '#141418',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.type === 'directory' ? (
                    <Folder size={13} color="#60a5fa" />
                  ) : (
                    <FileText size={13} color="#a1a1aa" />
                  )}
                  <span>{item.name || item.path}</span>
                </div>
                {item.size !== undefined && (
                  <span style={{ fontSize: 11, color: '#71717a' }}>{item.size} B</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 6. grep, astgrep, glob matches rendered
    if (tool === 'grep' || tool === 'astgrep' || tool === 'glob') {
      const matches = res.matches || [];
      return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          <div style={{ marginBottom: 10, color: '#a1a1aa' }}>
            Pattern: <span style={{ color: '#f4f4f5' }}>{args.pattern}</span> ({matches.length} matches)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.map((m: any, idx: number) =>
              typeof m === 'string' ? (
                <div key={idx} style={{ padding: '4px 8px', backgroundColor: '#141418', borderRadius: 5 }}>
                  {m}
                </div>
              ) : (
                <div key={idx} style={{ padding: 8, backgroundColor: '#141418', borderRadius: 6, border: '1px solid #222228' }}>
                  <div style={{ color: '#60a5fa', fontSize: 11, marginBottom: 4 }}>
                    {m.file}:{m.line || m.start_line}
                  </div>
                  <pre style={{ margin: 0, color: '#e4e4e7', whiteSpace: 'pre-wrap' }}>
                    {m.text || m.snippet}
                  </pre>
                </div>
              )
            )}
          </div>
        </div>
      );
    }

    // 7. read_image, scan_qr_code, fetch_text_from_image (Image rendered + extracted output)
    if (tool === 'read_image' || tool === 'scan_qr_code' || tool === 'fetch_text_from_image') {
      const imgSrc = res.data_url || res.source || args.file_path || args.image_path || args.image_source;
      return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#a1a1aa' }}>
            Source: {args.file_path || args.image_path || args.image_source}
          </div>
          {imgSrc && (
            <div style={{ backgroundColor: '#141418', padding: 10, borderRadius: 8, border: '1px solid #25252c', textAlign: 'center' }}>
              <img
                src={imgSrc}
                alt="Tool Visual Inspection"
                loading="lazy"
                decoding="async"
                style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 6 }}
              />
            </div>
          )}
          {res.decoded_text && (
            <div style={{ padding: 10, backgroundColor: '#141418', borderRadius: 6, border: '1px solid #27272f' }}>
              <div style={{ fontSize: 11, color: '#9e9ea7', marginBottom: 4 }}>Decoded QR Data:</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: '#4ade80' }}>
                {res.decoded_text}
              </div>
            </div>
          )}
          {res.text !== undefined && (
            <div style={{ padding: 10, backgroundColor: '#141418', borderRadius: 6, border: '1px solid #27272f' }}>
              <div style={{ fontSize: 11, color: '#9e9ea7', marginBottom: 4 }}>Extracted OCR Text:</div>
              <pre style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {res.text}
              </pre>
            </div>
          )}
        </div>
      );
    }

    // 8. archive_files, extract_archive, and any other tool
    return (
      <div style={{ padding: 14, overflowY: 'auto', height: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
        <div style={{ marginBottom: 10, color: '#a1a1aa' }}>Tool: {tool}</div>
        <pre style={{ margin: 0, padding: 10, backgroundColor: '#141418', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify({ arguments: args, output: res }, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs bar with + button */}
      <div className="computer-subtabs">
        {subTabs.map((tab) => (
          <div
            key={tab.id}
            className={`computer-subtab ${tab.id === activeSubTabId ? 'is-active' : ''}`}
            onClick={() => setActiveSubTabId(tab.id)}
          >
            <Terminal size={11} />
            <span>{tab.title}</span>
            {subTabs.length > 1 && (
              <X
                size={11}
                onClick={(e) => handleCloseSubTab(tab.id, e)}
                style={{ opacity: 0.7 }}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          className="icon-btn subtab-add-btn"
          onClick={handleOpenNewSubTab}
          title="Open new Computer tab"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Main Split inside Computer Panel: Activity Timeline selector + Read-Only Viewer */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left mini timeline of tool calls */}
        <div className="computer-timeline">
          <div style={{ fontSize: 10.5, color: '#64646c', padding: '2px 6px 6px 6px', fontWeight: 600 }}>
            AGENT ACTIONS ({activities.length})
          </div>
          {activities.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => {
                onSelectActivity(act.id);
                setSubTabs((prev) =>
                  prev.map((t) =>
                    t.id === activeSubTabId ? { ...t, activityId: act.id } : t
                  )
                );
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 7px',
                borderRadius: 6,
                border: 'none',
                backgroundColor:
                  activeActivity?.id === act.id ? '#1e1e24' : 'transparent',
                color: activeActivity?.id === act.id ? '#f4f4f5' : '#9e9ea7',
                fontSize: 11.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 5,
                marginBottom: 2,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getToolIcon(act.tool_name)}
                <span>{act.tool_name}</span>
              </span>
              {act.status === 'completed' && <CheckCircle2 size={11} color="#22c55e" />}
              {act.status === 'error' && <AlertCircle size={11} color="#ef4444" />}
            </button>
          ))}
          {activities.length === 0 && (
            <div style={{ padding: 8, fontSize: 11, color: '#64646c' }}>
              No agent tool activity yet.
            </div>
          )}
        </div>

        {/* Right Read-Only Inspector */}
        <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
          {activeActivity ? (
            renderActivityDetail(activeActivity)
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64646c',
                fontSize: 12.5,
              }}
            >
              Agent computer is idle. Tool actions will appear here automatically.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
