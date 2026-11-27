# Mythgram — Autonomous General-Purpose AI Agent

Mythgram is an autonomous, general-purpose AI software engineering and operations agent that runs directly on your local computer with 35 native function-calling tools, multi-session background execution, sub-agent orchestration, artifacts & skills management, interactive slide decks, high-throughput SQLite + RAM buffered streaming, and a responsive developer workspace UI.

## Live Service URLs
- **Frontend WebUI (Port 2000)**: `https://2000-izglh5qn65qt0ga0q9pgl-d0b9e1e2.sandbox.novita.ai` (or `http://localhost:2000`)
- **Backend API & SSE/WS Server (Port 1000)**: `https://1000-izglh5qn65qt0ga0q9pgl-d0b9e1e2.sandbox.novita.ai` (or `http://localhost:1000`)

## Completed Features & Systems
1. **35 Native Function-Calling Tools (Zod Schemas)**:
   - Core Workspace Tools (15): `file_write`, `file_read`, `file_list`, `read_directory`, `grep`, `astgrep`, `glob`, `str_replace`, `apply_patch`, `read_image`, `scan_qr_code`, `fetch_text_from_image`, `archive_files`, `extract_archive`, `shall_tool`.
   - New Extended Tools (20): `wait`, `save_artifacts`, `list_artifacts`, `show_artifact_to_user`, `attach_files`, `ask_for_something`, `ask_question_to_user`, `embed_url`, `read_todos`, `todo_write`, `submit_plan`, `create_sub_agent`, `call_sub_agent`, `list_sub_agents`, `create_skill`, `list_skills`, `manage_slides`, `present_slides`, `organize_slides`, `lsp`.
2. **Artifacts System (`src/artifacts`, `.mythgram/artifacts/artifacts.json`)**:
   - Saves reusable artifacts on disk inside `.mythgram/artifacts` with automatic recreation if deleted.
   - Dedicated lazy-loaded **Artifacts Page** (`/artifacts`) and **Artifact Tab** inside Chat Page (showing rendered content).
3. **Sub-Agent System (`src/agents/sub-agent.ts`, `src/sub-agents`, `.mythgram/sub-agents/sub-agents.json`)**:
   - 10 built-in default sub-agents (`code-architect`, `frontend-specialist`, `backend-engineer`, `bug-hunter`, `test-runner`, `security-auditor`, `docs-writer`, `data-analyst`, `refactoring-expert`, `slide-designer`) protected from deletion.
   - Supports single or parallel multi-sub-agent execution (`wait_for_output: true | false`) using the user's active LLM settings, 2-second RAM-to-SQLite buffering, automatic abort propagation, and restricted tool filtering.
   - Dedicated lazy-loaded **Sub-Agents Page** (`/sub-agents`) supporting single or batch creation, plus a live streaming **Sub-Agent Tab** in Chat Page.
4. **Custom Agents System (`src/custom-agents`, `.mythgram/custom-agents`)**:
   - Custom agents are the main agent runtime with modifications: they reuse the same autonomous ReAct loop and full tool system (no sub-agent tool restrictions).
   - Each custom agent has a name, logo (uploaded image or default logo), description, system prompt (written or uploaded from a file), and a user-selected toolset.
   - Activate any custom agent or the default agent at any time; the change applies to the next run without a server restart.
   - Dedicated lazy-loaded **Custom Agents Page** (`/custom-agents`) plus a sidebar entry and active-agent indicator on the Home Page.
5. **Skills System (`src/skills`, `.mythgram/skills/skills.json`)**:
   - 2 built-in default skills (`fullstack-web-architect`, `automated-code-auditor`) plus custom skills created manually or via `create_skill`.
   - Dedicated lazy-loaded **Skills Page** (`/skills`) with `SKILL.md` editor and subfolder creation.
6. **Slides System (`slide_projects` in SQLite)**:
   - Organizes, manages, and presents 16:9 HTML slide decks with export/download support for **PNG, JPEG, SVG, PDF, PPTX, and HTML**; each deck downloads as a single ZIP archive in the selected format.
   - Dedicated lazy-loaded **Slides Page** (`/slides`) and **Slides Tab** in Chat Page.

