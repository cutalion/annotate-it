# Agent guide

This file provides guidance to coding agents when working with code in this repository.

## What this is

`annotate-it` is itself a **Claude Code skill** — not an app you build, but a tool an agent invokes. The repo's product is `SKILL.md` plus two Node scripts and one HTML page. It lets a human highlight spans of a draft in a browser and have those inline comments flow back to the agent. Read `SKILL.md` first: it is both the skill manifest and the loop the agent is expected to follow.

## Running / testing

No build, no test suite, no lint, no `package.json`, no dependencies — Node's built-in modules only, Node 18+. To exercise the pieces manually:

```bash
# Serve a draft (writes server-info.json, prints {"url":...}); --port 0 picks a free port
node server.mjs --dir /tmp/review --port 8080

# Block until a new feedback line lands, then exit (exit 0 = new feedback, 2 = timeout)
node wait-for-feedback.mjs --dir /tmp/review --timeout-min 30
```

Open the printed URL, select text, comment, click **Send** → a JSON line appends to `<dir>/feedback.jsonl` and the waiter exits.

## The core mechanism (why it's shaped this way)

The model only runs when the harness invokes it; a browser click cannot reach it directly. The whole design works around that one constraint:

- **`server.mjs`** — stateless HTTP server. `GET /` serves `review.html`, `GET /draft` returns `draft.txt` (sent `no-store` so a refresh always re-reads), `POST /feedback` validates JSON and appends one line to `feedback.jsonl`. It self-exits on `SIGTERM`/`SIGINT` and after idle (`--idle` minutes, default 60), unlinking `server-info.json` so a later run can't read a dead URL.
- **`wait-for-feedback.mjs`** — blocks until `feedback.jsonl` grows past a baseline line count, then **exits**. A background task exiting is what re-invokes the agent. This script *is* the bridge from "user clicked Send" to "agent wakes up." Detection is `fs.watch` (fast) **plus** a 1s poll fallback (covers network/synced filesystems where `fs.watch` silently drops events) — keep both.
- **`review.html`** — the entire client, one self-contained file (inline CSS + IIFE, no framework, no bundler).

Both scripts must be launched **in the background** by the agent; running them in the foreground blocks the turn and they die.

## The workdir contract

A `--dir` working directory carries three runtime files (all gitignored), the only state shared between server, waiter, and agent:

| File | Written by | Read by |
|------|-----------|---------|
| `draft.txt` | agent | server (`/draft`) |
| `feedback.jsonl` | server (one line per Send) | agent (**last** line = current round) and waiter (line count) |
| `server-info.json` | server on boot | agent (to recover the URL) |

Each round: agent overwrites `draft.txt`, user refreshes the page, agent re-launches the waiter. Feedback is **append-only** — always take the last line, never re-parse the whole file.

## review.html specifics

- Comments are stored as `{start, end}` character offsets into the draft. `line` / `before` / `after` context is derived on demand (`contextFor`), so a one-word selection still comes back fully situated. The wire payload shape lives in `feedbackPayload`.
- Rendering uses **boundary segmentation** (`renderText`): the text is split at every comment start/end, each segment wrapped once and shaded by how many comments cover it (`data-depth` 1–3). This is what allows overlapping / nested highlights — a single linear pass cannot wrap nested spans. Don't revert to a linear renderer.
- Popovers are positioned from a **captured viewport rect**, not the live element, because opening a popover re-renders the marks and detaches the clicked node (`onMarkClick` → `positionPopover`).
- Multi-click selections are debounced (`onMouseUp`, 250ms) so a triple-click yields one line comment instead of first committing the double-click's word.
- Comments persist in `localStorage` keyed by a hash of the draft, so a refresh keeps work but a changed draft auto-resets.
- **Copy as Markdown** is the fallback channel if `POST /feedback` fails — keep it working alongside Send.

## Conventions

Dependency-free is a hard design constraint, not an accident — do not add npm packages, a build step, or WebSockets. Match the existing terse, comment-dense style in the `.mjs` files and the compact IIFE in `review.html`.
