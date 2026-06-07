---
description: Clone a GitHub repo (full history), build its code-map, and publish it to this gallery — adds a new project or updates an existing one in one step.
argument-hint: "<github-url> [--name \"Display Name\"] [--desc \"one line\"] [--branch <branch>]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /add-code-map

You are publishing a GitHub project into this code-map gallery. Given a repo URL,
you will: full-clone it (preserving all commit history), build its code-map,
generate the commit-history sidecar, copy the result into `data/<slug>/`, and
commit + push so GitHub Pages redeploys. Re-running with the same repo **updates**
it (pull + rebuild + republish) — there is no separate update command.

**The argument string is:** `$ARGUMENTS`

Work through the steps below in order. Each `Bash` call starts back at this repo's
root (the working directory does **not** persist between calls), so always use the
absolute `$CACHE` / `$PLUGIN_ROOT` paths you resolve here — never `cd` and rely on
it sticking.

---

## 1. Parse the arguments

From `$ARGUMENTS`, extract:

- **`URL`** — the first token. Accept any of: `https://github.com/owner/repo`,
  `…/repo.git`, `git@github.com:owner/repo.git`, or bare `owner/repo`. Reject
  anything that isn't a GitHub repo and stop with a clear message.
- **`OWNER` / `REPO`** — parsed from the URL (strip a trailing `.git`).
- **`SLUG`** — kebab-cased `REPO`: lowercase, non-`[a-z0-9._-]` → `-`, collapse
  repeats, trim leading/trailing `-`/`.`.
- **`CLONE_URL`** — normalize to `https://github.com/OWNER/REPO.git`.
- Optional overrides (anywhere after the URL): `--name "…"`, `--desc "…"`,
  `--branch <b>`. Hold these; `--name`/`--desc` win over GitHub metadata, and
  `--branch` overrides the default branch for the clone/update.

Set, for use in every later step:

```
CACHE="$HOME/.cache/code-map-showcase/$SLUG"      # lives OUTSIDE this repo — never committed
```

## 2. Full-clone or update the repo (preserve git history)

A **full** clone (no `--depth`) is required so the whole commit history is present
for the sidecar in step 5.

