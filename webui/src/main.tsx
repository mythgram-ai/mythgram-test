import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

function dismissBootShell() {
  const shell = document.getElementById('boot-shell');
  if (!shell) return;
  shell.classList.add('is-hidden');
  window.setTimeout(() => shell.remove(), 300);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App onReady={dismissBootShell} />
  </React.StrictMode>
);
