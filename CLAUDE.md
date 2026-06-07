# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A **static GitHub Pages gallery** for [code-map](https://github.com/MollyAI/code-map)
outputs. No backend, no build step, no npm install — plain HTML + native ESM + a
small Node script. Served at https://mollyai.github.io/code-map-showcase/.

Two roles live here, deliberately kept separate:
- **The gallery shell** (this repo owns): `index.html`, `landing.css`, `landing.js`,
  `scripts/publish.mjs`, `projects.json`, and the per-project `data/`.
- **The viewer** (the plugin owns): everything under `viewer/`. It is **synced
  verbatim** from `MollyAI/code-map` and must never be hand-edited here — edits
  belong in the plugin, then flow back via the sync workflow.

## Architecture

```
index.html  landing.css  landing.js     gallery home: centered search + card grid
projects.json                           generated index — array under { projects: [...] }
data/<slug>/code-map.json               a project's map (Phase-1 raw or Phase-2 refined)
data/<slug>/git-history.json            optional commit-history sidecar
data/<slug>/meta.json                   optional { name, description, tags } overrides
viewer/                                 synced code-map viewer (static; fetches data over relative paths)
scripts/publish.mjs                     copy a build into data/<slug>/ + rebuild projects.json
.github/workflows/sync-viewer.yml       manual: pull viewer/ from the plugin's main
```

**Navigation:** a card links to `viewer/index.html?project=<slug>`. The viewer's
`data/source.js` maps `?project=<slug>` → `../data/<slug>/code-map.json` (and
`git-history.json`). With no `?project=` the viewer fetches `/code-map.json` —
i.e. local `code-map serve` is unchanged. This `?project=` convention is the
**entire** contract between the two repos (plugin ≥ v1.5.2).

## The coupling contract (keep these stable, or update both sides)

The gallery shell imports three things from the synced viewer. If a plugin change
renames/removes any of them, `landing.js` / `landing.css` must be updated to match:

- `viewer/src/settings.js` → `createSettings()` — theme/lang persistence. The
  gallery reuses the **same `code-map-` localStorage keys** (`theme`, `lang`) so a
  choice on the home page carries into the map and back (same origin).
- `viewer/src/util.js` → `escapeHtml()` — used when building card HTML.
- `viewer/style.css` → the `:root` design tokens, the `.light` theme palette,
  the Fraunces/Geist/JetBrains fonts, and the `.topbar`/`.theme-toggle`/`.lang-toggle`
  CSS the gallery's topbar reuses by class name.

`projects.json` entry shape is produced by `metaFor()` in `publish.mjs` and consumed
by `cardHtml()` in `landing.js` — change them together.

## Common tasks

```bash
# Add / update a project (run /code-map:build in the target first):
node scripts/publish.mjs --from /path/to/project/.code-map [--slug s] [--name "…"] [--desc "…"] [--no-history]

# Rebuild projects.json from data/ (safe anytime — projects.json is fully derived):
node scripts/publish.mjs reindex

# Remove a project:
node scripts/publish.mjs remove <slug>

# Preview locally (any static server; the viewer needs ?project= to find data):
python3 -m http.server 8080      # or:  npx --yes serve .
#   home:    http://localhost:8080/
#   a map:   http://localhost:8080/viewer/index.html?project=code-map
```

Deploy = commit + push to `main`; GitHub Pages (Settings → Pages → Deploy from a
branch → `main` / root) redeploys automatically. `.nojekyll` keeps Pages from
running Jekyll over the static files.

## Updating the viewer

When the plugin ships a viewer change (and it's merged to the plugin's `main`):
**Actions → "Sync viewer from plugin" → Run workflow**. It rsyncs `viewer/` from
`MollyAI/code-map` (excluding `src/test/` and `jsconfig.json`) and commits if
anything changed. Don't edit `viewer/` by hand — the next sync would overwrite it.

## Invariants

- **Never hand-edit `viewer/`.** It's owned by the plugin.
- **Never hand-edit `projects.json`.** Regenerate via `publish.mjs`.
- **No build step, no dependencies.** Keep `landing.*` as native ESM/CSS and
  `publish.mjs` as dependency-free Node (stdlib only), matching the plugin's
  "just need a JS runtime" philosophy.
- **Only `code-map.json`, `git-history.json`, `meta.json` belong under `data/<slug>/`.**
  `raw_structure.json` / `unresolved.json` and server scratch are git-ignored.
- **Publish only public-safe maps** (see README's warning about exposed paths,
  symbols, and commit metadata).
