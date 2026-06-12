// --------------------------------------------------------------------
// ui/controls — wires the topbar controls (core/all view, layer/flow
// grouping, theme, font size, language), the left flow sidebar (a vertical
// flow list + collapse/expand), and the window resize re-layout. Settings
// persist via createSettings with the verbatim keys (view/grouping/theme/
// font-size/lang, + flow-collapsed) — red line #7. Structural changes go
// through setState (→ the renderApp subscription); the initial apply() runs
// before load() and mutates state directly (no render yet). Was the
// initView/initGrouping/initTheme/initFontSize/initLang IIFEs.
// --------------------------------------------------------------------

import { state, setState } from '../store.js';
import { createSettings, migrateGrouping } from '../settings.js';
import { makeLayout } from '../layout/metrics.js';
import { applyI18nStatic, pickLangText, t } from '../i18n.js';
import { loadGitHistory, nodeIdsForCommit } from '../data/githistory.js';
import { diagramOf } from '../data/diagram.js';

const settings = createSettings();

/** Resolve a flow's `name`/`description` for the active language. Prefers
 *  explicit bilingual fields (`<base>_zh` / `<base>_en`) and otherwise splits a
 *  combined "中文 · English" string — so the sidebar never mixes the two
 *  languages in one line (red line: show only the chosen language).
 * @param {any} f @param {string} base @param {string} lang */
function flowField(f, base, lang) {
  const zh = f[base + '_zh'];
  const en = f[base + '_en'];
  if (zh || en) return lang === 'zh' ? (zh || en) : (en || zh);
  return pickLangText(f[base], lang);
}

/** unix 秒 → 本地 "YYYY-MM-DD HH:mm"(与构建徽章一致的分钟精度)。@param {number} sec */
function fmtCommitTime(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Fill the left flow sidebar list from state.flowsById; highlight the active
 *  flow. Each item shows the flow name + (when present) its description, in the
 *  active language only.
 * @param {any} els */
export function populateFlowList(els) {
  const list = els.flowList;
  if (!list) return;
  const prevScroll = list.scrollTop;   // preserve scroll across the full rebuild
  list.innerHTML = '';                 // so re-selecting doesn't jump the list up
  const lang = state.lang;
  for (const f of state.flowsById.values()) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'flow-item' + (f.id === state.activeFlow ? ' active' : '');
    item.dataset.flow = f.id;
    const dg = diagramOf(f, state.classById);
    if (dg) {
      const mark = document.createElement('span');
      mark.className = 'flow-item-kind';
      mark.textContent = dg.type === 'pipeline' ? '▤' : '⇅';
      item.appendChild(mark);
    }
    const name = document.createElement('span');
    name.className = 'flow-item-name';
    name.textContent = flowField(f, 'name', lang) || f.name || f.id;
    item.appendChild(name);
    const descText = flowField(f, 'description', lang);
    if (descText) {
      const desc = document.createElement('span');
      desc.className = 'flow-item-desc';
      desc.textContent = descText;
      item.appendChild(desc);
    }
    list.appendChild(item);
  }
  list.scrollTop = prevScroll;
}

/** Toggle the commit sidebar chrome classes. Active only in layer mode with git.
 * @param {any} els */
export function applyCommitChrome(els) {
  const active = state.activeView === 'layer' && state.hasGit;
  els.layout.classList.toggle('commit-active', active);
  els.layout.classList.toggle('commit-open', active && state.commitSidebarOpen);
}

/** Close the commit sidebar back to its edge tab and clear its highlight/state.
 *  Does NOT re-render — the caller decides (node-click vs collapse button).
 * @param {any} els */
export function closeCommitSidebar(els) {
  state.commitSidebarOpen = false;
  state.selectedCommit = null;
  state.highlightedNodeIds = new Set();
  applyCommitChrome(els);
}

/** Render the commit list from state.gitHistory; reflect the active commit and
 *  loading/empty/error states.
 * @param {any} els */
