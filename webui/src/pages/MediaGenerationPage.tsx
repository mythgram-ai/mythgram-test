import React from 'react';
import {
  Menu,
  Settings,
  Image,
  Video,
  Music,
  Box,
  Plug,
  Sparkles,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { McpIcon } from '../components/McpIcon';
import { ZapierNotice } from '../components/ZapierNotice';

interface MediaGenerationPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
  onNavigateMcp: () => void;
  onNavigateConnectors: () => void;
}

const UPCOMING_MEDIA_TYPES = [
  {
    id: 'image',
    title: 'Image Generation',
    icon: Image,
    description:
      'High-resolution text-to-image synthesis, image editing, style transfer, and visual asset creation.',
  },
  {
    id: 'video',
    title: 'Video Generation',
    icon: Video,
    description:
      'Text-to-video and image-to-video motion clip generation, transitions, and cinematic storytelling.',
  },
  {
    id: 'music',
    title: 'Music Generation',
    icon: Music,
    description:
      'AI-composed instrumental tracks, full songs with vocals/lyrics, and ambient soundscapes.',
  },
  {
    id: '3d',
    title: '3D Model Generation',
    icon: Box,
    description:
      'Text-to-3D and image-to-3D mesh generation, textures, and exportable 3D assets.',
  },
];

export const MediaGenerationPage: React.FC<MediaGenerationPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
  onNavigateMcp,
  onNavigateConnectors,
}) => {
  return (
    <main className="main-canvas">
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            title="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="app-topbar-brand">
            <Image size={16} />
            <span>Media Generation</span>
            <span className="version-block">Coming Soon</span>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" onClick={onNavigateMcp}>
            <McpIcon size={13} />
            <span>MCP Servers</span>
          </button>
          <button type="button" className="topbar-btn" onClick={onNavigateConnectors}>
            <Plug size={13} />
            <span>Connectors</span>
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <ZapierNotice />

      <div className="tts-page-scroll">
        <div className="tts-page-container">
          {/* Coming Soon Hero Banner */}
          <section className="tts-card media-hero-card">
            <div className="media-coming-badge">
              <Clock size={12} />
              <span>Coming Soon</span>
            </div>
            <h2 className="media-hero-title">
              Native Image, Video, Music &amp; 3D Model Generation Coming Soon
            </h2>
            <p className="media-hero-subtitle">
              Built-in native media generation engines for <strong>Image</strong>,{' '}
              <strong>Video</strong>, <strong>Music</strong>, and <strong>3D Model</strong>{' '}
              generation are coming soon to Mythgram. In the meantime, you can immediately generate
              images, videos, music, and 3D assets inside your agent workflows by connecting{' '}
              <strong>MCP Servers</strong>, <strong>Application Connectors</strong>, or{' '}
              <strong>Zapier MCP</strong>.
            </p>
          </section>

          {/* 4 Media Generation Categories */}
          <div className="media-grid">
            {UPCOMING_MEDIA_TYPES.map((item) => {
              const IconComponent = item.icon;
              return (
                <div key={item.id} className="media-type-card">
                  <div className="media-type-head">
                    <span className="media-type-icon">
                      <IconComponent size={18} />
                    </span>
                    <span className="media-type-status">Coming Soon</span>
                  </div>
                  <h3 className="media-type-title">{item.title}</h3>
                  <p className="media-type-desc">{item.description}</p>
                </div>
              );
            })}
          </div>

          {/* Recommendations Section: MCP Server, Connectors, and Zapier MCP */}
          <section className="tts-card">
            <div className="tts-guide-header">
              <Sparkles size={15} />
              <h3>Recommended Ways to Generate Media Right Now</h3>
            </div>
            <p className="tts-card-subtitle" style={{ marginTop: 4 }}>
              While native media generation is in development, connect external media generation
              tools to Mythgram using any of the three integrations below:
            </p>

            <div className="media-recommend-grid">
              <div className="media-recommend-card">
                <div className="media-recommend-head">
                  <McpIcon size={16} />
                  <h4>1. MCP Servers</h4>
                </div>
                <p>
                  Connect local or remote Model Context Protocol (MCP) servers for Replicate,
                  FAL.ai, Stability AI, ElevenLabs, Suno, Blender/Meshy 3D, or custom media
                  pipelines. Every connected tool is automatically exposed to the agent.
                </p>
                <button
                  type="button"
                  className="btn-primary inline-center"
                  onClick={onNavigateMcp}
                >
                  <McpIcon size={13} />
                  Open MCP Servers
                </button>
              </div>

              <div className="media-recommend-card">
                <div className="media-recommend-head">
                  <Plug size={16} />
                  <h4>2. Application Connectors</h4>
                </div>
                <p>
                  Use Mythgram Application Connectors to authorize third-party creative and media
                  platforms with one-click OAuth and expose their actions directly to the agent.
                </p>
                <button
                  type="button"
                  className="btn-secondary inline-center"
                  onClick={onNavigateConnectors}
                >
                  <Plug size={13} />
                  Open Connectors
                </button>
              </div>

              <div className="media-recommend-card">
                <div className="media-recommend-head">
                  <Sparkles size={16} />
                  <h4>3. Zapier MCP</h4>
                </div>
                <p>
                  Connect <strong>Zapier MCP</strong> as a single remote MCP server to unlock
                  9,000+ apps—including image, video, audio, design, and cloud asset workflows—with
                  one authorization.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    href="https://zapier.com/mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-center"
                    style={{ textDecoration: 'none' }}
                  >
                    Explore Zapier MCP
                    <ArrowUpRight size={13} />
                  </a>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={onNavigateMcp}
                  >
                    Add in MCP Page
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
