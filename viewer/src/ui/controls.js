// --------------------------------------------------------------------
// ui/controls — wires the topbar controls (layer/flow grouping, theme,
// font size, language), the left flow sidebar (a vertical flow list +
// collapse/expand), and the window resize re-layout. Settings persist via
// createSettings with the verbatim keys (grouping/theme/font-size/lang,
// + flow-collapsed) — red line #7. Structural changes go through setState
// (→ the renderApp subscription); the initial apply() runs before load()
// and mutates state directly (no render yet). Was the initGrouping/
// initTheme/initFontSize/initLang IIFEs.
// --------------------------------------------------------------------

import { state, setState } from '../store.js';
import { createSettings, migrateGrouping } from '../settings.js';
import { makeLayout } from '../layout/metrics.js';
import { applyI18nStatic, pickBilingual, t } from '../i18n.js';
import { diagramOf } from '../data/diagram.js';
import { compileDiagram } from '../diagram/mermaid-compile.js';
import { copyImageToClipboard } from '../export/png.js';

const settings = createSettings();

/** Resolve a flow's `name`/`description` for the active language. Prefers
 *  explicit bilingual fields (`<base>_zh` / `<base>_en`) and otherwise splits a
 *  combined "中文 · English" string — so the sidebar never mixes the two
 *  languages in one line (red line: show only the chosen language).
 * @param {any} f @param {string} base @param {string} lang */
function flowField(f, base, lang) {
  return pickBilingual(f, base, lang);
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

/** @param {EventTarget | null} target */
function closestButton(target) {
  return target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('button')) : null;
}

/**
 * @param {any} els
 * @param {import('../render/backend.js').RenderBackend} backend
 */
export function initControls(els, backend) {
  // The copy button is mode-aware (Mermaid source in flow, PNG image in layer);
  // its tooltip tracks the active mode + language. Declared at function scope so
  // both the grouping (mode switch) and language IIFEs can refresh it. Hoisted.
  function refreshCopyTitle() {
    if (!els.copyBtn) return;
    els.copyBtn.title = t(state.activeView === 'flow' ? 'copy_mermaid' : 'copy_image', state.lang);
  }

  // grouping: layer bands / flow pipeline — persisted, migrates legacy "subsystem".
  (function initGrouping() {
    // Reflect flow mode onto the layout chrome: show the left flow sidebar
    // unless the user collapsed it. The sidebar/expand-handle visibility +
    // canvas margin are driven by the .flow-active / .flow-open classes in CSS.
    function applyFlowChrome() {
      const isFlow = state.activeView === 'flow';
      els.layout.classList.toggle('flow-active', isFlow);
      els.layout.classList.toggle('flow-open', isFlow && !state.flowSidebarCollapsed);
    }
    /** @param {string} mode */
    function apply(mode) {
      state.activeView = migrateGrouping(mode);
      for (const btn of els.groupToggle.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.group === state.activeView);
      applyFlowChrome();
    }
    state.flowSidebarCollapsed = settings.get('flow-collapsed') === 'true';
    apply(settings.get('grouping', 'layer') || 'layer');

    // Switching mode resets the viewport to 100% + top-left aligned (the load
    // resting state). The flow sidebar's 280ms margin transition changes the
    // canvas width *after* this render, so we (1) freeze the live ResizeObserver
    // rescale via state.viewTransitioning — the font size stays constant through
    // the slide instead of being scaled frame-by-frame against a now-stale
    // baseWidth — and (2) re-lay-out once at the settled width + re-home when it
    // lands. Clicking the already-active mode is a no-op (no churn, no rescale).
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let settleT;
    const TRANSITION_SETTLE_MS = 320;   // a touch past the .canvas-wrap margin transition (280ms)
    els.groupToggle.addEventListener('click', (/** @type {Event} */ ev) => {
      const b = closestButton(ev.target); if (!b) return;
      const next = migrateGrouping(b.dataset.group || 'layer');
      if (next === state.activeView) return;
      apply(next); settings.set('grouping', state.activeView);
      refreshCopyTitle();   // copy button now means the other thing (source ⇄ image)
      state.selected = null;
      state.zoom = 1;
      state.viewTransitioning = true;
      setState({});
      requestAnimationFrame(() => backend.goHome());
      clearTimeout(settleT);
      settleT = setTimeout(() => {
        state.viewTransitioning = false;
        setState({});
        requestAnimationFrame(() => backend.goHome());
      }, TRANSITION_SETTLE_MS);
    });
    // pick a flow from the left sidebar list
    els.flowList.addEventListener('click', (/** @type {Event} */ ev) => {
      const item = ev.target instanceof Element ? ev.target.closest('.flow-item') : null;
      if (!item) return;
      const id = /** @type {HTMLElement} */ (item).dataset.flow;
      if (!id || id === state.activeFlow) return;
      state.activeFlow = id; state.selected = null;
      // On narrow screens the full-width flow list covers the diagram — collapse
      // it so picking a flow reveals the diagram. Transient (not persisted, so a
      // user's explicit collapse preference isn't overwritten). Desktop unchanged.
      if (window.matchMedia('(max-width: 900px)').matches) {
        state.flowSidebarCollapsed = true; applyFlowChrome();
      }
      setState({});
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
      // Layer mode recolours via CSS, but a Mermaid flow bakes its theme into
      // the rendered SVG — re-render so it picks up the new light/dark theme.
      if (state.raw && state.activeView === 'flow') setState({});
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
      refreshCopyTitle();   // mode-aware title isn't a static data-i18n-title — set it after
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

  // copy button: always present in both modes (so a mode switch never reflows
  // the topbar). Its action is mode-aware — copy the active flow's compiled
  // Mermaid source in flow mode (interop: paste into GitHub / mermaid.live), or
  // copy the layer map as a PNG image to the clipboard in layer mode.
  (function initCopy() {
    const btn = els.copyBtn;
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (btn.getAttribute('aria-busy') === 'true') return;
      btn.setAttribute('aria-busy', 'true');
      try {
        if (state.activeView === 'flow') {
          const f = state.flowsById.get(state.activeFlow);
          const dg = f && diagramOf(f, state.classById);
          if (!dg) return;
          const { def } = compileDiagram(dg, state.classById, state.lang);
          await navigator.clipboard.writeText(def);
        } else {
          await copyImageToClipboard(backend.getSvg());
        }
        btn.classList.add('copied');
        btn.title = t('copied', state.lang);
        setTimeout(() => { btn.classList.remove('copied'); refreshCopyTitle(); }, 1200);
      } catch (err) {
        console.error('[code-map] copy failed:', err);
      } finally {
        btn.removeAttribute('aria-busy');
      }
    });
  })();
}
