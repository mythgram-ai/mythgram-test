import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
  workspace: string;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({ workspace }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      theme: {
        background: '#000000',
        foreground: '#ededed',
        cursor: '#ededed',
        black: '#0a0a0a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#ededed',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ededed',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/terminal/ws?cwd=${encodeURIComponent(
      workspace
    )}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      term.writeln('\x1b[90mMythgram Local Interactive Terminal Connected\x1b[0m');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' && typeof msg.data === 'string') {
          term.write(msg.data);
        }
      } catch {
        term.write(String(event.data));
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [workspace]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        backgroundColor: '#000000',
        padding: 8,
      }}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};
