#!/usr/bin/env node
// Blocks until the user submits feedback, then exits — so the agent gets
// auto-resumed (a background task that EXITS re-invokes the agent).
//
// Run this in the background AFTER giving the user the URL, then end your turn.
// When the user clicks "Send", feedback.jsonl grows, this exits, and the
// harness wakes you to read the new submission. No manual "check it" ping.
//
// Detection: fs.watch on the working directory for near-instant wakeup, PLUS a
// 1s polling fallback. The fallback matters because fs.watch silently misses
// events on some network/synced filesystems (e.g. Dropbox, NFS) — watch gives
// speed, polling guarantees correctness.
//
// Usage:
//   node wait-for-feedback.mjs --dir <workdir> [--timeout-min N] [--baseline N]
//   --dir          working dir containing feedback.jsonl (default cwd)
//   --timeout-min  give up after N minutes and exit anyway (default 30)
//   --baseline     line count to treat as "already seen"; exit when the file
//                  exceeds it. Default: current line count at launch, so only
//                  a NEW submission wakes you.
//
// Exit codes: 0 = new feedback arrived, 2 = timed out (check in with the user).

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };

const dir = path.resolve(arg('--dir', process.cwd()));
const file = path.join(dir, 'feedback.jsonl');
const fileName = path.basename(file);
const timeoutMin = parseFloat(arg('--timeout-min', '30'));

const lineCount = () => {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length; }
  catch { return 0; }
};

const baseline = parseInt(arg('--baseline', String(lineCount())), 10);

let finished = false;
const done = (code, msg) => {
  if (finished) return;
  finished = true;
  try { if (watcher) watcher.close(); } catch {}
  clearInterval(poll);
  clearTimeout(timer);
  console.log(JSON.stringify({ type: 'wait-done', reason: msg, lines: lineCount(), baseline }));
  process.exit(code);
};

const check = (reason) => { if (!finished && lineCount() > baseline) done(0, reason); };

// Fast path: watch the directory (more robust than watching the file, which can
// break when the file is replaced). Filter to our filename.
let watcher = null;
try {
  watcher = fs.watch(dir, (_evt, fname) => {
    if (!fname || fname === fileName) check('fs.watch');
  });
} catch { /* fs.watch unsupported here — the poll fallback covers us */ }

// Safety net: poll every second in case fs.watch misses events (synced/network FS).
const poll = setInterval(() => check('poll'), 1000);

// Hard stop so an abandoned review can't block forever.
const timer = setTimeout(() => done(2, 'timeout'), timeoutMin * 60 * 1000);

// Immediate check in case feedback already landed before we started.
check('startup');