export function populateCommitList(els) {
  const list = els.commitList;
  if (!list) return;
  const prevScroll = list.scrollTop;   // preserve scroll across the full rebuild
  list.innerHTML = '';
  const lang = state.lang;
  const gh = state.gitHistory;
  if (!gh || !gh.loaded) {
    const p = document.createElement('div'); p.className = 'commit-note';
    p.textContent = t('commits_loading', lang); list.appendChild(p); return;
  }
  if (!gh.commits.length) {
    const p = document.createElement('div'); p.className = 'commit-note';
    p.textContent = t('commits_empty', lang); list.appendChild(p); return;
  }
  for (const c of gh.commits) {
    const ids = nodeIdsForCommit(c, state.nodesByPath);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'commit-item'
      + (c.hash === state.selectedCommit ? ' active' : '')
      + (ids.size ? '' : ' no-match');
    item.dataset.hash = c.hash;
    const name = document.createElement('span');
    name.className = 'commit-item-name';
    name.textContent = `${c.short} · ${fmtCommitTime(c.time)}`;
    item.appendChild(name);
    if (c.subject) {
      const desc = document.createElement('span');
      desc.className = 'commit-item-desc';
      desc.textContent = c.subject;
      item.appendChild(desc);
    }
    if (c.hash === state.selectedCommit && !ids.size) {
      const note = document.createElement('span');
      note.className = 'commit-note';
      note.textContent = t('commit_no_mapped', lang);
      item.appendChild(note);
    }
    list.appendChild(item);
  }
  list.scrollTop = prevScroll;
}

/** @param {EventTarget | null} target */
function closestButton(target) {
  return target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('button')) : null;
}

