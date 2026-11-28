import React, { useEffect } from 'react';
import { Activity, Cpu, X } from 'lucide-react';

export interface ContextDashboardProps {
  usedTokens: number;
  contextWindow: number;
  provider: string;
  model: string;
  messageCount: number;
  toolCallCount: number;
  isRunning: boolean;
  onClose: () => void;
}

function compact(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function exact(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

function statusFor(pct: number): { label: string; tone: 'ok' | 'warn' | 'hot' | 'full' } {
  if (pct >= 95) return { label: 'At the limit', tone: 'full' };
  if (pct >= 80) return { label: 'Near the limit', tone: 'hot' };
  if (pct >= 50) return { label: 'Filling up', tone: 'warn' };
  return { label: 'Healthy', tone: 'ok' };
}

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ContextDashboard: React.FC<ContextDashboardProps> = ({
  usedTokens,
  contextWindow,
  provider,
  model,
  messageCount,
  toolCallCount,
  isRunning,
  onClose,
}) => {
  const limit = contextWindow > 0 ? contextWindow : 0;
  const used = Math.max(0, usedTokens || 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  const status = statusFor(pct);
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="ctx-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ctx-modal-head">
          <div className="ctx-modal-title">
            <Activity size={15} />
            <div>
              <div className="ctx-modal-title-main">Context Window</div>
              <div className="ctx-modal-title-sub">
                Live token usage for this session{isRunning ? ' · running' : ''}
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close context dashboard">
            <X size={15} />
          </button>
        </header>

        <div className="ctx-hero">
          <div className="ctx-ring">
            <svg viewBox="0 0 110 110" width="132" height="132" aria-hidden="true">
              <circle cx="55" cy="55" r={RADIUS} fill="none" stroke="#1f1f1f" strokeWidth="7" />
              <circle
                cx="55"
                cy="55"
                r={RADIUS}
                fill="none"
                stroke="#ededed"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 55 55)"
                className="ctx-ring-progress"
              />
            </svg>
            <div className="ctx-ring-center">
              <span className="ctx-pct">
                {Number.isInteger(pct) ? pct : pct.toFixed(1)}%
              </span>
              <span className="ctx-pct-label">used</span>
            </div>
          </div>

          <div className="ctx-hero-side">
            <span className={`ctx-status is-${status.tone}`}>
              <span className="ctx-status-dot" />
              {status.label}
            </span>
            <div className="ctx-tokens">
              <span className="ctx-tokens-used">{exact(used)}</span>
              <span className="ctx-tokens-limit">/ {exact(limit)} tokens</span>
            </div>
            <div className="ctx-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="ctx-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="ctx-hero-meta">
              <Cpu size={12} />
              <span className="ctx-model-name">{model || 'unknown model'}</span>
              {provider && <span className="ctx-provider-name">{provider}</span>}
            </div>
          </div>
        </div>

        <div className="ctx-grid">
          <div className="ctx-card">
            <span className="ctx-card-label">Remaining</span>
            <span className="ctx-card-value">{compact(remaining)}</span>
            <span className="ctx-card-sub">{exact(remaining)} tokens free</span>
          </div>
          <div className="ctx-card">
            <span className="ctx-card-label">Context limit</span>
            <span className="ctx-card-value">{compact(limit)}</span>
            <span className="ctx-card-sub">from model metadata</span>
          </div>
          <div className="ctx-card">
            <span className="ctx-card-label">Messages</span>
            <span className="ctx-card-value">{exact(messageCount)}</span>
            <span className="ctx-card-sub">in this session</span>
          </div>
          <div className="ctx-card">
            <span className="ctx-card-label">Tool calls</span>
            <span className="ctx-card-value">{exact(toolCallCount)}</span>
            <span className="ctx-card-sub">recorded activities</span>
          </div>
        </div>

        <footer className="ctx-foot">
          Limit is resolved from the model's metadata, so a 64K model reports 64K and a 1M model
          reports 1M. A manual context limit set in Settings → Models overrides it.
        </footer>
      </div>
    </div>
  );
};
