# hermes-hudui (fork)

This is a fork of [joeynyc/hermes-hudui](https://github.com/joeynyc/hermes-hudui) — a web dashboard for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

Designed to be used with our [hermes-agent fork](https://github.com/tigermkiiiddd/hermes-agent). The two projects share the same `state.db`, so all data (projects, todos, session history) is visible in both CLI and web dashboard in real time.

## Quick Start

```bash
git clone https://github.com/tigermkiiiddd/hermes-hudui.git
cd hermes-hudui
./install.sh
hermes-hudui
```

Open http://localhost:3001

**Requirements:** Python 3.11+, Node.js 18+, a running Hermes agent (our fork) with data in `~/.hermes/`

On future runs:
```bash
source venv/bin/activate && hermes-hudui
```

## What's Changed from Upstream

- **Dashboard masonry layout** — CSS columns waterfall layout instead of grid, so panels don't waste vertical space with equal heights
- **Sessions & Health merged into Dashboard** — fewer tabs, everything at a glance on the landing page
- **Projects panel** — reads from `state.db` projects table, matches the `project` tool in our hermes-agent fork
- **Settings panel** — skill toggle, configuration editing
- **Chat Composer** — Cmd/Ctrl+Enter to send, Enter for newline (IME-friendly, no conflict with Chinese input)
- **Session delete** — delete sessions from the sidebar
- **Chinese translation rewrite** — natural colloquial Chinese, not machine-translated
- **localStorage caching** — `useApi` with `fallbackData` + `onSuccess` for instant loading on revisit
- **LAN access** — listens on `0.0.0.0` by default, accessible from other devices on the network

## Architecture

```
React Frontend (Vite + Tailwind + SWR)
    ↓ /api/* (proxied in dev)
FastAPI Backend (Python)
    ↓ collectors/           ↓ chat/engine.py
~/.hermes/state.db          hermes CLI (subprocess)
```

### Development

```bash
# Full-stack dev mode
hermes-hudui --dev          # Terminal 1: backend on :3001 (auto-reload)
cd frontend && npm run dev  # Terminal 2: frontend on :5173 (proxies /api → :3001)
```

### Build & Deploy

```bash
cd frontend && npm run build
rm -rf backend/static/* && cp -r frontend/dist/* backend/static/
```

Then restart `hermes-hudui`.

## Themes

Four themes switchable with `t`: **Neural Awakening** (cyan), **Blade Runner** (amber), **fsociety** (green), **Anime** (purple). Optional CRT scanlines.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`–`9`, `0` | Switch tabs |
| `t` | Theme picker |
| `Ctrl+K` | Command palette |

## Syncing with Upstream

```bash
git remote add upstream https://github.com/joeynyc/hermes-hudui.git
git fetch upstream
git rebase upstream/main
```

## Platform Support

macOS · Linux · WSL

## License

MIT — see [LICENSE](LICENSE). Same license as upstream.
