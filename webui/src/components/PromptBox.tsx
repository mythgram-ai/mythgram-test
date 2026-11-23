import React, { useRef, useState } from 'react';
import { Folder, Cpu, Plus, ArrowUp, Square, X } from 'lucide-react';

export interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
  type?: string;
}

interface PromptBoxProps {
  prompt: string;
  onChangePrompt: (v: string) => void;
  onSubmit: (attachments: UploadedAttachment[]) => Promise<void>;
  onAbort?: () => void;
  isRunning?: boolean;
  workspace: string;
  onOpenWorkspaceModal: () => void;
  activeProvider: string;
  activeModel: string;
  onOpenSettingsModal: () => void;
}

export const PromptBox: React.FC<PromptBoxProps> = ({
  prompt,
  onChangePrompt,
  onSubmit,
  onAbort,
  isRunning = false,
  workspace,
  onOpenWorkspaceModal,
  activeProvider,
  activeModel,
  onOpenSettingsModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setShowAttachMenu(false);
    try {
      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        formData.append('files', f);
        const rel = (f as any).webkitRelativePath || f.name;
        formData.append('relativePaths', rel);
      }
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        setAttachments((prev) => [...prev, ...data.files]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!prompt.trim() && attachments.length === 0) return;
      const currentAtt = [...attachments];
      setAttachments([]);
      onSubmit(currentAtt);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && attachments.length === 0) return;
    const currentAtt = [...attachments];
    setAttachments([]);
    onSubmit(currentAtt);
  };

  return (
    <form className="prompt-box" onSubmit={handleFormSubmit}>
      <textarea
        className="prompt-textarea"
        name="prompt"
        rows={2}
        placeholder="How can I help you today?"
        aria-label="How can I help you today?"
        value={prompt}
        onChange={(e) => onChangePrompt(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {attachments.length > 0 && (
        <div className="prompt-attachments-list">
          {attachments.map((att, idx) => (
            <div key={idx} className="attachment-chip" title={att.path}>
              <span>{att.name}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, i) => i !== idx))
                }
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="prompt-toolbar">
        <div className="prompt-toolbar-left">
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="plus-btn"
              aria-label="Add attachment"
              title="Attach files or folders (.mythgram/uploads)"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
            >
              <Plus size={14} />
            </button>

            {showAttachMenu && (
              <div className="attach-menu">
                <button
                  type="button"
              className="list-item"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Files
                </button>
                <button
                  type="button"
              className="list-item"
                  onClick={() => folderInputRef.current?.click()}
                >
                  Upload Folder
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-ignore
              webkitdirectory="true"
              directory="true"
              style={{ display: 'none' }}
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
          </div>

          <button
            type="button"
            className="workspace-pill-btn"
            onClick={onOpenWorkspaceModal}
            title={`Active Workspace: ${workspace} (Click to change or create folder)`}
          >
            <Folder size={12} />
            <span>{workspace}</span>
          </button>

          <button
            type="button"
            className="model-pill-btn"
            onClick={onOpenSettingsModal}
            title="Configure LLM Provider & Model"
          >
            <Cpu size={12} />
            <span>
              {activeProvider}: {activeModel}
            </span>
          </button>

          {uploading && (
            <span className="upload-status">Uploading to .mythgram/uploads...</span>
          )}
        </div>

        <div className="prompt-toolbar-right">
          {isRunning && onAbort && (
            <button
              type="button"
              className="abort-btn"
              onClick={onAbort}
              title="Abort running agent"
            >
              <Square size={11} fill="currentColor" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="submit"
            className="send-btn"
            aria-label="Send prompt"
            disabled={!prompt.trim() && attachments.length === 0}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </form>
  );
};
