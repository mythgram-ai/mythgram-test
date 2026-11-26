import React, { useEffect, useState } from 'react';
import { Settings, Menu } from 'lucide-react';
import { PromptBox, UploadedAttachment } from '../components/PromptBox';

interface HomePageProps {
  workspace: string;
  activeProvider: string;
  activeModel: string;
  onOpenSettings: () => void;
  onOpenWorkspaceModal: () => void;
  onOpenSidebar: () => void;
  onOpenCustomAgents?: () => void;
  onStartNewSessionWithPrompt: (
    prompt: string,
    attachments: UploadedAttachment[]
  ) => Promise<void>;
}

export const HomePage: React.FC<HomePageProps> = ({
  workspace,
  activeProvider,
  activeModel,
  onOpenSettings,
  onOpenWorkspaceModal,
  onOpenSidebar,
  onOpenCustomAgents,
  onStartNewSessionWithPrompt,
}) => {
  const [prompt, setPrompt] = useState('');
  const [activeAgent, setActiveAgent] = useState<{ name: string; logo: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/custom-agents')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.activeAgent) {
          setActiveAgent({ name: data.activeAgent.name, logo: data.activeAgent.logo });
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (attachments: UploadedAttachment[]) => {
    const text = prompt;
    setPrompt('');
    await onStartNewSessionWithPrompt(text, attachments);
  };

  return (
    <main className="main-canvas">
      {/* Top Header Bar in Main Application */}
      <header className="main-topbar" aria-label="Application header">
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
        </div>

        <div className="topbar-right">
          {onOpenCustomAgents && (
            <button
              type="button"
              className="topbar-btn"
              onClick={onOpenCustomAgents}
              title="Custom Agents"
            >
              <img
                src={activeAgent?.logo || '/logo.svg'}
                alt=""
                style={{ width: 14, height: 14, borderRadius: 4, objectFit: 'cover' }}
              />
              <span>{activeAgent?.name || 'Default Agent'}</span>
            </button>
          )}
          <button
            type="button"
            className="topbar-btn"
            onClick={onOpenSettings}
            title="Open Settings"
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Centered Workspace */}
      <div className="workspace-center">
        <div className="prompt-wrapper">
          <h1 className="slogan-heading">One workspace. Many agents.</h1>

          <PromptBox
            prompt={prompt}
            onChangePrompt={setPrompt}
            onSubmit={handleSubmit}
            workspace={workspace}
            onOpenWorkspaceModal={onOpenWorkspaceModal}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onOpenSettingsModal={onOpenSettings}
          />

          <p className="disclaimer-text">
            Mythgram can make mistakes. Please double-check responses.
          </p>
        </div>
      </div>
    </main>
  );
};
