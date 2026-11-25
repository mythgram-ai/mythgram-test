import React, { useState } from 'react';
import { ArrowUpRight, Sparkles, X } from 'lucide-react';

const DISMISS_KEY = 'mythgram:zapier-notice-dismissed';

/**
 * Recommendation shown on the Connectors and MCP pages. The logo is the official
 * Zapier favicon fetched from zapier.com and served from /zapier-logo.ico.
 */
export const ZapierNotice: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore storage errors
    }
  };

  return (
    <aside className="zapier-notice" aria-label="Zapier MCP recommendation">
      <img
        className="zapier-notice-logo"
        src="/zapier-logo.ico"
        alt="Zapier"
        width={34}
        height={34}
      />
      <div className="zapier-notice-body">
        <div className="zapier-notice-title">
          <Sparkles size={13} />
          <span>Skip the one-by-one setup: connect 9,000+ apps with Zapier MCP</span>
        </div>
        <p className="zapier-notice-text">
          Instead of wiring each integration yourself, add Zapier MCP as a single remote MCP
          server and let Mythgram work across Gmail, Slack, Notion, HubSpot, Sheets, and
          thousands more with one authorization.
        </p>
        <div className="zapier-notice-actions">
          <a
            className="zapier-notice-link"
            href="https://zapier.com/mcp"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore Zapier MCP
            <ArrowUpRight size={12} />
          </a>
          <a
            className="zapier-notice-link is-muted"
            href="https://docs.zapier.com/mcp/home"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the docs
            <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
      <button
        type="button"
        className="icon-btn zapier-notice-close"
        aria-label="Dismiss Zapier recommendation"
        title="Dismiss"
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </aside>
  );
};