/** @param {any} els */
export function initControls(els) {
  // view mode: core / all — persisted.
  (function initView() {
    /** @param {string} mode */
    function apply(mode) {
      state.view = (mode === 'all') ? 'all' : 'core';
      for (const btn of els.toggle.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.mode === state.view);
    }
    apply(settings.get('view', 'core') || 'core');
    els.toggle.addEventListener('click', (/** @type {Event} */ ev) => {
      const b = closestButton(ev.target); if (!b) return;
      apply(b.dataset.mode || 'core'); settings.set('view', state.view); setState({});
    });
  })();

  // grouping: layer bands / flow pipeline — persisted, migrates legacy "subsystem".
  (function initGrouping() {
    // Reflect flow mode onto the layout chrome: hide the core/all toggle (no
    // such concept in flow mode) and show the left flow sidebar unless the user
    // collapsed it. The sidebar/expand-handle visibility + canvas margin are
    // driven by the .flow-active / .flow-open classes in CSS.
    function applyFlowChrome() {
      const isFlow = state.activeView === 'flow';
      els.toggle.hidden = isFlow;
      els.layout.classList.toggle('flow-active', isFlow);
      els.layout.classList.toggle('flow-open', isFlow && !state.flowSidebarCollapsed);
    }
    /** @param {string} mode */
    function apply(mode) {
      state.activeView = migrateGrouping(mode);
      for (const btn of els.groupToggle.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.group === state.activeView);
      applyFlowChrome();
      if (state.activeView !== 'layer') closeCommitSidebar(els);
      applyCommitChrome(els);
    }
    state.flowSidebarCollapsed = settings.get('flow-collapsed') === 'true';
    apply(settings.get('grouping', 'layer') || 'layer');
    els.groupToggle.addEventListener('click', (/** @type {Event} */ ev) => {
      const b = closestButton(ev.target); if (!b) return;
      apply(b.dataset.group || 'layer'); settings.set('grouping', state.activeView);
      state.selected = null; setState({});
    });
    // pick a flow from the left sidebar list
    els.flowList.addEventListener('click', (/** @type {Event} */ ev) => {
      const item = ev.target instanceof Element ? ev.target.closest('.flow-item') : null;
      if (!item) return;
      const id = /** @type {HTMLElement} */ (item).dataset.flow;
      if (!id || id === state.activeFlow) return;
      state.activeFlow = id; state.selected = null; setState({});
    });
    // collapse / expand the sidebar (slide mirrors the right detail panel); a
    // setState re-layouts the canvas for its new width.
    els.flowCollapse.addEventListener('click', () => {
      state.flowSidebarCollapsed = true; settings.set('flow-collapsed', 'true');
      applyFlowChrome(); setState({});
    });
    els.flowExpand.addEventListener('click', () => {
      state.flowSidebarCollapsed = false; settings.set('flow-collapsed', 'false');
      applyFlowChrome(); setState({});
    });
  })();

  // commit-history sidebar (layer mode + git): edge-tab opens it; clicking a
  // commit set-highlights its changed classes; collapse clears the highlight.
  (function initCommitSidebar() {
    if (!els.commitExpand) return;
    applyCommitChrome(els);
    els.commitExpand.addEventListener('click', () => {
      state.commitSidebarOpen = true;
      applyCommitChrome(els);
      setState({});                       // re-fit canvas for the new margin
      populateCommitList(els);            // shows "loading…" until the fetch lands
      loadGitHistory().then(() => populateCommitList(els));
    });
    els.commitCollapse.addEventListener('click', () => {
      closeCommitSidebar(els);
      populateCommitList(els);
      setState({});                       // resting view (scene clears highlight)
    });
    els.commitList.addEventListener('click', (/** @type {Event} */ ev) => {
      const item = ev.target instanceof Element ? ev.target.closest('.commit-item') : null;
      if (!item) return;
      const hash = /** @type {HTMLElement} */ (item).dataset.hash;
      if (!hash) return;
      if (hash === state.selectedCommit) {          // toggle off
        state.selectedCommit = null; state.highlightedNodeIds = new Set();
      } else {
        const commit = (state.gitHistory?.commits || []).find((/** @type {any} */ c) => c.hash === hash);
        state.selectedCommit = hash;
        state.highlightedNodeIds = commit ? nodeIdsForCommit(commit, state.nodesByPath) : new Set();
      }
      populateCommitList(els);            // reflect active + no-match note
      setState({});                       // scene → applyHighlight
    });
  })();

  // resize re-layout (debounced).
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (state.raw) setState({}); }, 120);
  });

  // theme: localStorage > system preference > dark.
  (function initTheme() {
    /** @param {string} theme */
    function apply(theme) { document.body.classList.toggle('light', theme === 'light'); }
    const stored = settings.get('theme');
    const systemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    apply(stored || (systemLight ? 'light' : 'dark'));
    /** @type {ReturnType<typeof setTimeout> | null} */
    let crossfadeTimer = null;
    els.themeToggle.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      document.body.classList.add('theme-switching');
      apply(next); settings.set('theme', next);
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      crossfadeTimer = setTimeout(() => document.body.classList.remove('theme-switching'), 450);
    });
  })();

  // font size: small / medium / large — drives --fs-scale and the JS LAYOUT.
  (function initFontSize() {
    /** @type {Record<string, number>} */
    const SCALES = { small: 0.875, medium: 1, large: 1.125 };
    /** @param {string} size */
    function apply(size) {
      const next = (size in SCALES) ? size : 'medium';
      state.fontSize = next;
      state.fontScale = SCALES[next];
      state.LAYOUT = makeLayout(state.fontScale);
      document.body.classList.toggle('fs-small', next === 'small');
      document.body.classList.toggle('fs-large', next === 'large');
      for (const btn of els.fontToggle.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.size === next);
    }
    apply(settings.get('font-size', 'medium') || 'medium');
    els.fontToggle.addEventListener('click', (/** @type {Event} */ ev) => {
      const b = closestButton(ev.target); if (!b) return;
      apply(b.dataset.size || 'medium'); settings.set('font-size', state.fontSize);
      if (state.raw) setState({});   // re-layout SVG so node boxes follow the new scale
    });
  })();

  // language: localStorage > browser language > en.
  (function initLang() {
    /** @param {string} lang */
    function apply(lang) {
      state.lang = (lang === 'zh' || lang === 'en') ? lang : 'en';
      els.langToggle.textContent = state.lang === 'zh' ? '中' : 'EN';
      applyI18nStatic(document, state.lang);
    }
    const stored = settings.get('lang');
    const browserZh = navigator.language && navigator.language.startsWith('zh');
    apply(stored || (browserZh ? 'zh' : 'en'));
    els.langToggle.addEventListener('click', () => {
      const next = state.lang === 'en' ? 'zh' : 'en';
      apply(next); settings.set('lang', next);
      if (state.raw) setState({});   // re-render map + detail in the new language
    });
  })();
}
