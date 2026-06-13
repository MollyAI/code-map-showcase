#!/usr/bin/env node
// --------------------------------------------------------------------
// scripts/publish.mjs — add / update / remove a project's code-map data in
// this gallery, then regenerate projects.json. Pure Node (no deps, no npm
// install). Run from anywhere; paths resolve against the repo root.
//
//   # publish a build (run /code-map:build in the target project first):
//   node scripts/publish.mjs --from /path/to/project/.code-map
//   node scripts/publish.mjs --from /path/to/project/.code-map --slug my-app --name "My App"
//
//   # just rescan data/ and rewrite projects.json (no copy):
//   node scripts/publish.mjs reindex
//
//   # re-slim every already-published code-map.json + drop orphaned sidecars:
//   node scripts/publish.mjs slim
//
//   # remove a project from the gallery:
//   node scripts/publish.mjs remove my-app
//
// The published code-map.json is web-slimmed (slimModel) — it's the file the
// static viewer fetches per page load, so it carries only what the viewer and
// reindex read. git-history.json is no longer shipped (its viewer consumer was
// removed in plugin v1.14).
//
// projects.json is ALWAYS fully derived from data/<slug>/code-map.json (plus an
// optional data/<slug>/meta.json sidecar for human name/description/tags), so it
// is safe to delete and `reindex` to rebuild. The landing page (landing.js)
// consumes exactly the entry shape produced by metaFor() below.
// --------------------------------------------------------------------
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
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

// --- web slimming -----------------------------------------------------
// The published code-map.json is the file the static gallery viewer fetches
// on every project page, so it should carry only what the viewer (or this
// script's reindex) reads. slimModel drops build-time provenance and
// per-node duplication that the viewer reconstructs anyway — ~7-11% smaller
// raw (faster JSON.parse), and the dropped fields compress so well that the
// real win is parse time + a cleaner repo, not transfer bytes.
//
// `project` keys kept: the viewer reads score/git/generated_at (buildinfo.js,
// buildpopover.js); reindex/metaFor below reads name/languages/files_scanned/
// architecture/score. Everything else (root, files_by_language,
// declarations_by_language, parse_failures, template_detection, resolution,
// dispatch, code_map_version) is unread by the static page.
const KEEP_PROJECT = ['name', 'languages', 'files_scanned', 'git', 'generated_at', 'architecture', 'score'];

/** Strip per-node duplication the viewer's normalizer (schema.js) restores. */
function slimNode(c) {
  const out = { ...c };
  // `package` is always identical to `namespace`; schema.js mirrors it back
  // from namespace when missing, so shipping it is pure duplication. Guard on
  // equality so a (hypothetical) genuine divergence is preserved.
  if (out.package != null && out.package === out.namespace) delete out.package;
  // An empty `description` is a no-op fallback — real text lives on
  // description_zh / description_en (detail.js prefers those). undefined and
  // "" are equally falsy there, so dropping it changes nothing.
  if (out.description === '') delete out.description;
  return out;
}

/** Return a new, web-slimmed copy of a code-map model (never mutates input). */
function slimModel(model) {
  const p = model.project || {};
  const project = {};
  for (const k of KEEP_PROJECT) if (k in p) project[k] = p[k];
  const layers = (Array.isArray(model.layers) ? model.layers : []).map((L) => ({
    ...L,
    classes: (Array.isArray(L.classes) ? L.classes : []).map(slimNode),
  }));
  return { ...model, project, layers };
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
    // arch-score rubric v1 (plugin ≥1.11): `code-map score --write` stamps project.score
    score: Number.isFinite(p.score?.total) ? p.score.total : null,
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
    if (typeof s.repo === 'string' && s.repo.trim()) out.repo = s.repo.trim();  // source URL — /update-all-maps reads this
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
  // arch score (desc) decides the gallery order; unscored maps sink to the end, name breaks ties
  projects.sort((a, b) =>
    ((b.score ?? -Infinity) - (a.score ?? -Infinity)) || String(a.name).localeCompare(String(b.name)));
  writeFileSync(INDEX, JSON.stringify({ projects }, null, 2) + '\n', 'utf8');
  console.log(`[publish] reindexed ${projects.length} project(s) → projects.json`);
}

function parseArgs(argv) {
  const a = { from: null, slug: null, name: null, desc: null, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--from') a.from = argv[++i];
    else if (k === '--slug') a.slug = argv[++i];
    else if (k === '--name') a.name = argv[++i];
    else if (k === '--desc') a.desc = argv[++i];
    else if (k === '--repo') a.repo = argv[++i];
    else if (k === '--no-history') { /* accepted for back-compat; history is never published now */ }
    else die(`unknown flag: ${k}`);
  }
  return a;
}

/**
 * Re-slim every already-published data/<slug>/code-map.json in place and drop
 * any orphaned git-history.json, then reindex. Idempotent — safe to re-run.
 * Use after upgrading publish.mjs to retrofit the slimming onto existing data.
 */
function slim() {
  if (!existsSync(DATA_DIR)) return reindex();
  let slimmed = 0, dropped = 0;
  for (const name of readdirSync(DATA_DIR)) {
    const dir = join(DATA_DIR, name);
    const f = join(dir, 'code-map.json');
    if (!existsSync(f) || !statSync(dir).isDirectory()) continue;
    try {
      const model = JSON.parse(readFileSync(f, 'utf8'));
      writeFileSync(f, JSON.stringify(slimModel(model)) + '\n', 'utf8');
      slimmed++;
    } catch (e) { console.warn(`[publish] skip ${name}: ${e.message}`); continue; }
    const dh = join(dir, 'git-history.json');
    if (existsSync(dh)) { rmSync(dh); dropped++; }
  }
  console.log(`[publish] slimmed ${slimmed} code-map.json, removed ${dropped} git-history.json`);
  reindex();
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
  // Write the web-slimmed model, not a verbatim copy — the published file is
  // what the static viewer fetches on every page load.
  writeFileSync(join(destDir, 'code-map.json'), JSON.stringify(slimModel(model)) + '\n', 'utf8');

  // git-history.json is no longer shipped: the viewer dropped its commit-history
  // sidebar (plugin v1.14), so the sidecar has no consumer. Remove any stale one.
  const dh = join(destDir, 'git-history.json');
  if (existsSync(dh)) { rmSync(dh); console.log('[publish] - git-history.json (orphaned, removed)'); }

  if (a.name || a.desc != null || a.repo) {
    const side = { ...readSidecar(slug) };
    if (a.name) side.name = a.name;
    if (a.desc != null) side.description = a.desc;
    if (a.repo) side.repo = a.repo;
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
else if (cmd === 'slim') slim();
else if (cmd === 'remove') remove(rest[0]);
else publish(process.argv.slice(2));
