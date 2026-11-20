# Mythgram — Autonomous General-Purpose AI Agent

Mythgram is an autonomous, general-purpose AI software engineering and operations agent that runs directly on your local computer with native function-calling tools, multi-session background execution, high-throughput SQLite + RAM buffered streaming, and a full interactive developer workspace UI.

## Live Service URLs
- **Frontend WebUI (Port 2000)**: `https://2000-iovj9hwgrjj00x5l56o09-c81df28e.sandbox.novita.ai` (or `http://localhost:2000`)
- **Backend API & SSE/WS Server (Port 1000)**: `https://1000-iovj9hwgrjj00x5l56o09-c81df28e.sandbox.novita.ai` (or `http://localhost:1000`)

## Architecture & Directory Structure

```
/home/user/webapp/
├── .mythgram/                     # Automatically created data directory
│   ├── mythgram.sqlite            # High-throughput SQLite WAL database
│   ├── uploads/                   # User file & folder attachments
│   ├── cache/                     # Cached metadata
│   └── logs/                      # Service logs
├── src/
│   ├── index.ts                   # Backend HTTP + SSE + WebSocket PTY server (Port 1000)
│   ├── datadir/index.ts           # .mythgram initialization & path management
│   ├── db/index.ts                # Native node:sqlite engine + 2-second RAM buffer flush loop
│   ├── session/index.ts           # 30-digit alphanumeric session IDs & multi-session manager
│   ├── worker/index.ts            # Local filesystem tree walker & interactive PTY terminal worker
│   ├── agents/
│   │   ├── agent.ts               # Unlimited autonomous ReAct loop & resilient streaming engine
│   │   └── prompt/
│   │       └── system-prompt.md   # System prompt with exact apply_patch specification
│   ├── providers/                 # 38 OpenAI-compatible provider modules + custom provider factory
│   │   ├── openrouter.ts, groq.ts, nvidia.ts, fireworks.ts, ollama_cloud.ts, local.ts, ...
│   │   └── index.ts
│   └── tools/                     # 15 Zod-schema native function-calling tools + unit tests
│       ├── file_write/
│       ├── file_read/
│       ├── file_list/
│       ├── read_directory/
│       ├── grep/
│       ├── astgrep/
│       ├── glob/
│       ├── str_replace/
│       ├── apply_patch/
│       ├── read_image/
│       ├── scan_qr_code/
│       ├── fetch_text_from_image/
│       ├── archive_files/
│       ├── extract_archive/
│       └── shall_tool/
├── webui/                         # React 19 + Vite 6 + TypeScript Frontend (Port 2000)
│   ├── vite.config.ts             # Vite proxy /api -> http://127.0.0.1:1000 (HTTP + WS)
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx       # Home prompt view -> redirects to /chat/session=<30digits>
│       │   └── ChatPage.tsx       # Live streaming chat, inline gray tool dropdowns, right panel
│       └── components/
│           ├── SettingsModal.tsx  # Models sidebar, 38 providers, custom provider, reasoning effort
│           ├── WorkspaceModal.tsx # Absolute path workspace selector & folder creator
│           ├── ComputerTab.tsx    # Read-only agent tool inspector (+ sub-tabs, diffs, previews)
│           ├── BrowserTab.tsx     # Embedded browser with Google search & external tab launcher
│           ├── FilesTab.tsx       # Live local workspace file tree & viewer
│           └── TerminalTab.tsx    # Interactive xterm.js terminal connected to local computer
├── start.sh                       # Starts both backend (1000) and frontend (2000)
└── stop.sh                        # Stops both backend (1000) and frontend (2000)
```

## Starting & Stopping
```bash
# Start both backend (port 1000) and frontend (port 2000)
./start.sh

# Stop both services
./stop.sh
```