7. **Automation / Cron Schedules (`src/cron`, `.mythgram/cron`)**:
   - **Normal schedules**: one-time, recurring interval (every X minutes/hours/days), custom cron expressions (5 or 6 fields), daily, weekly with weekday selection, monthly with day-of-month selection, timezone, start date, end date, missed-run grace, and skip/catch-up behaviour.
   - **Webhook schedules**: a unique signed endpoint per schedule with HMAC-SHA256 or token auth, event-type matching (`issues.opened`, `pull_request.*`), payload filters (equals, contains, regex, numeric comparisons, exists, comma lists), dedupe, debounce, cooldown, hourly/daily rate limits, payload-size limits, IP allowlists (CIDR), replay protection, prompt templates, and new-chat or continue-chat modes.
   - Every run creates a normal chat session (shown in the sidebar) using the default or a selected custom agent.
   - REST API: `GET/POST /api/automation`, `PATCH/DELETE /api/automation/:id`, `POST /api/automation/:id/{run,stop,duplicate,pause,resume,test,rotate-secret}`, `GET /api/automation/:id/runs`, `GET /api/automation/runs/:runId`, `GET /api/automation/timezones`, `POST /api/automation/validate`, `POST|GET /api/cron/webhook/:token`.
   - Dedicated lazy-loaded **Automation Page** (`/automation`) with cards, run-now, stop, edit, duplicate, pause/resume, execution history, next/previous run times, status, webhook URL copy, secret rotation, and test events.

8. **Self-Healing Daemon (`src/deamon`)**:
   - Supervises the backend and WebUI with health checks, exponential backoff, restart-storm protection, stale-listener recovery, log rotation, atomic state/heartbeat files, crash guards, and an optional outer watchdog.
   - Installs as a systemd service, launchd agent, or cron `@reboot` + per-minute watchdog so Mythgram survives terminal close, SSH disconnect, logout, crashes, hangs, power loss, and reboot.

9. **LSP Code Intelligence (`src/lsp`, `lsp` tool)**:
   - Native JSON-RPC 2.0 Language Server Protocol engine over stdio with `Content-Length` framing, per-project server lifecycle, document synchronization, request cancellation, and idle shutdown.
   - Supports `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, and `outgoingCalls`.
   - Ships a built-in registry for TypeScript, Python, Go, Rust, C/C++, Ruby, Lua, PHP, shell, YAML, JSON, HTML, CSS, Kotlin, Swift, Zig, and C# servers. Add or override servers in `.mythgram/lsp.json` or via `MYTHGRAM_LSP_SERVERS`.
   - `lsp` is available to the main agent and to sub-agents.

## Architecture & Directory Structure

```
/home/user/webapp/
├── .mythgram/                     # Automatically created & self-healing data directory
│   ├── mythgram.sqlite            # High-throughput SQLite WAL database (sessions, messages, slides, todos, sub_agent_runs)
│   ├── artifacts/                 # Stored artifact files + artifacts.json
│   ├── sub-agents/                # Custom sub-agent JSON files + sub-agents.json + outputs/
│   ├── custom-agents/             # Custom agent JSON store + logos/ for uploaded agent logos
│   ├── skills/                    # Skill directories (SKILL.md + subfolders) + skills.json
│   ├── uploads/                   # User file & folder attachments
│   ├── cache/                     # Cached metadata
│   ├── cron/                      # Automation schedules + run history (schedules.json, runs.json)
│   ├── deamon/                    # Daemon pid/lock/state/heartbeat files
│   └── logs/                      # Service logs
├── src/
│   ├── index.ts                   # Backend HTTP + SSE + WebSocket PTY server (Port 1000)
│   ├── datadir/index.ts           # .mythgram initialization & self-healing integrity checks
│   ├── db/index.ts                # Native node:sqlite engine + 2-second RAM buffer flush loop
│   ├── artifacts/index.ts         # Artifacts store manager (.mythgram/artifacts)
│   ├── sub-agents/index.ts        # 10 default sub-agents + custom sub-agent store (.mythgram/sub-agents)
│   ├── custom-agents/index.ts     # Custom main-runtime agent store (.mythgram/custom-agents) + active agent
│   ├── skills/index.ts            # 2 default skills + custom skill store (.mythgram/skills)
│   ├── agents/
│   │   ├── agent.ts               # Main autonomous ReAct loop & resilient streaming engine
│   │   ├── sub-agent.ts           # Sub-agent execution engine with live streaming & abort cascade
│   │   └── prompt/
│   │       └── system-prompt.md   # System prompt with instructions for all 35 tools & systems
│   ├── lsp/                       # Language Server Protocol engine (JSON-RPC, clients, server registry)
│   ├── cron/                      # Schedules, cron math, webhook verification, execution engine
│   ├── deamon/                    # Self-healing process supervisor, watchdog, service installer
│   └── tools/                     # 35 Zod-schema native function-calling tools + unit tests
└── webui/                         # React 19 + Vite 6 + TypeScript Frontend (Port 2000)
    └── src/
        ├── pages/                 # Lazy-loaded pages (HomePage, ChatPage, ArtifactsPage, SubAgentsPage, CustomAgentsPage, SkillsPage, SlidesPage, AutomationPage)
        └── components/            # Right-panel tabs (ComputerTab, BrowserTab, ArtifactTab, SubAgentTab, SlidesTab, FilesTab, TerminalTab)
