// --------------------------------------------------------------------
// interact/selection — the lightweight selection path. Selecting/hovering
// does NOT go through setState's full re-render (that would rebuild the
// whole SVG on every click — a perf regression on large maps); instead it
// toggles classes (backend.applyVisualState) and redraws only the selected
// node's edges. Was selectNode / applySelection / drawEdges in index.html.
// --------------------------------------------------------------------

import { state } from '../store.js';
import { buildEdgePath, flowEdgeClass } from '../render/edges.js';
import { NS } from '../render/backend.js';

/**
 * @param {object} deps
 * @param {import('../render/backend.js').RenderBackend} deps.backend
 * @param {(c: any) => void} deps.renderDetail
 * @param {HTMLElement} deps.layoutEl
 */
export function createSelection({ backend, renderDetail, layoutEl }) {
  // The set of node ids kept lit for the current selection (the selected id
  // included). Layer mode: the selected node's direct graph neighbours. Flow
  // mode: the slice of the flow that runs THROUGH the selected node — its
  // ancestors up to the seed plus its whole subtree — so the highlight always
  // reads as one continuous chain rather than the disconnected "bright islands
  // over a dimmed flow" that selecting on the global edge index produced.
  /** @param {string} id @returns {Set<string>} */
  function highlightSet(id) {
    if (state.activeView === 'flow') return flowHighlight(id);
    const set = new Set([id]);
    for (const e of (state.edgesFromIdx.get(id) || [])) set.add(e.to);
    for (const e of (state.edgesToIdx.get(id) || [])) set.add(e.from);
    return set;
  }

  /** Ancestors (single parent chain to the seed) + the subtree below `id`,
   *  walked over the active flow's own edges. @param {string} id @returns {Set<string>} */
  function flowHighlight(id) {
    const set = new Set([id]);
    const flow = state.flowsById.get(state.activeFlow);
    if (!flow || !Array.isArray(flow.edges)) return set;
    /** @type {Map<string, string>} */
    const parent = new Map();
    /** @type {Map<string, string[]>} */
    const children = new Map();
    for (const e of flow.edges) {
      parent.set(e.to, e.from);
      if (!children.has(e.from)) children.set(e.from, []);
      /** @type {string[]} */ (children.get(e.from)).push(e.to);
    }
    let p = parent.get(id);
    while (p && !set.has(p)) { set.add(p); p = parent.get(p); }
    const stack = [id];
    while (stack.length) {
      const u = /** @type {string} */ (stack.pop());
      for (const v of (children.get(u) || [])) if (!set.has(v)) { set.add(v); stack.push(v); }
    }
    return set;
  }

  // Layer mode: rebuild #edges with just the selected node's in/out edges (the
  // deliberate anti-hairball design). Flow mode: the flow renderer already drew
  // the edges, so re-style them in place — edges touching a dimmed node dim WITH
  // it (a disabled item's connectors should read as disabled too), and only the
  // selected slice stays lit. With no selection both modes fall to a calm
  // resting state.
  /** @param {Set<string> | null} [hl] the current highlight set, or null when nothing is selected */
  function drawEdges(hl) {
    const svg = backend.getSvg();
    const layer = svg.querySelector('#edges');
    if (!layer) return;

    if (state.activeView === 'flow') {
      for (const path of layer.querySelectorAll('path.edge')) {
        const from = path.getAttribute('data-from') || '';
        const to = path.getAttribute('data-to') || '';
        const kind = path.getAttribute('data-kind') || 'uses';
        const lit = !!(hl && hl.has(from) && hl.has(to));
        path.setAttribute('class', flowEdgeClass(kind, { active: lit, dimmed: !!hl && !lit }));
      }
      return;
    }

    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!state.selected) return;
    const src = state.nodeById.get(state.selected);
    if (!src) return;
    const outs = (state.edgesFromIdx.get(state.selected) || []).filter((/** @type {any} */ e) => state.nodeById.has(e.to));
    const ins  = (state.edgesToIdx.get(state.selected)   || []).filter((/** @type {any} */ e) => state.nodeById.has(e.from));
    for (const e of ins) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'edge active in');
      p.setAttribute('d', buildEdgePath(state.nodeById.get(e.from), src, state.LAYOUT.nodeH));
      layer.appendChild(p);
    }
    for (const e of outs) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'edge active out');
      p.setAttribute('d', buildEdgePath(src, state.nodeById.get(e.to), state.LAYOUT.nodeH));
      layer.appendChild(p);
    }
  }

  function applySelection() {
    const id = state.selected;
    const has = !!(id && state.nodeById.has(id));
    const hl = has ? highlightSet(/** @type {string} */ (id)) : null;
    const peers = hl ? new Set([...hl].filter((x) => x !== id)) : null;
    backend.applyVisualState(state.nodeById, layoutEl, peers);
    drawEdges(hl);
    renderDetail(has ? state.nodeById.get(id).datum : null);
  }

  // Edges among the highlighted set: only those whose BOTH endpoints are in the
  // set (the "connected → draw, otherwise nothing" rule). Layer mode rebuilds
  // #edges (dedup by from→to). Flow mode (defensive — feature is layer-only)
  // restyles existing paths.
  /** @param {Set<string>} idSet */
  function drawSetEdges(idSet) {
    const svg = backend.getSvg();
    const layer = svg.querySelector('#edges');
    if (!layer) return;
    if (state.activeView === 'flow') {
      for (const path of layer.querySelectorAll('path.edge')) {
        const from = path.getAttribute('data-from') || '';
        const to = path.getAttribute('data-to') || '';
        const kind = path.getAttribute('data-kind') || 'uses';
        const lit = idSet.has(from) && idSet.has(to);
        path.setAttribute('class', flowEdgeClass(kind, { active: lit, dimmed: !lit }));
      }
      return;
    }
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!idSet || !idSet.size) return;
    /** @type {Set<string>} */
    const drawn = new Set();
    for (const id of idSet) {
      const src = state.nodeById.get(id);
      if (!src) continue;
      for (const e of (state.edgesFromIdx.get(id) || [])) {
        if (!idSet.has(e.to) || !state.nodeById.has(e.to)) continue;
        const key = e.from + ' ' + e.to;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('class', 'edge active out');
        p.setAttribute('d', buildEdgePath(src, state.nodeById.get(e.to), state.LAYOUT.nodeH));
        layer.appendChild(p);
      }
    }
  }

  // Re-apply the current set-highlight from state.highlightedNodeIds, filtered to
  // nodes that survived the latest render (core/all toggle may hide some). If
  // none survive, fall to the resting view rather than dimming everything.
  function applyHighlight() {
    const idSet = state.highlightedNodeIds;
    const visible = idSet ? new Set([...idSet].filter((x) => state.nodeById.has(x))) : new Set();
    backend.applySetHighlight(state.nodeById, layoutEl, visible.size ? visible : null);
    drawSetEdges(visible);
    renderDetail(null);
  }

  // Enter set-highlight for a commit's class set (clears any single selection).
  /** @param {Set<string>} idSet */
  function highlightNodes(idSet) {
    state.selected = null;
    state.highlightedNodeIds = idSet || new Set();
    applyHighlight();
  }

  // Clicking the selected node deselects it.
  /** @param {string|null} id */
  function select(id) {
    state.selected = (id === state.selected) ? null : id;
    applySelection();
  }

  return { applySelection, select, drawEdges, highlightNodes, applyHighlight };
}
