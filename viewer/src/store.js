// --------------------------------------------------------------------
// store — single source of app state + rAF-coalesced reactivity.
// Pure: imports nothing. Structural changes go through setState (one
// batched notify per frame); lightweight selection updates live in
// interact/selection.js and bypass the full-render subscription.
// --------------------------------------------------------------------

/** @typedef {Object} AppState */
export const state = /** @type {any} */ ({
  raw: null, model: null, view: 'core', activeView: 'layer',
  activeFlow: null, selected: null,
  flowSidebarCollapsed: false,  // left flow sidebar collapsed state (flow mode)
  hasGit: false,                // project.git present → commit sidebar available (layer mode)
  commitSidebarOpen: false,     // left commit-history sidebar open (default hidden)
  selectedCommit: null,         // hash of the highlighted commit, or null
  highlightedNodeIds: new Set(),// set-highlight: class ids changed by the selected commit
  gitHistory: null,             // { loaded, commits, error } — lazily fetched
  nodesByPath: new Map(),       // file path → [class id] (commit → nodes mapping)
  zoom: 1, fontScale: 1, fontSize: 'medium', lang: 'en',
  flowMaxDepth: 6,             // mirror of Python --flow-max-depth for client-side trace
  LAYOUT: null,                // current layout metrics (makeLayout(fontScale)); set in controls
  baseWidth: 0, baseHeight: 0, // SVG content dims at zoom=1
  classById: new Map(), flowsById: new Map(),
  nodeById: new Map(),         // id -> { datum, el, rectEl, x, y, w, h }
  hubIds: new Set(), edgesFromIdx: new Map(), edgesToIdx: new Map(),
});

/** @type {Set<(s: typeof state) => void>} */
const listeners = new Set();
let scheduled = false;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; listeners.forEach(fn => fn(state)); });
}

/** @param {Partial<typeof state>} patch */
export function setState(patch) { Object.assign(state, patch); schedule(); }

/** @param {(s: typeof state) => void} fn @returns {() => void} */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
