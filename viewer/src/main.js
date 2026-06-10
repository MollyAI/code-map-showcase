// --------------------------------------------------------------------
// main — explicit boot orchestration. Replaces the original's reliance on
// source ordering ("initializers must run before load()"): here the order
// is spelled out — grab DOM, build the backend + UI pieces, wire the ctx,
// register views, init settings-backed controls (sets LAYOUT), subscribe
// the renderer, wire interactions, then load(). Was the bottom of the
// inline <script> (els, load/onLoaded, boot).
// --------------------------------------------------------------------

import { state, setState, subscribe } from './store.js';
import { loadModel } from './data/schema.js';
import { buildEdgeIndex, buildClassIndex, buildFlowIndex } from './data/index.js';
import { load } from './data/load.js';
import { createSvgBackend, CANVAS_PAD_L } from './render/backend.js';
import { registerBuiltinViews, renderApp } from './render/registry.js';
import { createSelection } from './interact/selection.js';
import { initZoom } from './interact/zoom.js';
import { initPan } from './interact/pan.js';
import { initKeyboard } from './interact/keyboard.js';
import { createTooltip } from './ui/tooltip.js';
import { createDetail } from './ui/detail.js';
import { renderLangStats } from './ui/langstats.js';
import { initControls, populateFlowList, populateCommitList, closeCommitSidebar, applyCommitChrome } from './ui/controls.js';
import { buildNodesByPath } from './data/githistory.js';
import { formatBuildInfo } from './ui/buildinfo.js';
import { initExport } from './export/png.js';
import { t } from './i18n.js';
import { escapeHtml } from './util.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const els = {
  svg: $('map'),
  detail: $('detail'),
  detailBody: $('detail-body'),
  tooltip: $('tooltip'),
  toggle: $('view-toggle'),
  groupToggle: $('group-toggle'),
  flowSidebar: $('flow-sidebar'),
  flowList: $('flow-list'),
  flowCollapse: $('flow-collapse'),
  flowExpand: $('flow-expand'),
  commitSidebar: $('commit-sidebar'),
  commitList: $('commit-list'),
  commitCollapse: $('commit-collapse'),
  commitExpand: $('commit-expand'),
  themeToggle: $('theme-toggle'),
  exportBtn: $('export-toggle'),
  langToggle: $('lang-toggle'),
  fontToggle: $('font-size-toggle'),
  canvasWrap: $('canvas-wrap'),
  projectName: $('project-name'),
  buildInfo: $('build-info'),
  langStats: $('lang-stats'),
  layout: /** @type {any} */ (document.querySelector('.layout')),
};

const backend = createSvgBackend(els.svg, els.canvasWrap);
const tooltip = createTooltip(els.tooltip);

// detail ⇆ selection are mutually referential; break the cycle with a holder
// filled right after selection is created (the late-bound calls only fire on
// user interaction, by which point `wiring` is complete).
/** @type {{ select?: (id: string) => void }} */
const wiring = {};
const detail = createDetail({
  detailBody: els.detailBody,
  canvasWrap: els.canvasWrap,
  onSelectTarget: (id) => wiring.select?.(id),
});
const selection = createSelection({ backend, renderDetail: detail.renderDetail, layoutEl: els.layout });
wiring.select = selection.select;

// Clicking a node while the commit sidebar is shown collapses it to its tab,
// clears the set-highlight, and selects the node (right detail opens). The full
// re-render re-fits the canvas to the recovered width and lets scene restore the
// single-node selection.
/** @param {string} id */
function selectFromMap(id) {
  if (state.commitSidebarOpen || state.highlightedNodeIds.size) {
    closeCommitSidebar(els);
    state.selected = (id === state.selected) ? null : id;
    setState({});
    return;
  }
  selection.select(id);
}
// Empty-canvas / Esc: clear an active commit highlight (keep the sidebar open so
// the user can pick another), else fall to the normal node deselect.
function deselect() {
  if (state.selectedCommit || state.highlightedNodeIds.size) {
    state.selectedCommit = null;
    state.highlightedNodeIds = new Set();
    populateCommitList(els);
    setState({});
    return;
  }
  selection.select(null);
}

const ctx = {
  state,
  handlers: {
    onSelect: selectFromMap,
    /** @param {string} id */
    onHover: (id) => { const e = state.nodeById.get(id); if (e) tooltip.show(e.datum); },
    onHoverEnd: tooltip.hide,
    onHoverMove: tooltip.position,
  },
  applySelection: selection.applySelection,
  applyHighlight: selection.applyHighlight,
  drawEdges: selection.drawEdges,
  renderDetail: detail.renderDetail,
  canvasWidth: () => els.canvasWrap.clientWidth - 2 * CANVAS_PAD_L,
  populateFlowList: () => populateFlowList(els),
};

/** @param {string} msg */
function showError(msg) {
  els.svg.outerHTML = `<div class="error-state">
    <div>${escapeHtml(t('error_load', state.lang))}</div>
    <code>${escapeHtml(msg)}

${escapeHtml(t('error_hint', state.lang))}</code>
  </div>`;
}

// Badge text/tooltip are language-dependent (arch score, branch/built labels),
// so this re-runs on every render — the language toggle re-renders via setState.
function renderBuildInfo() {
  if (!state.model) return;
  const bi = formatBuildInfo(state.model.project, state.lang);
  els.buildInfo.textContent = bi.text;
  els.buildInfo.title = bi.title;
  els.buildInfo.hidden = bi.hidden;
}

/** @param {any} json */
function onModel(json) {
  const model = /** @type {any} */ (loadModel(json));
  state.raw = model;
  state.model = model;
  els.projectName.textContent = model.project?.name || '—';
  document.title = model.project?.name || 'code map';
  renderBuildInfo();
  renderLangStats(model, els.langStats);

  const { edgesFromIdx, edgesToIdx } = buildEdgeIndex(model.edges || []);
  const { classById, hubIds } = buildClassIndex(model.layers || []);
  Object.assign(state, { edgesFromIdx, edgesToIdx, classById, hubIds });

  state.hasGit = !!(model.project && model.project.git);
  state.nodesByPath = buildNodesByPath(model.layers || []);
  applyCommitChrome(els);   // show the edge tab when git + layer mode

  const { flowsById, defaultFlowId } = buildFlowIndex(model, {
    classById, edgesFromIdx, hubIds, maxDepth: state.flowMaxDepth, activeFlow: state.activeFlow,
  });
  state.flowsById = flowsById;
  state.activeFlow = defaultFlowId;

  setState({});   // first render via the renderApp subscription
  // After the first render sizes the SVG, scroll past the pan gutter so the
  // diagram's top-left sits at the visible top-left (the gutter is overscroll
  // room for free dragging, not initial empty space).
  requestAnimationFrame(() => backend.goHome());
}

// --- boot, in explicit order ---
registerBuiltinViews();
initControls(els);                       // applies persisted settings + sets state.LAYOUT (before first render)
subscribe(() => { renderBuildInfo(); renderApp(backend, ctx); }); // register the renderer
initZoom(backend, els.canvasWrap);
initPan(els.canvasWrap, backend.getSvg(), deselect);
initKeyboard(deselect);
initExport({ svg: backend.getSvg(), exportBtn: els.exportBtn, projectNameEl: els.projectName });

load({ onModel, onError: showError });
