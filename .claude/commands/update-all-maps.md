---
description: Force-rebuild and republish EVERY project in the gallery with the newest installed code-map plugin — full Path-A builds (Phase 0/1/2 + arch score), then one batch commit + push.
argument-hint: "[--only <slug>[,<slug>…]] [--no-push]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, Agent
---

# /update-all-maps

Force-update every project currently published in this gallery: refresh each
clone, rebuild its code-map from scratch with the **newest installed plugin**
(full Path A — never incremental), re-score it, regenerate the sidecars, and
republish. One batch commit at the end (not one per project), then push so
GitHub Pages redeploys.

**The argument string is:** `$ARGUMENTS`
— `--only a,b` restricts to those slugs; `--no-push` stops before push.

This command **reuses `/add-code-map`'s procedure** (`.claude/commands/add-code-map.md`)
per project — read it first; the per-step substitutions below assume you know it.

---

## 1. Enumerate the fleet

Read `projects.json` → the list of `slug`s (honor `--only`). For each slug,
resolve its **clone URL**, first match wins:

1. `repo` field on the project's entry in `projects.json` (comes from
   `data/<slug>/meta.json`, written by `publish.mjs --repo`).
2. `git -C "$HOME/.cache/code-map-showcase/<slug>" remote get-url origin`
3. Neither → **skip the slug** and tell the user to re-add it once with
   `/add-code-map <url>` (that stamps `repo` into meta.json for next time).

Resolve the newest installed plugin once (same lookup as add-code-map step 4):

```bash
CODEMAP_BIN="$(find "$HOME/.claude/plugins/cache/code-map" -type f -path '*/bin/code-map' 2>/dev/null | sort -V | tail -1)"
PLUGIN_ROOT="$(cd "$(dirname "$CODEMAP_BIN")/.." && pwd)"
```

## 2. Rebuild every project — one subagent per slug, in parallel

Dispatch **one subagent per slug** (general-purpose, run them concurrently).
Each subagent executes `/add-code-map`'s steps with these deltas:

- **Step 2 (clone/update)** as written — fetch + hard-reset to the origin
  default branch. Full history stays (the clone was never shallow).
- **Skip step 3 (GitHub metadata)** — the existing `data/<slug>/meta.json`
  already holds the curated name/description; do not overwrite them.
- **Step 4 (build)** as written: full **Path A** per `$PLUGIN_ROOT/commands/build.md`
  (A1 wipes intermediates incl. `architecture.yml` — Phase 0 re-designs it),
  then the full Phase 2 routine **including the arch-score step**
  (`"$PLUGIN_ROOT/bin/code-map" score --data "$CACHE/.code-map/code-map.json" --write`,
  reviewed per `$PLUGIN_ROOT/skills/arch-score/SKILL.md`; a bounded `--adjust`
  only with whitelisted, documented evidence).
- Existing bilingual descriptions in the published `data/<slug>/code-map.json`
  may be **reused for declarations that still match the current code** — verify
  before carrying one over; write fresh ones for anything new or changed.
- Check the project's notes in the session memory directory (if available) for
  repo-specific pitfalls (skip-dirs, custom extraction drivers, layer designs)
  before Phase 0.
- **Step 6 (publish)** becomes:
  `node scripts/publish.mjs --from "$CACHE/.code-map" --slug <slug> --repo <CLONE_URL>`
  (no `--name`/`--desc` — meta.json survives untouched apart from `repo`).
- **Step 7 (sanity check)** as written. **Do NOT run step 8** — no per-project
  commit; the parent loop commits once at the end.

Subagents must report back: HEAD short + branch, decl/edge/file/layer/flow
counts, `score.total` (+ dimensions, top penalties, any adjustment), and
anything that needed a workaround.

## 3. Reindex, verify, commit once, push

After **all** subagents finish (concurrent `publish.mjs` runs can race on
`projects.json` — this final reindex is what makes the order/content correct):

```bash
node scripts/publish.mjs reindex
```

Verify before committing — every `data/<slug>/code-map.json` must have
`project.score`, `project.git`, `project.architecture`, and a `project.name`
that is not `code-map-showcase`; `projects.json` must be sorted by `score`
descending. If any project failed its rebuild, report it and **leave its old
data in place** (a stale map beats a broken one) — never commit a half-built map.

```bash
git add data projects.json
git commit -m "update: rebuild all code-maps (plugin v<X.Y.Z>)"
git push        # skip when --no-push
```

## 4. Summary

Print a per-project table: slug · HEAD short · decls · edges · score (was → now)
· adjusted? — plus any skipped slugs and why, and the Pages URL
https://mollyai.github.io/code-map-showcase/.

---

## Invariants (same as /add-code-map, plus)

- Full Path A only — `/update-all-maps` exists to force clean rebuilds; never
  take build.md's incremental Path B here.
- One batch commit for the whole fleet; never per-project commits.
- Never `git add` anything outside `data/` + `projects.json` from this command.
- A failed rebuild keeps its previous `data/<slug>/` — degrade to stale, never broken.
