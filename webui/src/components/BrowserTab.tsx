import React, { useState, useEffect } from 'react';
import { Globe, ExternalLink, RotateCw, Search } from 'lucide-react';

interface BrowserTabProps {
  embeddedUrl?: string | null;
}

export const BrowserTab: React.FC<BrowserTabProps> = ({ embeddedUrl }) => {
  const defaultUrl = 'https://www.google.com/webhp?igu=1';
  const [addressInput, setAddressInput] = useState(embeddedUrl || defaultUrl);
  const [currentUrl, setCurrentUrl] = useState(embeddedUrl || defaultUrl);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (embeddedUrl && embeddedUrl.trim()) {
      setAddressInput(embeddedUrl);
      setCurrentUrl(embeddedUrl);
      setIframeKey((k) => k + 1);
    }
  }, [embeddedUrl]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addressInput.trim();
    if (!raw) return;

    let target = raw;
    if (!/^https?:\/\//i.test(raw)) {
      if (
        raw.startsWith('localhost') ||
        raw.startsWith('127.0.0.1') ||
        raw.startsWith('0.0.0.0')
      ) {
        target = `http://${raw}`;
      } else if (raw.includes('.') && !raw.includes(' ')) {
        target = `https://${raw}`;
      } else {
        target = `https://www.google.com/search?igu=1&q=${encodeURIComponent(raw)}`;
      }
    }
    setCurrentUrl(target);
    setAddressInput(target);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Browser Address Bar */}
      <form
        onSubmit={handleNavigate}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid #1f1f1f',
          backgroundColor: '#000000',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setAddressInput(defaultUrl);
            setCurrentUrl(defaultUrl);
          }}
          title="Google Search Home"
        >
          <Globe size={14} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => setIframeKey((k) => k + 1)}
          title="Reload embedded page"
        >
          <RotateCw size={13} />
        </button>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#000000',
            border: '1px solid #262626',
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <Search size={12} color="#7d7d7d" />
          <input
            className="browser-address-input"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Search Google or enter URL (supports localhost)..."
          />
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
          title="Open in real browser tab"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}
        >
          <ExternalLink size={12} />
          Open
        </button>
      </form>

      {/* Embedded Browser Viewport */}
      <div style={{ flex: 1, backgroundColor: '#ededed', position: 'relative' }}>
        <iframe
          key={iframeKey}
          src={currentUrl}
          title="Mythgram Embedded Browser"
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
};
