---
name: annotate-it
description: Use when a human needs to leave inline comments on a draft you wrote (CV, cover letter, doc, copy, spec, config) and have them flow back to you — instead of pasting feedback by hand. Triggers when the user wants to "comment on", "mark up", "annotate", "review", or "leave notes on" specific lines or phrases of text in a browser.
---

# Annotate It

## Overview

Spin up a local browser page where the user highlights any span of a draft and attaches a comment. They click **Send**; their comments (each with surrounding context) land in a file you read on your next turn. No copy-paste. Dependency-free: Node's built-in `http`, no `npm install`.

Use this instead of asking the user to retype "change line 3, the second bullet is wrong" — they point at the exact words.

## When to Use

- You produced a draft and want precise, anchored feedback ("this phrase", not "somewhere in paragraph 2").
- Iterating in rounds: draft → comments → revise → repeat.
- The user said comment / mark up / annotate / leave notes inline.

**Not for:** quick one-line feedback (just ask), or non-text artifacts (images, diagrams).

## The Loop (hands-free)

1. **Write the draft** to `<workdir>/draft.txt` (pick any workdir, e.g. a temp or project subdir). Plain text. Optional: prefix logical sections with `=== SECTION NAME ===` lines — these get attached to each comment as its `section`.
2. **Start the server in the background** (it must survive across turns):
   ```bash
   node ~/.claude/skills/annotate-it/server.mjs --dir <workdir>
   ```
   It prints `{"url":"http://localhost:PORT",...}` (also written to `<workdir>/server-info.json`). Use `run_in_background: true`.
3. **Give the user the URL**, then **launch the waiter in the background and END YOUR TURN**:
   ```bash
   node ~/.claude/skills/annotate-it/wait-for-feedback.mjs --dir <workdir>
   ```
   Use `run_in_background: true`. This blocks until the user clicks **Send**, then exits — and a background task that exits **auto-resumes you**. No manual "tell me when done" ping. (On timeout it exits with code 2 so you check in.)
4. **When the waiter exits, you are re-invoked.** Read the **last line** of `<workdir>/feedback.jsonl` — that's their submission.
5. **Revise**, overwrite `draft.txt`, tell the user to **refresh** the page (it re-fetches the draft and resets comments). Re-launch the waiter and end your turn again. Repeat.

**Why the waiter:** the model only runs when the harness invokes it; a click in the browser can't reach you on its own. A background process that EXITS triggers re-invocation, so the waiter turns "user clicked Send" into "agent wakes up." Without it, the loop is turn-based — the user must type in the terminal to hand you the turn.

## Feedback Format

Each `Send` appends one JSON line to `feedback.jsonl`:

```json
{"overall":"...","count":2,"comments":[
  {"quote":"selected text","note":"the user's comment",
   "section":"KIDSOUT","line":"the whole line it sits in",
   "before":"~60 chars before","after":"~60 chars after"}
]}
```

`section`/`line`/`before`/`after` disambiguate short selections — a one-word `quote` still arrives with its full line and section, so you always know which occurrence they meant.

## Quick Reference

| Need | Do |
|---|---|
| Show a draft | write `draft.txt`, start `server.mjs --dir <workdir>` (background) |
| Get the URL | read stdout or `<workdir>/server-info.json` |
| Wait hands-free | start `wait-for-feedback.mjs --dir <workdir>` (background), end turn |
| Read feedback | last line of `<workdir>/feedback.jsonl` |
| New round | overwrite `draft.txt`, user refreshes, re-launch waiter |
| Stop | kill the background server (and waiter, if running) |

## Common Mistakes

- **Running the server or waiter in the foreground.** Blocks the turn and dies. Use `run_in_background: true` for both.
- **Not launching the waiter, then polling on a timer.** Don't schedule wake-ups to poll `feedback.jsonl` — the waiter's exit already re-invokes you. Launch it once and end your turn.
- **Forgetting the refresh.** A new `draft.txt` only loads when the user reloads the tab.
- **Re-reading the whole `feedback.jsonl`.** Each submission is appended; take the **last** line for the current round.
- **Ignoring the waiter's exit code.** `0` = new feedback (read it). `2` = timed out (check in with the user; don't assume they're done).

## Notes

- The user always has a **Copy** button as a fallback if the channel hiccups — it copies the same feedback as Markdown to paste into chat.
- Comments persist in the browser's localStorage keyed by a hash of the draft, so a refresh mid-review won't lose work, and a changed draft starts clean.
