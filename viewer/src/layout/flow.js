// --------------------------------------------------------------------
// layout/flow — pure geometry for the left→right layered-DAG flow
// renderer, extracted verbatim from viewer/index.html's `layoutFlow`.
// DOM-free and side-effect-free so it imports cleanly under node.
//
// The original read three globals: `state.fontScale` (for COL_GAP),
// the mutable `LAYOUT`, and `state.classById` (id → datum). Here:
//   - `LAYOUT` is an explicit parameter,
//   - `classById` is an explicit parameter (replacing `state.classById`),
//   - `state.fontScale` is recovered exactly from the layout, since
//     `LAYOUT.charW === LAYOUT_BASE.charW * fontScale` is the one
//     scale-proportional field the original left un-rounded.
// Geometry (BFS depth columns, vertical centring) keeps the original magic
// numbers (64, +6); node width is uniform across the whole flow (widest
// label wins) so the boxes line up per flow.
// --------------------------------------------------------------------

import { LAYOUT_BASE, nodeWidth } from './metrics.js';

/**
 * @typedef {import('./metrics.js').Layout} Layout
 */

/**
 * A positioned flow node.
 * @typedef {object} FlowNode
 * @property {*} datum
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * Left→right layered DAG layout for a single flow. Columns = hop distance from
 * the seed (computed over the flow's own edges, which form a tree). Within a
 * column, nodes stack vertically and the column is centred against the tallest.
 * @param {{ seed: string, nodes: string[], edges: Array<{ from: string, to: string }> }} flow
 * @param {Map<string, { id: string, name: string, importance?: number }>} classById
 * @param {Layout} LAYOUT
 * @returns {{ nodes: FlowNode[], edges: Array<{ from: string, to: string }>, width: number, height: number }}
 */
export function layoutFlow(flow, classById, LAYOUT) {
  const fontScale = LAYOUT.charW / LAYOUT_BASE.charW;
  const COL_GAP = Math.round(64 * fontScale);
  const ROW_GAP = LAYOUT.nodeGapY + 6;
  const PAD_X = LAYOUT.bandPadX;
  const PAD_Y = LAYOUT.bandPadTop;

  // resolve ids → data; drop any that aren't in the map
  /** @typedef {{ id: string, name: string, importance?: number }} Datum */
  const data = /** @type {Datum[]} */ (
    flow.nodes.map(id => classById.get(id)).filter(Boolean)
  );
  if (!data.length) return { nodes: [], edges: [], omitted: [], width: 0, height: 0 };

  // depth via BFS over flow.edges from the seed
  /** @type {Map<string, string[]>} */
  const children = new Map();
  for (const e of flow.edges) {
    if (!children.has(e.from)) children.set(e.from, []);
    /** @type {string[]} */ (children.get(e.from)).push(e.to);
  }
  /** @type {Map<string, number>} */
  const depth = new Map([[flow.seed, 0]]);
  const q = [flow.seed];
  while (q.length) {
    const u = /** @type {string} */ (q.shift());
    for (const v of (children.get(u) || [])) {
      if (!depth.has(v)) { depth.set(v, /** @type {number} */ (depth.get(u)) + 1); q.push(v); }
    }
  }

  // bucket by depth
  /** @type {Map<number, typeof data>} */
  const cols = new Map();   // depth -> [datum]
  for (const c of data) {
    const dp = depth.has(c.id) ? /** @type {number} */ (depth.get(c.id)) : 0;
    if (!cols.has(dp)) cols.set(dp, []);
    /** @type {typeof data} */ (cols.get(dp)).push(c);
  }
  const depths = [...cols.keys()].sort((a, b) => a - b);

  // One uniform node width for the whole flow (the widest label wins) — equal
  // boxes per flow read much calmer than per-column sizing.
  const uniformW = Math.max(...data.map(c => nodeWidth(c, LAYOUT)));
  /** @type {Map<number, number>} */
  const colW = new Map();
  for (const dp of depths) colW.set(dp, uniformW);
  /** @type {Map<number, number>} */
  const colX = new Map();
  let x = PAD_X;
  for (const dp of depths) { colX.set(dp, x); x += /** @type {number} */ (colW.get(dp)) + COL_GAP; }
  const totalWidth = x - COL_GAP + PAD_X;

  // column heights → vertical centring
  /** @type {Map<number, number>} */
  const colH = new Map();
  for (const dp of depths) {
    const n = /** @type {typeof data} */ (cols.get(dp)).length;
    colH.set(dp, n * LAYOUT.nodeH + (n - 1) * ROW_GAP);
  }
  const maxColH = Math.max(...depths.map(dp => /** @type {number} */ (colH.get(dp))));
  const totalHeight = maxColH + PAD_Y * 2;

  const positioned = [];
  for (const dp of depths) {
    const items = /** @type {typeof data} */ (cols.get(dp));
    let y = PAD_Y + (maxColH - /** @type {number} */ (colH.get(dp))) / 2;
    for (const c of items) {
      positioned.push({
        datum: c,
        x: /** @type {number} */ (colX.get(dp)),
        y,
        w: /** @type {number} */ (colW.get(dp)),
        h: LAYOUT.nodeH,
      });
      y += LAYOUT.nodeH + ROW_GAP;
    }
  }
  return { nodes: positioned, edges: flow.edges, omitted: flow.dispatch_omitted || [], width: totalWidth, height: totalHeight };
}
