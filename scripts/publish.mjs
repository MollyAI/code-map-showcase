#!/usr/bin/env node
// --------------------------------------------------------------------
// scripts/publish.mjs — add / update / remove a project's code-map data in
// this gallery, then regenerate projects.json. Pure Node (no deps, no npm
// install). Run from anywhere; paths resolve against the repo root.
//
//   # publish a build (run /code-map:build in the target project first):
//   node scripts/publish.mjs --from /path/to/project/.code-map
//   node scripts/publish.mjs --from /path/to/project/.code-map --slug my-app --name "My App"
//   node scripts/publish.mjs --from /path/to/project/.code-map/code-map.json --no-history
//
//   # just rescan data/ and rewrite projects.json (no copy):
//   node scripts/publish.mjs reindex
//
//   # remove a project from the gallery:
//   node scripts/publish.mjs remove my-app
//
// projects.json is ALWAYS fully derived from data/<slug>/code-map.json (plus an
// optional data/<slug>/meta.json sidecar for human name/description/tags), so it
// is safe to delete and `reindex` to rebuild. The landing page (landing.js)
// consumes exactly the entry shape produced by metaFor() below.
// --------------------------------------------------------------------
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync,
  readdirSync, statSync, rmSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const INDEX = join(ROOT, 'projects.json');

const die = (msg) => { console.error('[publish] ' + msg); process.exit(1); };

/** kebab-case a string into a URL/dir-safe slug. */
function slugify(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/** Derive the projects.json entry for one project from its code-map model. */
function metaFor(slug, model) {
  const p = model.project || {};
  const layers = Array.isArray(model.layers) ? model.layers : [];
  const declarations = layers.reduce((n, L) => n + ((L.classes || []).length), 0);
  return {
    slug,
    name: p.name || slug,
    languages: Array.isArray(p.languages) ? p.languages : [],
    files: Number.isFinite(p.files_scanned) ? p.files_scanned : null,
    declarations,
    layers: layers.length,
    flows: Array.isArray(model.flows) ? model.flows.length : 0,
    edges: Array.isArray(model.edges) ? model.edges.length : 0,
    git: p.git ? { branch: p.git.branch ?? null, short: p.git.short ?? null, commit: p.git.commit ?? null } : null,
    generated_at: p.generated_at ?? null,
    refined: !!p.architecture,   // Phase 2 (/code-map:build) stamps project.architecture
  };
}

/** Optional per-project human overrides: data/<slug>/meta.json. */
function readSidecar(slug) {
  const f = join(DATA_DIR, slug, 'meta.json');
  if (!existsSync(f)) return {};
  try {
    const s = JSON.parse(readFileSync(f, 'utf8')) || {};
    const out = {};
    if (typeof s.name === 'string' && s.name.trim()) out.name = s.name.trim();
    if (typeof s.description === 'string') out.description = s.description;
    if (Array.isArray(s.tags)) out.tags = s.tags;
    return out;
  } catch { return {}; }
}

/** Rebuild projects.json from whatever is on disk under data/. */
function reindex() {
  const projects = [];
  if (existsSync(DATA_DIR)) {
    for (const name of readdirSync(DATA_DIR)) {
      const dir = join(DATA_DIR, name);
      const f = join(dir, 'code-map.json');
      if (!existsSync(f) || !statSync(dir).isDirectory()) continue;
      let model;
      try { model = JSON.parse(readFileSync(f, 'utf8')); }
      catch (e) { console.warn(`[publish] skip ${name}: ${e.message}`); continue; }
      projects.push({ ...metaFor(name, model), ...readSidecar(name) });
    }
  }
  projects.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  writeFileSync(INDEX, JSON.stringify({ projects }, null, 2) + '\n', 'utf8');
  console.log(`[publish] reindexed ${projects.length} project(s) → projects.json`);
}

function parseArgs(argv) {
  const a = { from: null, slug: null, name: null, desc: null, history: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--from') a.from = argv[++i];
    else if (k === '--slug') a.slug = argv[++i];
    else if (k === '--name') a.name = argv[++i];
    else if (k === '--desc') a.desc = argv[++i];
    else if (k === '--no-history') a.history = false;
    else die(`unknown flag: ${k}`);
  }
  return a;
}

function publish(argv) {
  const a = parseArgs(argv);
  if (!a.from) die('missing --from <path to .code-map dir or code-map.json>');
  let src = resolve(a.from);
  if (existsSync(src) && statSync(src).isDirectory()) src = join(src, 'code-map.json');
  if (!existsSync(src)) die(`no code-map.json at ${src}`);

  let model;
  try { model = JSON.parse(readFileSync(src, 'utf8')); }
  catch (e) { return die(`cannot parse ${src}: ${e.message}`); }
  if (!model || !model.project) die(`${src} is not a code-map.json (missing project)`);

  const slug = slugify(a.slug || model.project.name);
  if (!slug) die('could not derive a slug — pass --slug');

  const destDir = join(DATA_DIR, slug);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, 'code-map.json'));

  const hist = join(dirname(src), 'git-history.json');
  if (a.history && existsSync(hist)) {
    copyFileSync(hist, join(destDir, 'git-history.json'));
    console.log('[publish] + git-history.json');
  } else if (!a.history) {
    const dh = join(destDir, 'git-history.json');
    if (existsSync(dh)) rmSync(dh);
  }

  if (a.name || a.desc != null) {
    const side = { ...readSidecar(slug) };
    if (a.name) side.name = a.name;
    if (a.desc != null) side.description = a.desc;
    writeFileSync(join(destDir, 'meta.json'), JSON.stringify(side, null, 2) + '\n', 'utf8');
  }

  console.log(`[publish] data/${slug}/  (${model.project.name})`);
  reindex();
  console.log('[publish] done — commit & push to deploy.');
}

function remove(slug) {
  const s = slugify(slug);
  const dir = join(DATA_DIR, s);
  if (!s || !existsSync(dir)) die(`no such project: ${slug}`);
  rmSync(dir, { recursive: true, force: true });
  console.log(`[publish] removed data/${s}/`);
  reindex();
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'reindex') reindex();
else if (cmd === 'remove') remove(rest[0]);
else publish(process.argv.slice(2));
