# code-map-showcase

A static gallery of [**code-map**](https://github.com/MollyAI/code-map) outputs — interactive
architectural maps of real codebases, published as a free GitHub Pages site.

**Live:** https://mollyai.github.io/code-map-showcase/

The home page is a centered search over the published projects; clicking one opens
that project's map in the exact same viewer the code-map plugin serves locally.

## How it works

```
index.html · landing.css · landing.js   the gallery home (this repo owns it)
projects.json                           the project index (generated, never hand-edited)
data/<slug>/code-map.json               one project's map — the only per-project payload
data/<slug>/meta.json                   optional human name/description/tags
viewer/                                 the code-map viewer (synced from the plugin, never hand-edited)
scripts/publish.mjs                     add/update/remove a project + rebuild projects.json
```

The viewer is a pure static app: it fetches `code-map.json` over a relative path.
When opened as `viewer/index.html?project=<slug>` it reads `data/<slug>/…`; with no
`?project=` it behaves exactly as in local `code-map` serving. That single `?project=`
convention (plugin ≥ v1.5.2) is the entire integration surface. (The published
`code-map.json` is web-slimmed by `publish.mjs`; no other data file is fetched.)

## Publish a project

1. In the target project, run `/code-map:build` (the code-map plugin) to produce
   `.code-map/code-map.json`.
2. Here, copy it in and rebuild the index:
   ```bash
   node scripts/publish.mjs --from /path/to/project/.code-map
   # options: --slug my-app  --name "My App"  --desc "…"
   ```
3. `git add . && git commit -m "publish: my-app" && git push` — Pages redeploys automatically.

> ⚠️ Only publish maps of repositories you're comfortable making **public**.
> `code-map.json` exposes file paths, symbol names, and descriptions.
> Don't publish maps of private/proprietary code.

Other commands:
```bash
node scripts/publish.mjs reindex        # just rebuild projects.json from data/
node scripts/publish.mjs slim           # re-slim existing code-map.json in place
node scripts/publish.mjs remove my-app  # drop a project
```

## Keep the viewer in sync

The viewer lives canonically in `MollyAI/code-map`. When the plugin ships a viewer
change, update the gallery's copy via **Actions → "Sync viewer from plugin" → Run workflow**
(pulls `viewer/` from the plugin's `main`). Nothing in this repo hand-edits `viewer/`.

## License

MIT