```

## Starting & Stopping
```bash
# Start both backend (port 1000) and frontend (port 2000)
./start.sh

# Stop both services
./stop.sh
```

---

## Automation / Cron Schedules

Open **Automation** in the sidebar or visit `/automation`.

1. Click **New schedule**.
2. Enter a name, description, and the prompt that the agent should run.
3. Choose the default agent or any custom agent, an optional workspace, and an optional timeout.
4. Pick a method:
   - **Normal schedule** — one-time, interval, cron, daily, weekly, or monthly. Set timezone, start/end dates, weekdays or month days, and whether missed runs should be skipped or caught up.
   - **Webhook trigger** — copy the generated endpoint into GitHub, Stripe, Linear, Slack, Jira, or any service. Choose HMAC signature, token, or open auth, then add event types and payload filters. Advanced controls include dedupe, debounce, cooldown, hourly/daily caps, IP allowlists, replay tolerance, and prompt templates.
5. Save. Webhook schedules show the URL and signing secret once; rotate the secret if it is lost.

Each run creates a normal chat session, so scheduled chats appear in the sidebar and can be reopened at any time. The card menu provides **Run now**, **Stop**, **Edit**, **Duplicate**, **Pause/Resume**, **History**, **Copy webhook URL**, **Send test event**, **Rotate secret**, and **Delete**.

### Webhook API

Every webhook schedule exposes one endpoint:

```
POST /api/cron/webhook/<token>
```

The token is generated when the schedule is created and can be rotated from the card menu. Choose one auth mode:

| Mode | How to authenticate |
| --- | --- |
| `signature` (default) | `X-Signature-256: sha256=<hex HMAC-SHA256 of the raw body>` |
| `token` | `X-Webhook-Token: <token>` or `Authorization: Bearer <token>` |
| `none` | No header. Pair it with an IP allowlist. |

Example with a token:

```bash
curl -X POST "http://localhost:1000/api/cron/webhook/<token>" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: <token>" \
  -d '{"type":"issues.opened","issue":{"number":42,"labels":[{"name":"bug"}]}}'
```

The event type is read from `event_type_path` (default `type`). Event patterns support exact names and wildcards such as `issues.*` or `pull_request.opened`. Payload filters use a path plus an operator: `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `in`, `regex`, `gt`, `gte`, `lt`, `lte`, `exists`, `not_exists`. Combine filters with all/any logic.

Responses:

| Status | Meaning |
| --- | --- |
| `202` | Accepted. The body says `queued` or `ignored` when debounce/dedupe/event filters skip a run. |
| `401` | Missing or invalid signature/token. |
| `403` | Source IP is outside the allowlist. |
| `409` | The schedule is paused. |
| `429` | Cooldown or hourly/daily rate limit reached. |

Advanced controls include dedupe by payload path, debounce batching, cooldown, hourly/daily run caps, payload size limits, CIDR allowlists, replay-window timestamps, prompt templates, and new-chat or continue-chat session modes.

