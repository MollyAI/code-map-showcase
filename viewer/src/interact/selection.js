// --------------------------------------------------------------------
// interact/selection — the lightweight selection path. Selecting/hovering
// does NOT go through setState's full re-render (that would rebuild the
// whole SVG on every click — a perf regression on large maps); instead it
// toggles classes (backend.applyVisualState) and redraws only the selected
// node's edges. Was selectNode / applySelection / drawEdges in index.html.
// --------------------------------------------------------------------

import { state } from '../store.js';
import { buildEdgePath } from '../render/edges.js';
import { NS } from '../render/backend.js';

/**
 * @param {object} deps
 * @param {import('../render/backend.js').RenderBackend} deps.backend
 * @param {(c: any) => void} deps.renderDetail
 * @param {HTMLElement} deps.layoutEl
 */
export function createSelection({ backend, renderDetail, layoutEl }) {
  // The set of node ids kept lit for the current selection (the selected id
  // included) — the selected node's direct graph neighbours. Layer mode only:
  // flow mode renders via Mermaid (its nodes aren't in nodeById, so selection
  // visual-state / edge re-styling don't run there — click only opens detail).
  /** @param {string} id @returns {Set<string>} */
  function highlightSet(id) {
    const set = new Set([id]);
    for (const e of (state.edgesFromIdx.get(id) || [])) set.add(e.to);
    for (const e of (state.edgesToIdx.get(id) || [])) set.add(e.from);
    return set;
  }

  // Layer mode: rebuild #edges with just the selected node's in/out edges (the
  // deliberate anti-hairball design). Flow mode (Mermaid) has no `#edges` group
  // and no registered nodes, so this early-returns. With no selection it falls
  // to a calm resting state.
  /** @param {Set<string> | null} [hl] the current highlight set, or null when nothing is selected */
  function drawEdges(hl) {
    const svg = backend.getSvg();
    const layer = svg.querySelector('#edges');
    if (!layer) return;

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
    const inNode = !!(id && state.nodeById.has(id));
    const hl = inNode ? highlightSet(/** @type {string} */ (id)) : null;
    const peers = hl ? new Set([...hl].filter((x) => x !== id)) : null;
    backend.applyVisualState(state.nodeById, layoutEl, peers);
    drawEdges(hl);
    // Detail datum: a layer node from nodeById, or — for a Mermaid flow node
    // (not registered in nodeById) — the decl from classById. So click→detail
    // works in flow mode even though visual-state/edges don't.
    const datum = id ? (inNode ? state.nodeById.get(id).datum : (state.classById.get(id) || null)) : null;
    renderDetail(datum);
  }

  // Clicking the selected node deselects it.
  /** @param {string|null} id */
  function select(id) {
    state.selected = (id === state.selected) ? null : id;
    applySelection();
  }

  return { applySelection, select, drawEdges };
}
