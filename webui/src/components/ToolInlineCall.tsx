import React, { useState } from 'react';
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
} from 'lucide-react';

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

interface ToolInlineCallProps {
  activity: ToolActivityItem;
  onInspectInComputer?: (activity: ToolActivityItem) => void;
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
      default:
        return toolName;
    }
  } catch {
    return toolName;
  }
}

export const ToolInlineCall: React.FC<ToolInlineCallProps> = ({
  activity,
  onInspectInComputer,
}) => {
  const [expanded, setExpanded] = useState(false);

  const summary = formatToolSummaryText(activity.tool_name, activity.args_json);

  return (
    <div className="tool-inline-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          className="tool-inline-trigger"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {getToolIcon(activity.tool_name)}
          <span>{summary}</span>
          {activity.status === 'running' && (
            <span style={{ color: '#a1a1aa', fontSize: 11 }}>(running...)</span>
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
              color: '#64646c',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="View in Computer tab"
          >
            [open]
          </button>
        )}
      </div>

      {expanded && (
        <div className="tool-inline-dropdown">
          <div style={{ marginBottom: 4, color: '#71717a' }}>
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
};
