# Home page CTA banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible "build a code map for your project — free & open source" CTA banner to the gallery home page, below the project grid, linking to https://github.com/MollyAI/code-map.

**Architecture:** Static banner markup in `index.html` (empty text elements with ids, mirroring the existing `hero-tagline` pattern), bilingual strings added to `landing.js`'s `STR` and written into those elements by the existing `applyLang()`, and scoped `.cta` styles appended to `landing.css` reusing the viewer's design tokens. The synced `viewer/` is not touched.

**Tech Stack:** Plain HTML + native ESM (`landing.js`) + native CSS (`landing.css`). No build step, no dependencies, no test framework — verification is `node --check` + a local static server + a browser visual pass (matching the repo's zero-dependency philosophy).

---

### Task 1: Add the banner markup to `index.html`

**Files:**
- Modify: `index.html` (insert before the closing `</main>` on line 52, after the `gallery-note` on line 51)

- [ ] **Step 1: Insert the CTA section**

Insert this block immediately after `<p class="gallery-note" id="gallery-note" hidden></p>` and before `</main>`:

```html
  <section class="cta" aria-labelledby="cta-title">
    <div class="cta-text">
      <h2 class="cta-title" id="cta-title"></h2>
      <p class="cta-desc" id="cta-desc"></p>
    </div>
    <a class="cta-btn" href="https://github.com/MollyAI/code-map" target="_blank" rel="noopener noreferrer">
      <svg class="cta-gh" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      <span id="cta-btn-label"></span>
    </a>
  </section>
```

Note: text elements are intentionally empty — `applyLang()` fills them (Task 2), exactly like the existing empty `<p ... id="hero-tagline"></p>`.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add home page CTA banner markup"
```

---

### Task 2: Add bilingual copy and wire it in `landing.js`

**Files:**
- Modify: `landing.js` — `STR.en` (around lines 20-27), `STR.zh` (around lines 30-37), and `applyLang()` (around lines 59-66)

- [ ] **Step 1: Add three keys to `STR.en`**

In the `en` object, after the `failed:` line, add:

```js
    cta_title: 'Build a code map for your project',
    cta_desc: 'code map is a free, open-source plugin — turn any codebase into an interactive architectural map.',
    cta_btn: 'View on GitHub',
```

- [ ] **Step 2: Add the same three keys to `STR.zh`**

In the `zh` object, after the `failed:` line, add:

```js
    cta_title: '为你的项目构建 code map',
    cta_desc: 'code map 是免费、开源的插件 —— 把任意代码库变成可交互的架构地图。',
    cta_btn: '在 GitHub 查看',
```

- [ ] **Step 3: Write the copy into the banner in `applyLang()`**

In `applyLang()`, after the line `$('search').placeholder = s.search;`, add:

```js
  $('cta-title').textContent = s.cta_title;
  $('cta-desc').textContent = s.cta_desc;
  $('cta-btn-label').textContent = s.cta_btn;
```

(`$('cta-btn-label')` is the `<span>` inside the `<a>`, so the GitHub SVG icon is preserved.)

- [ ] **Step 4: Syntax-check the module**

Run: `node --check landing.js`
Expected: no output, exit code 0 (a syntax error would print the offending line).

- [ ] **Step 5: Commit**

```bash
git add landing.js
git commit -m "feat: bilingual copy for the home CTA banner"
```

---

### Task 3: Style the banner in `landing.css`

**Files:**
- Modify: `landing.css` — append at end of file (after line 193)

- [ ] **Step 1: Append the `.cta` styles**

Append to the end of `landing.css`:

```css
/* ---------- CTA banner ---------- */
.cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 40px;
  padding: 26px 28px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.cta-text { min-width: 260px; flex: 1 1 340px; }
.cta-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.01em;
  color: var(--text-0);
  margin: 0;
}
.cta-desc {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 300;
  line-height: 1.5;
  color: var(--text-2);
  margin: 8px 0 0;
  max-width: 560px;
}
.cta-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 11px 18px;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.01em;
  color: var(--bg-0);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 9px;
  text-decoration: none;
  transition: transform 0.16s, box-shadow 0.16s, filter 0.16s;
}
.cta-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.06);
  box-shadow: 0 8px 24px -12px var(--accent);
}
.cta-gh { width: 16px; height: 16px; flex: 0 0 auto; }
```

- [ ] **Step 2: Commit**

```bash
git add landing.css
git commit -m "style: home CTA banner"
```

---

### Task 4: Verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Start a local static server**

Run: `python3 -m http.server 8080` (background it, or run in a spare terminal)

- [ ] **Step 2: Confirm the static markup is served**

Run: `curl -s http://localhost:8080/ | grep -c 'class="cta"'`
Expected: `1`

Run: `curl -s http://localhost:8080/ | grep -c 'href="https://github.com/MollyAI/code-map"'`
Expected: `1`

- [ ] **Step 3: Browser visual check** (open `http://localhost:8080/`)

Confirm by observation:
- The banner appears below the project grid, full width, always visible (scroll to bottom).
- EN default: title "Build a code map for your project", desc mentions "free, open-source", button "View on GitHub" with a GitHub mark icon.
- Click the language toggle → text switches to the ZH copy ("为你的项目构建 code map" / "在 GitHub 查看"); toggle back → EN. No empty text flash that persists.
- Toggle theme (dark ⇄ light) → banner background, border, text, and accent button all adapt via tokens (no hardcoded colors).
- Hover the button → slight lift + glow; clicking opens https://github.com/MollyAI/code-map in a new tab.
- Narrow the window → title/desc stack above the button (flex-wrap), nothing overflows.

- [ ] **Step 4: Stop the server**

Stop the `python3 -m http.server` process.

---

## Self-Review

**Spec coverage:**
- Home-page-only ad → Tasks 1-3 (index.html / landing.js / landing.css), viewer untouched ✓
- Below the grid, always visible → Task 1 placement + static markup ✓
- Free & open source messaging + GitHub link → Task 1 `href`, Task 2 copy ✓
- Bilingual via existing EN/ZH mechanism → Task 2 ✓
- Scoped `.cta` styles, reuse tokens only → Task 3 ✓
- New-tab link (`target="_blank" rel="noopener noreferrer"`) → Task 1 ✓
- Invariants (no viewer/, no projects.json, no deps) → only the three owned files touched ✓

**Placeholder scan:** No TBD/TODO; every code/markup step shows complete content. ✓

**Type/id consistency:** ids `cta-title`, `cta-desc`, `cta-btn-label` are defined in Task 1's markup and used verbatim in Task 2's `applyLang()` wiring; CSS classes `.cta`, `.cta-text`, `.cta-title`, `.cta-desc`, `.cta-btn`, `.cta-gh` in Task 3 match the class names in Task 1's markup. ✓
