# inline-comment-review

A [Claude Code](https://claude.com/claude-code) **skill** that lets a human leave
inline comments on a draft the agent wrote — by highlighting text in a browser —
and feeds those comments, with context, straight back to the agent. No copy-paste.

Built for the case where you ask the assistant for some text (a CV, cover letter,
doc, spec, marketing copy, config) and want to point at *exact phrases* — "this
word is wrong", "drop this bullet" — instead of retyping "change the second
sentence of paragraph three".

## How it looks

- A two-pane local web page: the draft on the left, your comments on the right.
- Select any span → a comment box pops up, tied to that exact quote.
- Click a highlight to edit or delete it. Optional overall note.
- Click **Send** → your comments land back with the agent, **hands-free** (the
  agent wakes up on its own; you don't have to type anything in the terminal).

Each comment arrives anchored with its **section**, the **full line** it sits in,
and a **±60-char window**, so even a one-word selection is unambiguous.

## Install

It's a personal skill — drop the folder where your agent looks for skills:

```bash
# Claude Code
git clone <this-repo> ~/.claude/skills/inline-comment-review

# or copy an existing checkout
cp -r inline-comment-review ~/.claude/skills/
```

(Codex: `~/.agents/skills/`. Any agent that loads Claude-style skills works.)

**Requirements:** Node.js 18+ (uses only built-in modules — no `npm install`).

## Usage (what the agent does)

The skill is self-driving once invoked; this is the loop it follows:

1. Write the draft to `<workdir>/draft.txt` (any directory — `/tmp/review`, a
   project subfolder, anywhere you can write). Optionally prefix logical sections
   with `=== SECTION NAME ===` lines.
2. Start the server in the background:
   ```bash
   node ~/.claude/skills/inline-comment-review/server.mjs --dir <workdir>
   ```
   It prints `{"url":"http://localhost:PORT", ...}` (also in `<workdir>/server-info.json`).
3. Open the URL, comment, click **Send**.
4. The agent reads the last line of `<workdir>/feedback.jsonl` and revises.
5. New round: agent overwrites `draft.txt`, you refresh the page.

### Hands-free resume

After giving you the URL, the agent runs the waiter in the background and ends
its turn:

```bash
node ~/.claude/skills/inline-comment-review/wait-for-feedback.mjs --dir <workdir>
```

When you click **Send**, the waiter exits — and a background task exiting is what
re-invokes the agent. So the agent wakes up by itself; no "tell me when you're
done" ping. (It's still turn-based under the hood: a browser click can't reach a
model directly, so the waiter's *exit* is the bridge. Expect a few seconds of
lag — mostly the harness re-invocation, not the file watch.)

## Feedback format

Each **Send** appends one JSON line to `feedback.jsonl`:

```json
{"overall":"...","count":2,"comments":[
  {"quote":"selected text","note":"your comment",
   "section":"SECTION NAME","line":"the whole line it sits in",
   "before":"~60 chars before","after":"~60 chars after"}
]}
```

## Files

| File | Role |
|------|------|
| `SKILL.md` | Skill manifest + the loop the agent follows |
| `server.mjs` | Dependency-free HTTP server: serves the page, the draft, collects feedback |
| `review.html` | The comment UI (inline highlights, context-anchored comments) |
| `wait-for-feedback.mjs` | Background watcher; exits on a new submission to auto-resume the agent |

## Design notes

- **Dependency-free.** Node's built-in `http` only. No WebSocket (a single HTTP
  `POST` per submission is all the live channel needs), no `npm install`.
- **`fs.watch` + 1s poll fallback.** Watch gives near-instant local detection;
  the poll covers filesystems where `fs.watch` silently misses events
  (some network/synced mounts).
- **Position-anchored comments.** The page stores comments as `{start, end}`
  offsets into the draft, so section/line/context are derived on demand — a
  one-word highlight still comes back fully situated.
- **Storage keyed by draft hash.** Comments persist across a refresh, and a
  changed draft starts clean automatically.
- **Copy fallback.** If the live channel hiccups, a **Copy** button yields the
  same feedback as Markdown to paste into chat.

## Why not a Claude `FileChanged` hook?

Claude Code's `FileChanged` hook is async and fire-and-forget — it cannot wake or
re-invoke the agent. The only mechanism that resumes an idle agent from an
external event is a **background task that exits**, which is exactly what
`wait-for-feedback.mjs` does.

## License

MIT
