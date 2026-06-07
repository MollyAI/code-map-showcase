# Design — code-map GitHub Pages gallery

Date: 2026-06-07 · Status: implemented (initial scaffold)

## Goal

A free, always-on web page that showcases [code-map](https://github.com/MollyAI/code-map)
output across many repositories:

1. A dedicated repo (`MollyAI/code-map-showcase`) collecting per-project map data,
   browsable in any browser.
2. A home page: centered search box + a list of available projects; clicking one
   opens that project's map, styled identically to the code-map viewer.
3. The per-project map UI is the *same* viewer as the plugin; when the plugin's
   viewer updates, the gallery's updates easily, and the two codebases stay
   loosely coupled.
4. Free hosting, no payment.
5. Minimal impact on the existing code-map repo.

## Key feasibility insight

The code-map **viewer is already a pure static site** — `viewer/index.html` +
`style.css` + native ESM `src/*.js`, no build step. Its only contact with a
"server" is two relative `fetch`es: `code-map.json` and `git-history.json`
(`serve.mjs` just hands those out). GitHub Pages serves static files for free, so
the viewer runs there essentially unchanged. The whole project reduces to: serve
the viewer's static files + the data, and let the viewer know which project to load.

## Architecture

```
MollyAI/code-map              (plugin — unchanged except one additive viewer commit)
  viewer/  ── canonical UI source; gains ?project= data-source support (v1.5.2)

MollyAI/code-map-showcase     (this repo)            https://mollyai.github.io/code-map-showcase/
  index.html landing.css landing.js   gallery shell (search + card grid)
  projects.json                       generated index { projects: [ metaFor(...) ] }
  data/<slug>/code-map.json           per-project map  (+ git-history.json, meta.json)
  viewer/                             synced verbatim from the plugin
  scripts/publish.mjs                 publish/reindex/remove + rebuild projects.json
  .github/workflows/sync-viewer.yml   manual pull of viewer/ from the plugin
```

Coupling is **one-directional**: the gallery depends on a stable plugin contract;
the plugin never knows the gallery exists.

## The one plugin change (additive, backward-compatible)

New pure module `viewer/src/data/source.js`:

```js
export function dataUrl(name, search = location.search) {
  const slug = new URLSearchParams(search).get('project');
  return slug ? `../data/${encodeURIComponent(slug)}/${name}` : `/${name}`;
}
```

`load.js` and `githistory.js` fetch `dataUrl('code-map.json')` /
`dataUrl('git-history.json')` instead of the hardcoded `/…`.

- No `?project=` → `/code-map.json` — **identical** to today; local `serve.mjs` and
  every existing test pass unchanged (verified: 38/38 viewer tests green, +4 new in
  `source.test.js`).
- `?project=<slug>` → `../data/<slug>/code-map.json`, relative to the viewer page, so
  it works under any Pages base path.

This is the only edit to the plugin repo. Bumped `plugin.json` 1.5.1 → 1.5.2.

## The gallery shell

- **Visual consistency:** the home page `<link>`s the synced `viewer/style.css` for
  tokens/fonts/theme and reuses the viewer's `.topbar`/`.theme-toggle`/`.lang-toggle`
  markup by class; `landing.css` adds only the hero/search/card layout, scoped so it
  can't bleed into the viewer. When the plugin re-themes, the gallery follows.
- **Shared state:** `landing.js` reuses the viewer's `createSettings()` and the same
  `code-map-theme` / `code-map-lang` keys, so theme + language persist between the
  home page and the maps (same origin).
- **Search:** pure client-side filter over `projects.json` (name, slug, languages,
  description, tags). No backend.

## Data flow & publishing

`scripts/publish.mjs` (dependency-free Node) copies a project's `.code-map/code-map.json`
(+ `git-history.json`) into `data/<slug>/`, optionally writes a `meta.json`
(human name/description/tags), and regenerates `projects.json`. `projects.json` is
**fully derived** from `data/` — deletable and rebuildable via `reindex`. Per-entry
metadata (`metaFor`) comes straight from each map's `project` object: name,
languages, file/declaration/layer/flow/edge counts, git, and a `refined` flag
(`!!project.architecture`, i.e. Phase-2 ran).

## Viewer sync (chosen: GitHub Action copy)

`sync-viewer.yml` checks out `MollyAI/code-map` (public → no token) and rsyncs
`viewer/` into the gallery (excluding `src/test/`, `jsconfig.json`), committing on
change. **Manual `workflow_dispatch`** by default (the user controls when), pulling
the plugin's `main`; a weekly cron is available but commented out. Prerequisite: the
viewer change must be on the plugin's `main` before syncing, or the sync would pull a
pre-v1.5.2 viewer.

Alternatives considered: jsDelivr CDN (zero files copied, but external dependency +
cross-origin module loading) and git submodule (finicky Pages support). Same-origin
CI copy was chosen for simplicity, speed, and no external runtime dependency.

## Security

The plugin being public carries no risk (no secrets; it's meant to be installed).
The real consideration is **published data**: `code-map.json` reveals structure,
paths, symbol names, and descriptions; `git-history.json` reveals commit authors,
emails, and messages. Policy: only publish maps of public-safe repos; `--no-history`
omits the commit sidecar.

## Out of scope (YAGNI)

No backend/database, no auth, no per-project thumbnails or screenshots, no automatic
crawling of repos, no analytics. Publishing is an explicit, manual, per-project act.

## Inaugural content

Seeded with code-map's own architecture (`data/code-map/`), generated by Phase-1
extraction (`analyze --skip eval`). It is **unrefined** (no Phase-2 descriptions/
layering yet) and flagged `refined: false`; running `/code-map:build` on code-map and
re-publishing upgrades it to a polished map.
