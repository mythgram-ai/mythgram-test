import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder,
  FileText,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface WorkspaceNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size?: number;
  children?: WorkspaceNode[];
}

interface FilesTabProps {
  workspace: string;
}

export const FilesTab: React.FC<FilesTabProps> = ({ workspace }) => {
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  const treeRequestRef = useRef<Promise<void> | null>(null);

  const fetchTree = useCallback(async () => {
    if (document.hidden) return;
    if (treeRequestRef.current) return treeRequestRef.current;
    const request = (async () => {
      try {
        const res = await fetch(
          `/api/files/tree?path=${encodeURIComponent(workspace)}&depth=4`
        );
        const data = await res.json();
        if (Array.isArray(data.tree)) {
          setTree(data.tree);
        }
      } catch {
        // ignore
      }
    })();
    treeRequestRef.current = request;
    try {
      await request;
    } finally {
      if (treeRequestRef.current === request) treeRequestRef.current = null;
    }
  }, [workspace]);

  useEffect(() => {
    fetchTree();
    let timer: number | undefined;
    const startPolling = () => {
      if (timer === undefined) {
        timer = window.setInterval(fetchTree, 3000);
      }
    };
    const stopPolling = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchTree();
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchTree]);

  const handleOpenFile = async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setFileContent(data.content ?? data.error ?? '');
    } catch {
      setFileContent('Error reading file');
    }
  };

  const renderNodes = (nodes: WorkspaceNode[], depth = 0) => {
    return nodes.map((node) => {
      const isDir = node.type === 'directory';
      const isOpen = Boolean(expandedDirs[node.path]);

      return (
        <div key={node.path}>
          <div
            onClick={() => {
              if (isDir) {
                setExpandedDirs((prev) => ({
                  ...prev,
                  [node.path]: !prev[node.path],
                }));
              } else {
                handleOpenFile(node.path);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              paddingLeft: 8 + depth * 14,
              cursor: 'pointer',
              fontSize: 12,
              backgroundColor:
                selectedFile === node.path ? '#202027' : 'transparent',
              color: selectedFile === node.path ? '#f4f4f5' : '#b4b4bd',
              borderRadius: 5,
            }}
          >
            {isDir ? (
              <>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Folder size={13} color="#60a5fa" />
              </>
            ) : (
              <>
                <span style={{ width: 12 }} />
                <FileText size={13} color="#9e9ea7" />
              </>
            )}
            <span className="file-node-name">{node.name}</span>
          </div>
          {isDir &&
            isOpen &&
            node.children &&
            renderNodes(node.children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #1e1e22',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#121215',
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#a1a1aa',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspace}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={fetchTree}
          title="Refresh workspace files"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          className="files-tree-pane"
          style={{
            width: selectedFile ? '42%' : '100%',
            borderRight: selectedFile ? '1px solid #1e1e22' : 'none',
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {renderNodes(tree)}
        </div>

        {selectedFile && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: '#09090b',
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid #1c1c20',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#a1a1aa',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedFile}
              </span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Close
              </button>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 12,
                overflowY: 'auto',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11.5,
                lineHeight: 1.5,
                color: '#e4e4e7',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {fileContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
