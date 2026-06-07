#!/usr/bin/env node
// --------------------------------------------------------------------
// scripts/git-history.mjs — emit a code-map `git-history.json` sidecar for a
// repository, from its real `.git`. Pure Node (no deps, stdlib only), matching
// publish.mjs's "just need a JS runtime" philosophy.
//
// Why this lives here: the code-map plugin does NOT produce git-history.json —
// it's a gallery-side sidecar that the viewer (viewer/src/data/githistory.js)
// fetches to render the commit-history sidebar. /add-code-map full-clones a repo
// (so the whole commit history is present) and runs this to materialize it.
//
//   node scripts/git-history.mjs <repo-path> [--limit N]   # prints JSON to stdout
//   node scripts/git-history.mjs /tmp/foo --limit 200 > /tmp/foo/.code-map/git-history.json
//
// Output shape (exactly what the viewer consumes):
//   { anchor, limit, truncated, commits: [ { hash, short, time, subject, files:[…] } ] }
// `time` is the committer date (unix seconds). `files` are repo-relative paths,
// so they line up with the `path` of classes in code-map.json (the viewer maps
// a commit's changed files → highlighted nodes via those paths).
// --------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Record / unit separators — control chars that never appear in commit metadata,
// so they parse cleanly even when subjects contain spaces, quotes, etc.
const RS = '\x1e', US = '\x1f';

const die = (msg) => { console.error('[git-history] ' + msg); process.exit(1); };

function parseArgs(argv) {
  let repo = null, limit = 200;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') limit = parseInt(argv[++i], 10);
    else if (!repo) repo = a;
    else die(`unexpected argument: ${a}`);
  }
  if (!repo) die('usage: git-history.mjs <repo-path> [--limit N]');
  if (!Number.isFinite(limit) || limit < 1) die('--limit must be a positive integer');
  return { repo: resolve(repo), limit };
}

const { repo, limit } = parseArgs(process.argv.slice(2));
if (!existsSync(repo)) die(`no such path: ${repo}`);

const git = (args) =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],   // capture git's own stderr instead of leaking it
  });

try { git(['rev-parse', '--is-inside-work-tree']); }
catch { die(`not a git repository: ${repo}`); }

let total = 0;
try { total = parseInt(git(['rev-list', '--count', 'HEAD']).trim(), 10) || 0; }
catch { die(`no commits found (is the default branch checked out?): ${repo}`); }

// One record per commit: leading RS delimits records, US separates fields, then
// --name-only appends the changed paths on the following lines.
const fmt = `${RS}%H${US}%h${US}%ct${US}%s`;
const raw = git(['log', '-n', String(limit), `--pretty=format:${fmt}`, '--name-only']);

const commits = [];
for (const chunk of raw.split(RS)) {
  if (!chunk.trim()) continue;                 // skip the empty head before the first RS
  const lines = chunk.split('\n');
  const [hash, short, ct, ...subjParts] = lines[0].split(US);
  const files = lines.slice(1).map((s) => s.trim()).filter(Boolean);
  commits.push({
    hash,
    short,
    time: parseInt(ct, 10) || 0,
    subject: subjParts.join(US),               // defensive rejoin; %s never holds US in practice
    files,
  });
}

const out = {
  anchor: commits.length ? commits[0].hash : null,
  limit,
  truncated: total > commits.length,
  commits,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