---

## Self-Healing Daemon

The daemon in `src/deamon` keeps Mythgram running without a terminal attached. It supervises both the backend (`src/index.ts`, port 1000) and the WebUI (`webui`, port 2000), checks their health, and restarts them when they crash, hang, or stop responding.

The installed service is what brings Mythgram back after a reboot or power loss. No user-space process can keep running while the machine is powered off; the service starts it again as soon as the operating system boots.

If `daemon:install` reports that no supported service manager is available, run `npm run daemon:start -- --watchdog` and register `npm run daemon:ensure` with your own supervisor or cron. `ensure` is idempotent: it starts the daemon only when it is not already healthy.

### Quick start

```bash
# Install dependencies once
npm install
npm install --prefix webui

# Start the daemon in the background (backend + WebUI)
npm run daemon:start

# Check status and health
npm run daemon:status

# Follow logs
npm run daemon:logs -- --follow

# Stop everything
npm run daemon:stop
```

Open the WebUI at `http://localhost:2000` and the API at `http://localhost:1000`.

### Run it at boot (survives terminal close, logout, crash, power loss, reboot)

Install Mythgram as a real service. The installer picks systemd on Linux, launchd on macOS, and falls back to cron:

```bash
# Linux: systemd system service (run with sudo) or user service
sudo npm run daemon:install
npm run daemon:install -- --user

# macOS: launchd LaunchAgent
npm run daemon:install

# Force a manager, or supervise only the backend
npm run daemon:install -- --manager cron
npm run daemon:install -- --no-frontend
```

Remove the service with:

```bash
npm run daemon:uninstall
```

The generated unit is self-healing by itself:

- `Restart=always` + `RestartSec=3` (systemd) or `KeepAlive=true` (launchd).
- `StartLimitIntervalSec=0` so systemd never gives up on repeated failures.
- `KillMode=control-group` so child processes are cleaned up with the service.
- `loginctl enable-linger` for user services so they start at boot without a login.
- The cron fallback installs `@reboot` plus a per-minute `ensure` entry.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run daemon:start` | Start in the background (detached). |
| `npm run daemon:start -- --watchdog` | Start with an outer watchdog that restarts the daemon itself. |
| `npm run daemon:start -- --no-frontend` | Supervise only the backend. |
| `npm run daemon:stop` | Stop the daemon and every supervised process. |
| `npm run daemon:restart` | Stop, then start again. |
| `npm run daemon:status` | Show daemon, watchdog, service, process, health, and recent events. Add `-- --json` for JSON. |
| `npm run daemon:logs -- --follow` | Tail the daemon log. Use `-- --file backend` or `-- --file frontend`. |
| `npm run daemon:ensure` | Start only if not already running (used by cron). |
| `npm run daemon:doctor` | Diagnose Node, dependencies, ports, health, pid files, service manager, disk space. |
| `npm run daemon:install` | Install systemd / launchd / cron service. |
| `npm run daemon:uninstall` | Remove the installed service. |

You can also use the binary directly:

```bash
npx mythgram-daemon status
npx mythgram-daemon start --watchdog
npx mythgram-daemon logs --follow
```

### What it heals

The supervisor is deliberately layered so one failure does not take the agent down:

| Failure | Recovery |
| --- | --- |
| Backend or WebUI exits | Restarted with exponential backoff (1s → 30s). |
| Process hangs / event loop stalls | HTTP health checks fail 3 times → process is restarted. |
| Port left behind by a stale process | The stale PID from `.mythgram/backend.pid` or `frontend.pid` is stopped, then the port is re-checked. |
| Restart loop / crash storm | After 12 restarts in 60s the delay escalates to a 60s cooldown. |
| Log file grows without limit | Rotated at 5 MB, 5 files kept. |
| Daemon itself crashes | systemd `Restart=always`, launchd `KeepAlive`, cron per-minute `ensure`, or the optional `--watchdog` outer process. |
| Daemon hangs | Watchdog compares the heartbeat file timestamp and restarts the child when it is stale. |
| Terminal closed / SSH disconnected / logout | Service manager or detached background process keeps running. |
| Reboot / power loss | systemd/launchd `RunAtLoad`/`WantedBy`, or cron `@reboot`. |
| Uncaught exception / unhandled rejection | Logged, supervised processes restarted; after 10 exceptions in 60s the daemon exits so the service manager restarts it cleanly. |
| WebUI missing dependencies | `daemon:doctor` reports it; `start` warns; use `--no-frontend` if the WebUI is not needed. |
| Disk or data directory problems | Atomic state/heartbeat writes, log rotation, and `daemon:doctor` disk checks. |

### Files and state

```text
.mythgram/
├── deamon/
│   ├── daemon.pid          # daemon process id
│   ├── watchdog.pid        # watchdog process id (when enabled)
│   ├── daemon.lock         # single-instance lock
│   ├── state.json          # process state, restart counts, recent events
│   └── heartbeat.json      # heartbeat used by the watchdog
└── logs/
    ├── deamon.log          # daemon log
    ├── backend.log         # backend child log
    └── frontend.log        # WebUI child log
