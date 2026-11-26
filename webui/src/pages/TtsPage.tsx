import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Menu,
  Settings,
  Volume2,
  Play,
  Square,
  RefreshCw,
  Terminal,
  ExternalLink,
  Check,
  Copy,
  AlertTriangle,
  BookOpen,
  Trash2,
  Globe,
  Loader2,
} from 'lucide-react';
import { ZapierNotice } from '../components/ZapierNotice';

interface TtsStatusResponse {
  ok: boolean;
  status: 'stopped' | 'installing' | 'starting' | 'running' | 'error';
  pid: number | null;
  base_url: string;
  logs: string[];
  error?: string;
  started_at?: number;
  reachable?: boolean;
  settings?: {
    base_url: string;
  };
}

interface TtsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

const STATUS_BADGE: Record<
  TtsStatusResponse['status'],
  { label: string; color: string; dotClass: string }
> = {
  running: { label: 'Running', color: '#4ade80', dotClass: 'is-connected' },
  installing: {
    label: 'Installing local-tts-studio…',
    color: '#eab308',
    dotClass: 'is-connecting',
  },
  starting: { label: 'Starting local-tts…', color: '#eab308', dotClass: 'is-connecting' },
  error: { label: 'Error', color: '#f87171', dotClass: 'is-error' },
  stopped: { label: 'Stopped', color: '#9e9ea7', dotClass: 'is-disconnected' },
};