- **First time** (`$CACHE` doesn't exist): `git clone "$CLONE_URL" "$CACHE"`. If
  `--branch` was given, add `--branch <b>`.
- **Update** (`$CACHE` exists): fast-forward it to the latest default branch —
  ```bash
  git -C "$CACHE" fetch --prune origin
  DEF="$(git -C "$CACHE" remote show origin | sed -n 's/.*HEAD branch: //p')"   # or the --branch override
  git -C "$CACHE" checkout "$DEF"
  git -C "$CACHE" reset --hard "origin/$DEF"
  ```

Record whether `data/$SLUG/` already exists in this repo **now** (before publishing)
— that decides the commit verb in step 8 (`add:` vs `update:`).

## 3. Fetch GitHub metadata (name + description)

Unless `--name`/`--desc` already supplied them, fetch the repo's name and
description. Try in order, taking the first that works:

1. `gh repo view "$OWNER/$REPO" --json name,description -q '.name + "\t" + (.description // "")'`
2. Fallback: `curl -fsSL "https://api.github.com/repos/$OWNER/$REPO"` and read
   `.name` / `.description` (parse with `node -e` — no `jq` dependency).
3. If both fail, use `REPO` as the name and an empty description; note it in the summary.

`--name` / `--desc` always override whatever was fetched. Call the results
`NAME` and `DESC`.

## 4. Build the code-map against the clone (Phase 1 + Phase 2)

The `/code-map:build` skill can't be reused directly — it runs `python … --root .`
in separate Bash calls, and `.` would resolve to *this* repo, not the clone. So
drive the plugin's Phase-1 scripts with an explicit absolute `--root`, then do
Phase 2 yourself.

**Locate the installed code-map plugin** (paths/version vary by machine):

```bash
ANALYZE="$(find "$HOME/.claude/plugins" -name analyze.py -path '*code-map*scripts*' 2>/dev/null | head -1)"
[ -n "$ANALYZE" ] || { echo "code-map plugin not found — is it installed?"; exit 1; }
PLUGIN_ROOT="$(cd "$(dirname "$ANALYZE")/.." && pwd)"
```

**Phase 1 (mechanical):** the scripts auto-resolve their own plugin root and the
grammar-wheel cache from their location, so no env vars are needed.

```bash
mkdir -p "$CACHE/.code-map"
python3 "$PLUGIN_ROOT/scripts/bootstrap.py" --root "$CACHE"
python3 "$PLUGIN_ROOT/scripts/analyze.py" --root "$CACHE" --out "$CACHE/.code-map/raw_structure.json"
```

This writes `$CACHE/.code-map/raw_structure.json` and `…/unresolved.json`.

**Phase 2 (semantic — your job):** `Read` `$PLUGIN_ROOT/commands/build.md` and follow
its **`## Phase 2: semantic refinement`** section *exactly*, with these path
substitutions, writing the final `$CACHE/.code-map/code-map.json`:

- every `.code-map/<file>` in build.md → `$CACHE/.code-map/<file>`
- every `${CLAUDE_PLUGIN_ROOT}` in build.md → `$PLUGIN_ROOT` (e.g. templates at
  `$PLUGIN_ROOT/templates/<name>.yml`)
- if `--branch`/a focus hint was relevant, treat it as build.md's `$1` focus hint;
  otherwise there is no focus hint.

That covers: architecture detection/swap, bilingual `description_zh`/`description_en`
for core declarations, unresolved triage, layer re-routing, and entry-point marking.

**Also stamp `project.git`** in the code-map.json you write, so the gallery card
shows the source commit (the analyzer may leave it unset):

```bash
git -C "$CACHE" rev-parse --abbrev-ref HEAD   # branch
git -C "$CACHE" rev-parse --short HEAD         # short
git -C "$CACHE" rev-parse HEAD                 # commit
```

Set `model.project.git = { "branch": <branch>, "short": <short>, "commit": <commit> }`.

## 5. Generate the commit-history sidecar

The code-map plugin does **not** emit `git-history.json`; the gallery viewer needs
it to render the commit-history sidebar. Generate it from the full clone (skip if a
build somehow already produced one):

```bash
[ -f "$CACHE/.code-map/git-history.json" ] || \
  node scripts/git-history.mjs "$CACHE" > "$CACHE/.code-map/git-history.json"
```

## 6. Publish into the gallery

From this repo's root:

```bash
node scripts/publish.mjs --from "$CACHE/.code-map" --slug "$SLUG" --name "$NAME" --desc "$DESC"
```

This copies `code-map.json` + `git-history.json` into `data/$SLUG/`, writes
`data/$SLUG/meta.json`, and rebuilds `projects.json`. (Omit `--name`/`--desc` flags
whose values are empty.)

## 7. Sanity-check the result

Confirm the build landed on the clone, not on this repo:

```bash
node -e 'const m=require("./data/'"$SLUG"'/code-map.json");if(!m.project)process.exit(1);if(m.project.name==="code-map-showcase"){console.error("BUILD TARGETED THE WRONG REPO");process.exit(2)}console.log("ok:",m.project.name)'
```

If this fails, stop and report — do **not** commit. (A failure here usually means
Phase 1 ran against the wrong `--root`.)

## 8. Commit and push (deploys to Pages)

Stage only the gallery outputs — never the clone (it's outside the repo anyway):

```bash
git add data/"$SLUG" projects.json
git commit -m "<verb>: $SLUG code-map"      # <verb> = "add" if data/$SLUG was new in step 2, else "update"
git push
```

Use this repo's current branch (`main`) — pushing to it is the intended trigger for
the GitHub Pages redeploy, and is the whole point of this command.

## 9. Summary

Print a short summary:

```
[/add-code-map] <verb> $SLUG  ($NAME)
  Source:  $CLONE_URL @ <short> (<branch>)
  Map:     data/$SLUG/code-map.json  ·  <N> commits in git-history.json
  Live:    https://mollyai.github.io/code-map-showcase/viewer/index.html?project=$SLUG
```

Mention if metadata fell back to defaults, or if any unresolved declarations
remain from Phase 2.

---

## Invariants (do not violate)

- **Never `git add` the clone.** It lives in `~/.cache/...`, outside this repo, and
  only `code-map.json` + `git-history.json` may enter `data/$SLUG/`.
- **Never hand-edit `viewer/` or `projects.json`.** `projects.json` is regenerated
  by `publish.mjs`; the viewer is plugin-owned.
- **Full clone only** (no `--depth`) — the commit history is the point.
- **Publish only public-safe maps.** These come from public GitHub repos, so the
  source is already public; still, don't publish a repo the user can't share.
