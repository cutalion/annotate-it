#!/usr/bin/env node
// Tiny dependency-free server for the annotate-it skill.
//
// Serves review.html, hands the page the current draft, and collects the
// human's inline comments. No npm install, no WebSocket — just Node's http.
//
// Usage:
//   node server.mjs [--port N] [--dir PATH]
//   --port  port to bind (default: 0 = pick a free one)
//   --dir   working directory for draft + feedback (default: cwd)
//
// Files in --dir:
//   draft.txt        the text to review        (written by the agent)
//   feedback.jsonl   one JSON line per "Send"   (read by the agent)
//   server-info.json {url, port, dir}           (written on startup)
//
// The agent: write draft.txt -> start this server -> give the user the URL.
// The user: highlight text, comment, click "Send", return to the terminal.
// The agent: read the last line of feedback.jsonl.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const port = parseInt(arg('--port', '0'), 10) || 0;
const dir = path.resolve(arg('--dir', process.cwd()));
const draftFile = path.join(dir, 'draft.txt');
const feedbackFile = path.join(dir, 'feedback.jsonl');
const pageFile = path.join(here, 'review.html');

fs.mkdirSync(dir, { recursive: true });

const server = http.createServer((req, res) => {
  // Serve the review page
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(pageFile).pipe(res);
    return;
  }
  // Hand the page the current draft (no-store so a refresh always re-reads it)
  if (req.method === 'GET' && req.url === '/draft') {
    const text = fs.existsSync(draftFile) ? fs.readFileSync(draftFile, 'utf8') : '';
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(text);
    return;
  }
  // Collect a feedback submission
  if (req.method === 'POST' && req.url === '/feedback') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"ok":false,"error":"invalid json"}');
        return;
      }
      fs.appendFileSync(feedbackFile, body.replace(/\n/g, ' ') + '\n');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.on('error', (e) => {
  console.error(JSON.stringify({ type: 'server-error', error: e.code || e.message }));
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const p = server.address().port;
  const info = { type: 'server-started', url: `http://localhost:${p}`, port: p, dir };
  fs.writeFileSync(path.join(dir, 'server-info.json'), JSON.stringify(info) + '\n');
  console.log(JSON.stringify(info));
});
