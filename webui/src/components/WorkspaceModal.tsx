import React, { useState, useEffect } from 'react';
import { Folder, FolderPlus, ArrowUp, Check, X } from 'lucide-react';

interface WorkspaceNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: WorkspaceNode[];
}

interface WorkspaceModalProps {
  isOpen: boolean;
  currentWorkspace: string;
  onClose: () => void;
  onSelectWorkspace: (newWorkspace: string, setAsDefault: boolean) => void;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  currentWorkspace,
  onClose,
  onSelectWorkspace,
}) => {
  const [browsingPath, setBrowsingPath] = useState(currentWorkspace);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<WorkspaceNode[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);

  const loadWorkspaceFolders = async (targetPath: string) => {
    const res = await fetch(
      `/api/workspace?path=${encodeURIComponent(targetPath)}`
    );
    const data = await res.json();
    if (data.currentPath) {
      setBrowsingPath(data.currentPath);
      setParentPath(data.parentPath);
      setFolders(data.folders || []);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWorkspaceFolders(currentWorkspace);
    }
  }, [isOpen, currentWorkspace]);

  if (!isOpen) return null;

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/workspace/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentPath: browsingPath,
        folderName: newFolderName.trim(),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setNewFolderName('');
      await loadWorkspaceFolders(data.createdPath);
    }
  };

  const renderFolderTree = (nodes: WorkspaceNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.path}>
        <div
          onClick={() => loadWorkspaceFolders(node.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            paddingLeft: 10 + depth * 16,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12.5,
            color: '#d4d4d8',
          }}
          className="list-item"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Folder size={14} color="#a1a1aa" />
            <span style={{ fontWeight: 500 }}>{node.name}</span>
            <span className="folder-node-name">{node.path}</span>
          </div>
        </div>
        {node.children &&
          node.children.length > 0 &&
          renderFolderTree(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
        <div className="workspace-modal" onClick={(e) => e.stopPropagation()}>
          <div className="workspace-modal-title">
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Select Agent Workspace (Absolute Path)
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Current Absolute Path Bar */}
        <div className="workspace-row">
          {parentPath && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => loadWorkspaceFolders(parentPath)}
              title="Go to parent directory"
            >
              <ArrowUp size={13} />
            </button>
          )}
          <input
            className="input-field path-input"
            value={browsingPath}
            onChange={(e) => setBrowsingPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadWorkspaceFolders(browsingPath);
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadWorkspaceFolders(browsingPath)}
          >
            Go
          </button>
        </div>

        {/* Create New Folder in Current Workspace */}
        <div className="workspace-row">
          <input
            className="input-field"
            placeholder="Create new folder in current directory..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCreateFolder}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            <FolderPlus size={13} />
            New Folder
          </button>
        </div>

        {/* Folders-Only Tree List */}
        <div className="folder-tree">
          {folders.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: '#71717a' }}>
              No subdirectories inside {browsingPath}.
            </div>
          ) : (
            renderFolderTree(folders)
          )}
        </div>

        <div className="workspace-footer">
          <label className="workspace-checkbox">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
            />
            Set as default Mythgram workspace
          </label>
          <div className="workspace-footer-buttons">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onSelectWorkspace(browsingPath, makeDefault);
                onClose();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Check size={13} />
              Select Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
