import React, { useEffect, useState } from 'react';
import {
  Globe,
  Search,
  Image as ImageIcon,
  Check,
  ExternalLink,
  Loader2,
  KeyRound,
  Flame,
  Server,
} from 'lucide-react';

interface ProviderInfo {
  id: string;
  name: string;
  requires_api_key: boolean;
  supports_images: boolean;
  docs_url: string;
  key_placeholder: string;
}

interface KeyState {
  configured: boolean;
  masked: string;
}

interface WebSearchSettingsState {
  provider: string;
  scraper_provider: string;
  api_keys: Record<string, KeyState>;
  firecrawl: KeyState;
  providers: ProviderInfo[];
}

const DEFAULT_STATE: WebSearchSettingsState = {
  provider: 'duckduckgo',
  scraper_provider: 'builtin',
  api_keys: {},
  firecrawl: { configured: false, masked: '' },
  providers: [],
};

/**
 * Settings → Web Search pane. Loaded on demand so the settings modal stays small.
 */
export const WebSearchSettings: React.FC = () => {
  const [state, setState] = useState<WebSearchSettingsState>(DEFAULT_STATE);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [firecrawlKey, setFirecrawlKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [testKind, setTestKind] = useState<'web' | 'image'>('web');
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState('');

  const applySettings = (data: any) => {
    setState({
      provider: data.provider || 'duckduckgo',
      scraper_provider: data.scraper_provider || 'builtin',
      api_keys: data.api_keys || {},
      firecrawl: data.firecrawl || { configured: false, masked: '' },
      providers: Array.isArray(data.providers) ? data.providers : [],
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/web-search/settings');
        const data = await res.json();
        if (data.ok) applySettings(data);
      } catch {
        setStatus('Could not load web search settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 4000);
  };

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/web-search/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        applySettings(data);
        flash('Saved.');
      } else {
        setStatus(data.error || 'Failed to save web search settings.');
      }
    } catch (err: any) {
      setStatus(err?.message || 'Failed to save web search settings.');
    } finally {
      setSaving(false);
    }
  };

  const selectProvider = (provider: string) => {
    setState((prev) => ({ ...prev, provider }));
    void save({ provider });
  };

  const selectScraper = (scraper_provider: string) => {
    setState((prev) => ({ ...prev, scraper_provider }));
    void save({ scraper_provider });
  };

  const saveKey = async (provider: string) => {
    const value = (keyInputs[provider] || '').trim();
    if (!value) return;
    await save({ api_keys: { [provider]: value } });
    setKeyInputs((prev) => ({ ...prev, [provider]: '' }));
  };

  const clearKey = async (provider: string) => {
    await save({ api_keys: { [provider]: null } });
  };

  const saveFirecrawlKey = async () => {
    const value = firecrawlKey.trim();
    if (!value) return;
    await save({ firecrawl_api_key: value });
    setFirecrawlKey('');
  };

  const runTest = async () => {
    setTesting(true);
    setTestOutput('');
    try {
      const res = await fetch('/api/web-search/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: testKind, query: 'mythgram ai agent' }),
      });
      const data = await res.json();
      if (!data.ok) {
        setTestOutput(data.error || 'Search test failed.');
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const first = results
        .slice(0, 3)
        .map((item: any) => item.title || item.image_url || '')
        .filter(Boolean)
        .join(' • ');
      const engine = data.image_provider || data.engine || data.provider;
      setTestOutput(
        `${results.length} result(s) via ${engine}.${data.note ? ` ${data.note}` : ''}${
          first ? ` ${first}` : ''
        }`
      );
    } catch (err: any) {
      setTestOutput(err?.message || 'Search test failed.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-pane-loading">
        <Loader2 size={18} className="spin" />
        <span>Loading web search settings…</span>
      </div>
    );
  }

  const providers = state.providers.length
    ? state.providers
    : [
        { id: 'duckduckgo', name: 'DuckDuckGo', requires_api_key: false, supports_images: true, docs_url: 'https://duckduckgo.com/', key_placeholder: '' },
        { id: 'tavily', name: 'Tavily', requires_api_key: true, supports_images: true, docs_url: 'https://docs.tavily.com/', key_placeholder: 'tvly-...' },
        { id: 'exa', name: 'Exa', requires_api_key: true, supports_images: false, docs_url: 'https://docs.exa.ai/', key_placeholder: 'exa api key' },
        { id: 'serpapi', name: 'SerpAPI', requires_api_key: true, supports_images: true, docs_url: 'https://serpapi.com/', key_placeholder: 'serpapi api key' },
      ];

  return (
    <div className="web-search-pane">
      <div className="web-search-section">
        <div className="web-search-section-head">
          <Search size={15} />
          <div>
            <h3>Web search provider</h3>
            <p>
              Used by the <code>web_search</code> and <code>image_search</code> tools for both the
              main agent and sub-agents. DuckDuckGo works with no API key.
            </p>
          </div>
        </div>

        <div className="web-search-provider-grid">
          {providers.map((provider) => {
            const keyState = state.api_keys[provider.id] || { configured: false, masked: '' };
            const active = state.provider === provider.id;
            return (
              <div
                key={provider.id}
                className={`web-search-provider-card ${active ? 'is-active' : ''}`}
              >
                <button
                  type="button"
                  className="web-search-provider-head"
                  onClick={() => selectProvider(provider.id)}
                >
                  <span className="web-search-provider-name">
                    {active && <Check size={13} />}
                    {provider.name}
                  </span>
                  <span className="web-search-provider-meta">
                    {provider.requires_api_key ? 'API key' : 'No key'}
                    {provider.supports_images ? ' • images' : ' • text only'}
                  </span>
                </button>

                {!provider.requires_api_key && (
                  <span className="web-search-provider-note">
                    No key needed. Queries DuckDuckGo's HTML endpoints directly, and falls back to Bing when DuckDuckGo serves a bot challenge.
                  </span>
                )}

                {provider.requires_api_key && (
                  <div className="web-search-key-row">
                    <div className="web-search-key-input">
                      <KeyRound size={12} />
                      <input
                        type="password"
                        value={keyInputs[provider.id] || ''}
                        placeholder={
                          keyState.configured
                            ? `Saved ${keyState.masked}`
                            : provider.key_placeholder || 'API key'
                        }
                        onChange={(event) =>
                          setKeyInputs((prev) => ({ ...prev, [provider.id]: event.target.value }))
                        }
                        spellCheck={false}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary web-search-key-save"
                      disabled={saving || !(keyInputs[provider.id] || '').trim()}
                      onClick={() => saveKey(provider.id)}
                    >
                      Save
                    </button>
                    {keyState.configured && (
                      <button
                        type="button"
                        className="btn-secondary web-search-key-clear"
                        onClick={() => clearKey(provider.id)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <a
                  className="web-search-docs-link"
                  href={provider.docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  API docs
                  <ExternalLink size={11} />
                </a>
              </div>
            );
          })}
        </div>
      </div>

      <div className="web-search-section">
        <div className="web-search-section-head">
          <Globe size={15} />
          <div>
            <h3>URL scraper</h3>
            <p>
              Powers <code>fatch_web_urls</code> and website imports on the Knowledge page.
            </p>
          </div>
        </div>

        <div className="web-search-scraper-options">
          <button
            type="button"
            className={`web-search-scraper-card ${state.scraper_provider === 'builtin' ? 'is-active' : ''}`}
            onClick={() => selectScraper('builtin')}
          >
            <Server size={15} />
            <span>
              <strong>Built-in scraper</strong>
              <em>Runs locally, no API key, default.</em>
            </span>
          </button>
          <button
            type="button"
            className={`web-search-scraper-card ${state.scraper_provider === 'firecrawl' ? 'is-active' : ''}`}
            onClick={() => selectScraper('firecrawl')}
          >
            <Flame size={15} />
            <span>
              <strong>Firecrawl</strong>
              <em>Hosted scraping with JavaScript rendering.</em>
            </span>
          </button>
        </div>

        <div className="web-search-firecrawl">
          <div className="web-search-key-row">
            <div className="web-search-key-input">
              <KeyRound size={12} />
              <input
                type="password"
                value={firecrawlKey}
                placeholder={
                  state.firecrawl.configured
                    ? `Saved ${state.firecrawl.masked}`
                    : 'fc-... Firecrawl API key'
                }
                onChange={(event) => setFirecrawlKey(event.target.value)}
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              className="btn-secondary web-search-key-save"
              disabled={saving || !firecrawlKey.trim()}
              onClick={saveFirecrawlKey}
            >
              Save
            </button>
            {state.firecrawl.configured && (
              <button
                type="button"
                className="btn-secondary web-search-key-clear"
                onClick={() => save({ firecrawl_api_key: null })}
              >
                Clear
              </button>
            )}
          </div>
          <a
            className="web-search-docs-link"
            href="https://docs.firecrawl.dev/api-reference/endpoint/scrape"
            target="_blank"
            rel="noopener noreferrer"
          >
            Firecrawl API docs
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      <div className="web-search-section">
        <div className="web-search-section-head">
          {testKind === 'web' ? <Search size={15} /> : <ImageIcon size={15} />}
          <div>
            <h3>Test the configuration</h3>
            <p>Runs a small live query with the saved provider.</p>
          </div>
        </div>
        <div className="web-search-test-row">
          <select
            className="input-field"
            value={testKind}
            onChange={(event) => setTestKind(event.target.value as 'web' | 'image')}
          >
            <option value="web">Web search</option>
            <option value="image">Image search</option>
          </select>
          <button type="button" className="btn-primary inline-center" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
            Run test
          </button>
        </div>
        {testOutput && <div className="web-search-test-output">{testOutput}</div>}
      </div>

      {status && <div className="web-search-status">{status}</div>}
    </div>
  );
};