export const TtsPage: React.FC<TtsPageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [statusData, setStatusData] = useState<TtsStatusResponse>({
    ok: true,
    status: 'stopped',
    pid: null,
    base_url: 'http://localhost:7878',
    logs: [],
    reachable: false,
  });
  const [baseUrlInput, setBaseUrlInput] = useState('http://localhost:7878');
  const [baseUrlDirty, setBaseUrlDirty] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const fetchStatus = useCallback(
    async (syncUrlInput = false) => {
      try {
        const res = await fetch('/api/tts/status');
        const data: TtsStatusResponse = await res.json();
        if (data && data.ok) {
          setStatusData(data);
          if (syncUrlInput || !baseUrlDirty) {
            setBaseUrlInput(data.base_url || 'http://localhost:7878');
          }
        }
      } catch {
        // ignore network poll errors
      }
    },
    [baseUrlDirty]
  );

  useEffect(() => {
    void fetchStatus(true);
    const timer = window.setInterval(() => {
      void fetchStatus(false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusData.logs.length]);

  const handleRunLocalTts = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/tts/start', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        flashToast('Running: pip install local-tts-studio && local-tts');
      } else {
        flashToast(data.error || 'Failed to start Local TTS');
      }
    } catch (err: any) {
      flashToast(err?.message || 'Failed to start Local TTS');
    } finally {
      setStarting(false);
    }
  };

  const handleStopLocalTts = async () => {
    setStopping(true);
    try {
      const res = await fetch('/api/tts/stop', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        flashToast('Local TTS service stopped.');
      }
    } finally {
      setStopping(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/tts/logs/clear', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveBaseUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = baseUrlInput.trim();
    if (!trimmed) return;
    setSavingUrl(true);
    try {
      const res = await fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: trimmed }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        setBaseUrlInput(data.base_url || trimmed);
        setBaseUrlDirty(false);
        flashToast('Custom Base URL saved.');
      } else {
        flashToast(data.error || 'Invalid Base URL');
      }
    } catch (err: any) {
      flashToast(err?.message || 'Failed to save Base URL');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleResetBaseUrl = async () => {
    const defaultUrl = 'http://localhost:7878';
    setBaseUrlInput(defaultUrl);
    setBaseUrlDirty(false);
    setSavingUrl(true);
    try {
      const res = await fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: defaultUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        flashToast('Reset to default http://localhost:7878');
      }
    } finally {
      setSavingUrl(false);
    }
  };

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const isBusyRunning =
    statusData.status === 'installing' ||
    statusData.status === 'starting' ||
    statusData.status === 'running';
  const badge = STATUS_BADGE[statusData.status] || STATUS_BADGE.stopped;
  const activeEndpoint = `${(statusData.base_url || 'http://localhost:7878').replace(
    /\/+$/,
    ''
  )}/v1/audio/speech`;

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
            <Volume2 size={16} />
            <span>Voice Generation (Local TTS)</span>
            <span className="version-block">generate_speech</span>
          </div>
        </div>
        <div className="topbar-right">
          <a
            href={statusData.base_url || 'http://localhost:7878'}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-btn"
            style={{ textDecoration: 'none' }}
            title="Open Local TTS Studio WebUI"
          >
            <ExternalLink size={13} />
            <span>Open Local TTS WebUI</span>
          </a>
          <button type="button" className="topbar-btn" onClick={() => fetchStatus(false)}>
            <RefreshCw size={13} />
            <span>Refresh</span>
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
          {/* Control & Status Card */}
          <section className="tts-card">
            <div className="tts-card-header">
              <div className="tts-card-title-group">
                <div className="tts-card-title-row">
                  <Volume2 size={16} />
                  <h2>Local TTS Studio Engine</h2>
                  <span className="tts-status-pill">
                    <span className={`mcp-status-dot ${badge.dotClass}`} />
                    <span style={{ color: badge.color }}>{badge.label}</span>
                    {statusData.reachable && (
                      <span className="tts-reachable-tag">API Online</span>
                    )}
                  </span>
                </div>
                <p className="tts-card-subtitle">
                  Voice generation for the <code>generate_speech</code> agent tool is powered by{' '}
                  <strong>local-tts</strong> (<code>local-tts-studio</code>). Model selection,
                  voice cloning, and audio settings are configured directly inside the Local TTS
                  WebUI—Mythgram calls its OpenAI-compatible <code>/v1/audio/speech</code> endpoint
                  automatically.
                </p>
              </div>

              <div className="tts-card-actions">
                {!isBusyRunning ? (
                  <button
                    type="button"
                    className="btn-primary inline-center"
                    onClick={handleRunLocalTts}
                    disabled={starting}
                  >
                    {starting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                    Run Local TTS
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary inline-center tts-stop-btn"
                    onClick={handleStopLocalTts}
                    disabled={stopping}
                  >
                    <Square size={13} />
                    Stop Local TTS
                  </button>
                )}

                <a
                  href={statusData.base_url || 'http://localhost:7878'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-center"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={13} />
                  Configure Models in WebUI
                </a>
              </div>
            </div>

            {statusData.error && (
              <div className="mcp-alert" style={{ marginTop: 12 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Service notice:</strong> {statusData.error}
                </div>
              </div>
            )}

            {/* Custom Base URL Option */}
            <form className="tts-url-form" onSubmit={handleSaveBaseUrl}>
              <label className="field-label" htmlFor="local-tts-base-url">
                <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                Local TTS Custom Base URL (OpenAI-Compatible Server)
              </label>
              <div className="tts-url-input-row">
                <input
                  id="local-tts-base-url"
                  type="url"
                  className="input-field"
                  placeholder="http://localhost:7878"
                  value={baseUrlInput}
                  onChange={(e) => {
                    setBaseUrlInput(e.target.value);
                    setBaseUrlDirty(true);
                  }}
                />
                <button
                  type="submit"
                  className="btn-primary inline-center"
                  disabled={savingUrl}
                >
                  <Check size={13} />
                  {savingUrl ? 'Saving…' : 'Save Base URL'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleResetBaseUrl}
                  disabled={savingUrl}
                >
                  Reset Default
                </button>
              </div>
              <div className="tts-endpoint-preview">
                Active Speech API Endpoint: <code>{activeEndpoint}</code>
              </div>
            </form>
          </section>

          {/* Live Terminal Logs Card */}
          <section className="tts-card">
            <div className="tts-logs-header">
              <div className="tts-logs-title">
                <Terminal size={14} />
                <span>Terminal Output & Startup Logs</span>
                <span className="tts-cmd-pill">
                  pip install local-tts-studio &amp;&amp; local-tts
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary inline-center"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                onClick={handleClearLogs}
              >
                <Trash2 size={12} />
                Clear Logs
              </button>
            </div>

            <div className="tts-logs-console" role="log" aria-live="polite">
              {statusData.logs.length === 0 ? (
                <div className="tts-logs-empty">
                  No logs yet. Click <strong>Run Local TTS</strong> above to run{' '}
                  <code>pip install local-tts-studio</code> and start <code>local-tts</code>, or
                  follow the manual setup guide below.
                </div>
              ) : (
                statusData.logs.map((line, idx) => (
                  <div key={idx} className="tts-log-line">
                    {line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </section>

          {/* Manual Setup & Troubleshooting Guide */}
          <section className="tts-card">
            <div className="tts-guide-header">
              <BookOpen size={15} />
              <h3>Manual Installation &amp; API Configuration Guide</h3>
            </div>
            <p className="tts-card-subtitle" style={{ marginTop: 4 }}>
              If automatic installation fails due to Python environment permissions, virtual
              environments, or missing system packages, run the following commands manually in your
              terminal:
            </p>

            <div className="tts-steps-grid">
              <div className="tts-step-box">
                <div className="tts-step-head">
                  <span className="tts-step-num">Step 1</span>
                  <span className="tts-step-title">Install Local TTS Studio</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Copy command"
                    onClick={() => copyCommand('pip install local-tts-studio', 'step1')}
                  >
                    {copiedCmd === 'step1' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <pre className="tts-code-block">pip install local-tts-studio</pre>
              </div>

              <div className="tts-step-box">
                <div className="tts-step-head">
                  <span className="tts-step-num">Step 2</span>
                  <span className="tts-step-title">Start the Local TTS Server &amp; WebUI</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Copy command"
                    onClick={() => copyCommand('local-tts', 'step2')}
                  >
                    {copiedCmd === 'step2' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <pre className="tts-code-block">local-tts</pre>
              </div>

              <div className="tts-step-box">
                <div className="tts-step-head">
                  <span className="tts-step-num">Step 3</span>
                  <span className="tts-step-title">
                    Configure TTS Models &amp; Voices in Local TTS WebUI
                  </span>
                </div>
                <p className="tts-step-desc">
                  Open{' '}
                  <a
                    href={statusData.base_url || 'http://localhost:7878'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#93c5fd' }}
                  >
                    {statusData.base_url || 'http://localhost:7878'}
                  </a>{' '}
                  in your browser to select, download, and configure your active TTS model and
                  voice for API requests. If your server runs on another port or host, update the{' '}
                  <strong>Custom Base URL</strong> above.
                </p>
              </div>
            </div>

            <div className="tts-curl-box">
              <div className="tts-step-head">
                <span className="tts-step-title">
                  OpenAI-Compatible Speech Endpoint Verification (cURL)
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Copy cURL example"
                  onClick={() =>
                    copyCommand(
                      `curl ${activeEndpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"input":"Today is a wonderful day."}' \\\n  --output speech.wav`,
                      'curl'
                    )
                  }
                >
                  {copiedCmd === 'curl' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
              <pre className="tts-code-block">{`curl ${activeEndpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"input":"Today is a wonderful day."}' \\
  --output speech.wav

file speech.wav`}</pre>
            </div>
          </section>
        </div>
      </div>

      {toast && <div className="mcp-toast">{toast}</div>}
    </main>
  );
};
