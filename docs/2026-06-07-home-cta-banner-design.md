# Design — home page "build your own code map" CTA banner

Date: 2026-06-07 · Status: approved (not yet implemented)

## Goal

Promote the [code-map](https://github.com/MollyAI/code-map) plugin to gallery
visitors: after browsing example maps, a visitor should see a clear call to
action to **build a code map for their own project**, told that the plugin is
**free and open source**, with a link to the GitHub repo.

## Key constraint (shapes the whole design)

The original request was "add the ad to the home page *and every project detail
page*." But a project **detail page is the viewer** (`viewer/index.html?project=<slug>`),
which is **synced verbatim** from `MollyAI/code-map` via `sync-viewer.yml`
(`rsync -a --delete`). Any file added under `viewer/` would be deleted on the next
sync; any edit to `viewer/index.html` / `style.css` would be overwritten. The
repo's hard invariant is **"never hand-edit `viewer/`."**

**Decision (with the user): the CTA lives on the home page only.** The detail page
(the viewer) stays untouched. Putting the ad in the viewer would also require a
plugin-side change that would surface during local `code-map serve` — out of scope
and the wrong place for a gallery ad.

## Scope

Three gallery-owned files only:

- `index.html` — add the static banner markup.
- `landing.css` — add scoped `.cta` styles.
- `landing.js` — add bilingual strings + wire them in `applyLang()`.

**Not touched:** `viewer/`, `scripts/publish.mjs`, `projects.json`, `data/`.

## Component

A full-width CTA section placed inside `<main class="landing-main">`, **below**
the gallery grid (`.gallery`) and the `.gallery-note`:

```
╔══════════════════════════════════════════════╗
║  为你的项目构建 code map                          ║
║  code map 是免费、开源的插件 —— 把任意代码库          ║
║  变成可交互的架构地图。       [ ⌥ 在 GitHub 查看 ↗ ]  ║
╚══════════════════════════════════════════════╝
```

- **Always visible.** The banner is static markup in `index.html`, independent of
  `projects.json`. It shows even when the gallery is empty, loading, or failed —
  it is not rendered by the JS gallery pipeline, so `render()`'s early returns
  don't affect it.
- **Link target:** the button is
  `<a href="https://github.com/MollyAI/code-map" target="_blank" rel="noopener noreferrer">`
  with an inline GitHub mark SVG. New tab so the visitor doesn't lose the gallery.

## Bilingual copy

Reuses the existing EN/ZH mechanism: three keys added to `STR.en` and `STR.zh`
in `landing.js`, written into the banner's elements (by `id`) inside `applyLang()`
— exactly how `hero-tagline` and the `search` placeholder are already handled.

| key | EN | ZH |
|---|---|---|
| `cta_title` | Build a code map for your project | 为你的项目构建 code map |
| `cta_desc` | code map is a free, open-source plugin — turn any codebase into an interactive architectural map. | code map 是免费、开源的插件 —— 把任意代码库变成可交互的架构地图。 |
| `cta_btn` | View on GitHub | 在 GitHub 查看 |

The button label is set via `textContent` on a span inside the `<a>` so the SVG
icon is preserved. Element ids: `cta-title`, `cta-desc`, `cta-btn-label`.

## Styling

New rules appended to `landing.css`, all selectors prefixed `.cta` so nothing
bleeds into the viewer (which shares `style.css` tokens). Reuse existing design
tokens only — no new colors or fonts:

- `.cta` — full-width card: `var(--bg-1)` background, `1px solid var(--line)`,
  `border-radius: 12px`, generous padding, top margin separating it from the grid.
- `.cta-title` — `var(--font-display)`, `var(--text-0)`.
- `.cta-desc` — `var(--font-ui)`, `var(--text-2)`.
- `.cta-btn` — accent button: `var(--accent)` background, hover with slight
  `translateY` + `box-shadow` glow, echoing the `.card:hover` interaction. Mono
  font for the label to match the gallery's chips/stats.

Responsive: on wide screens title/desc sit left with the button on the right;
on narrow screens it stacks (flex with `flex-wrap`), consistent with the grid's
`auto-fill` responsiveness.

## Invariant compliance

- ✅ Never hand-edits `viewer/`.
- ✅ Never hand-edits `projects.json`.
- ✅ No build step, no dependencies — stays native ESM/CSS.
- ✅ Coupling contract with the viewer is unaffected (no imported symbols change).

## Out of scope (YAGNI)

No detail-page ad (see constraint above), no analytics/click tracking, no
dismissible/remember-state logic, no new icons beyond a single inline GitHub mark,
no changes to the publish pipeline.
