// --------------------------------------------------------------------
// render/scene — the ONE shared render lifecycle, replacing the
// duplicated clear → setViewBox → build → applyZoom → restore-selection
// sequence that the original render() (layer) and renderFlow() both
// carried (spec pain point #1). The per-view differences (band
// decorations vs flat flow nodes, edge ordering) live in each ViewDef's
// computeLayout/buildContent (render/registry.js); the lifecycle is here.
// --------------------------------------------------------------------

import { state } from '../store.js';

/**
 * @typedef {object} ViewDef
 * @property {string} id
 * @property {string} labelKey
 * @property {(state: any, ctx: any) => { width: number, height: number, [k: string]: any }} computeLayout
 * @property {(backend: any, layout: any, ctx: any) => void} buildContent
 */

/**
 * Run the shared render lifecycle for `view`.
 * @param {import('./backend.js').RenderBackend} backend
 * @param {ViewDef} view
 * @param {any} ctx wiring: { state, handlers, applySelection, drawEdges, renderDetail, ... }
 */
export function renderScene(backend, view, ctx) {
  state.nodeById.clear();
  backend.clear();

  const layout = view.computeLayout(state, ctx);
  backend.setViewBox(layout.width, layout.height);
  state.baseWidth = layout.width;
  state.baseHeight = layout.height;

  view.buildContent(backend, layout, ctx);
  backend.applyZoom();

  // Restore selection if it survived the rebuild; else fall to the resting state.
  if (state.selected && state.nodeById.has(state.selected)) {
    ctx.applySelection();
  } else {
    state.selected = null;
    ctx.drawEdges();          // layer: clears #edges. flow: resets edges to the calm resting state
    ctx.renderDetail(null);
  }
}
