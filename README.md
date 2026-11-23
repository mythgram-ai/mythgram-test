# Mythgram — Autonomous General-Purpose AI Agent

Mythgram is an autonomous, general-purpose AI software engineering and operations agent that runs directly on your local computer with 34 native function-calling tools, multi-session background execution, sub-agent orchestration, artifacts & skills management, interactive slide decks, high-throughput SQLite + RAM buffered streaming, and a responsive developer workspace UI.

## Live Service URLs
- **Frontend WebUI (Port 2000)**: `https://2000-izglh5qn65qt0ga0q9pgl-d0b9e1e2.sandbox.novita.ai` (or `http://localhost:2000`)
- **Backend API & SSE/WS Server (Port 1000)**: `https://1000-izglh5qn65qt0ga0q9pgl-d0b9e1e2.sandbox.novita.ai` (or `http://localhost:1000`)

## Completed Features & Systems
1. **34 Native Function-Calling Tools (Zod Schemas)**:
   - Core Workspace Tools (15): `file_write`, `file_read`, `file_list`, `read_directory`, `grep`, `astgrep`, `glob`, `str_replace`, `apply_patch`, `read_image`, `scan_qr_code`, `fetch_text_from_image`, `archive_files`, `extract_archive`, `shall_tool`.
   - New Extended Tools (19): `wait`, `save_artifacts`, `list_artifacts`, `show_artifact_to_user`, `attach_files`, `ask_for_something`, `ask_question_to_user`, `embed_url`, `read_todos`, `todo_write`, `submit_plan`, `create_sub_agent`, `call_sub_agent`, `list_sub_agents`, `create_skill`, `list_skills`, `manage_slides`, `present_slides`, `organize_slides`.
2. **Artifacts System (`src/artifacts`, `.mythgram/artifacts/artifacts.json`)**:
   - Saves reusable artifacts on disk inside `.mythgram/artifacts` with automatic recreation if deleted.
   - Dedicated lazy-loaded **Artifacts Page** (`/artifacts`) and **Artifact Tab** inside Chat Page (showing rendered content).
3. **Sub-Agent System (`src/agents/sub-agent.ts`, `src/sub-agents`, `.mythgram/sub-agents/sub-agents.json`)**:
   - 10 built-in default sub-agents (`code-architect`, `frontend-specialist`, `backend-engineer`, `bug-hunter`, `test-runner`, `security-auditor`, `docs-writer`, `data-analyst`, `refactoring-expert`, `slide-designer`) protected from deletion.
   - Supports single or parallel multi-sub-agent execution (`wait_for_output: true | false`) using the user's active LLM settings, 2-second RAM-to-SQLite buffering, automatic abort propagation, and restricted tool filtering.
   - Dedicated lazy-loaded **Sub-Agents Page** (`/sub-agents`) supporting single or batch creation, plus a live streaming **Sub-Agent Tab** in Chat Page.
4. **Skills System (`src/skills`, `.mythgram/skills/skills.json`)**:
   - 2 built-in default skills (`fullstack-web-architect`, `automated-code-auditor`) plus custom skills created manually or via `create_skill`.
   - Dedicated lazy-loaded **Skills Page** (`/skills`) with `SKILL.md` editor and subfolder creation.
5. **Slides System (`slide_projects` in SQLite)**:
   - Organizes, manages, and presents 16:9 HTML slide decks with export/download support for **HTML, PDF, PPTX, and Image (SVG)**.
   - Dedicated lazy-loaded **Slides Page** (`/slides`) and **Slides Tab** in Chat Page.

## Architecture & Directory Structure

```
/home/user/webapp/
├── .mythgram/                     # Automatically created & self-healing data directory
│   ├── mythgram.sqlite            # High-throughput SQLite WAL database (sessions, messages, slides, todos, sub_agent_runs)
│   ├── artifacts/                 # Stored artifact files + artifacts.json
│   ├── sub-agents/                # Custom sub-agent JSON files + sub-agents.json + outputs/
│   ├── skills/                    # Skill directories (SKILL.md + subfolders) + skills.json
│   ├── uploads/                   # User file & folder attachments
│   ├── cache/                     # Cached metadata
│   └── logs/                      # Service logs
├── src/
│   ├── index.ts                   # Backend HTTP + SSE + WebSocket PTY server (Port 1000)
│   ├── datadir/index.ts           # .mythgram initialization & self-healing integrity checks
│   ├── db/index.ts                # Native node:sqlite engine + 2-second RAM buffer flush loop
│   ├── artifacts/index.ts         # Artifacts store manager (.mythgram/artifacts)
│   ├── sub-agents/index.ts        # 10 default sub-agents + custom sub-agent store (.mythgram/sub-agents)
│   ├── skills/index.ts            # 2 default skills + custom skill store (.mythgram/skills)
│   ├── agents/
│   │   ├── agent.ts               # Main autonomous ReAct loop & resilient streaming engine
│   │   ├── sub-agent.ts           # Sub-agent execution engine with live streaming & abort cascade
│   │   └── prompt/
│   │       └── system-prompt.md   # System prompt with instructions for all 34 tools & systems
│   └── tools/                     # 34 Zod-schema native function-calling tools + unit tests
└── webui/                         # React 19 + Vite 6 + TypeScript Frontend (Port 2000)
    └── src/
        ├── pages/                 # Lazy-loaded pages (HomePage, ChatPage, ArtifactsPage, SubAgentsPage, SkillsPage, SlidesPage)
        └── components/            # Right-panel tabs (ComputerTab, BrowserTab, ArtifactTab, SubAgentTab, SlidesTab, FilesTab, TerminalTab)
```

## Starting & Stopping
```bash
# Start both backend (port 1000) and frontend (port 2000)
./start.sh

# Stop both services
./stop.sh
```