```

### Configuration

All settings are environment variables, so they work with systemd, launchd, cron, or a plain shell:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MYTHGRAM_PROJECT_ROOT` / `MYTHGRAM_START_DIR` | auto-detected | Project root. |
| `PORT` / `MYTHGRAM_DEAMON_BACKEND_PORT` | `1000` | Backend port. |
| `MYTHGRAM_DEAMON_FRONTEND_PORT` | `2000` | WebUI port. |
| `MYTHGRAM_DEAMON_FRONTEND` | `1` | Set to `0` to supervise only the backend. |
| `MYTHGRAM_DEAMON_WATCHDOG` | `0` | Set to `1` to run the outer watchdog. |
| `MYTHGRAM_DEAMON_HEALTH_INTERVAL_MS` | `15000` | Health-check interval. |
| `MYTHGRAM_DEAMON_HEALTH_TIMEOUT_MS` | `6000` | Health-check timeout. |
| `MYTHGRAM_DEAMON_HEALTH_FAILURES` | `3` | Failures before restart. |
| `MYTHGRAM_DEAMON_RESTART_BASE_MS` | `1000` | First restart delay. |
| `MYTHGRAM_DEAMON_RESTART_MAX_MS` | `30000` | Maximum restart delay. |
| `MYTHGRAM_DEAMON_MAX_RESTARTS` | `12` | Restarts allowed per window before cooldown. |
| `MYTHGRAM_DEAMON_RESTART_WINDOW_MS` | `60000` | Restart-storm window. |
| `MYTHGRAM_DEAMON_STARTUP_GRACE_MS` | `20000` | Grace period before health checks count. |
| `MYTHGRAM_DEAMON_HEARTBEAT_STALE_MS` | `60000` | Watchdog stale-heartbeat threshold. |
| `MYTHGRAM_DEAMON_WATCHDOG_INTERVAL_MS` | `10000` | Watchdog check interval. |
| `MYTHGRAM_DEAMON_LOG_MAX_BYTES` | `5242880` | Log rotation size. |
| `MYTHGRAM_DEAMON_LOG_MAX_FILES` | `5` | Rotated log files kept. |
| `MYTHGRAM_DEAMON_TICK_MS` | `5000` | State/heartbeat write interval. |

### Troubleshooting

```bash
npm run daemon:status
npm run daemon:doctor
npm run daemon:logs -- --lines 200
tail -n 100 .mythgram/logs/backend.log
```

- **"Daemon did not report a live pid"** — run `npm run daemon:doctor` and read `.mythgram/logs/deamon.log`.
- **Port already in use** — the daemon stops the stale PID recorded in `.mythgram/*.pid`. If another program owns the port, change `PORT` or `MYTHGRAM_DEAMON_FRONTEND_PORT`.
- **WebUI missing** — run `npm install --prefix webui`, or start with `--no-frontend`.
- **systemd user service does not start at boot** — run `loginctl enable-linger "$USER"` (the installer attempts this automatically).
- **Service install needs privileges** — use `sudo npm run daemon:install` for a system service, or `npm run daemon:install -- --user`.
