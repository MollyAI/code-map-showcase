// --------------------------------------------------------------------
// render/edges — pure SVG edge-path `d` string builders, extracted from
// viewer/index.html's `buildEdgePath` (layer-band edges) and
// `buildFlowEdgePath` (flow edges).
//
// The originals each created a `<path>` element via document.createElementNS,
// set its CSS class, and computed its `d` attribute. Only the geometry — the
// `d` string — lives here; the DOM `<path>` creation and class assignment stay
// in the renderer (drawEdges / renderFlow). These functions are therefore pure:
// they read no globals, touch no DOM, and can be imported under node.
//
// Geometry that the originals read off live node objects (`from`/`to` with
// `{x, y, w, h}`) is taken verbatim as the `Rect` inputs. The only global the
// originals consulted was `LAYOUT.nodeH` (the same-row arc dip), which is now an
// explicit `nodeH` parameter that defaults to 28 to preserve the original
// `(LAYOUT.nodeH || 28)` fallback. Every control point, dip factor, and pixel
// threshold below is byte-for-byte identical to the original.
// --------------------------------------------------------------------

/**
 * A positioned rectangle — the `{x, y, w, h}` geometry the originals read off
 * the live node objects in `state.nodeById`.
 * @typedef {object} Rect
 * @property {number} x  left edge
 * @property {number} y  top edge
 * @property {number} w  width
 * @property {number} h  height
 */

/**
 * Build the `d` string for a layer-band edge between two nodes.
 *
 * Verbatim from the original `buildEdgePath`'s geometry. Two branches:
 *   - Same row (|Δy| < 6px): the originals avoided crossing the labels of
 *     intervening nodes (all centred on the row mid-line) by dropping out of
 *     both bottom edges and connecting with a shallow downward arc that rides
 *     in the gap just under the row. The arc dip is `nodeH * 0.5`.
 *   - Different bands: a vertical cubic between the facing horizontal edges,
 *     with control points offset by half the vertical span (`dy * 0.5`).
 *
 * @param {Rect} from  source node geometry
 * @param {Rect} to    target node geometry
 * @param {number} [nodeH=28]  row height used for the same-row arc dip;
 *   defaults to 28 to mirror the original `(LAYOUT.nodeH || 28)`.
 * @returns {string} the SVG path `d` attribute string
 */
export function buildEdgePath(from, to, nodeH = 28) {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2,     y: to.y + to.h / 2     };

  if (Math.abs(tc.y - fc.y) < 6) {
    // Same row: a straight mid-line link would cross the text of every node
    // sitting between source and target (all labels are centred on the row's
    // mid-line). Instead, drop out of both bottom edges and connect with a
    // shallow downward arc that rides in the gap just under the row, so the
    // line never overlaps any label no matter how many nodes it spans.
    const yb = from.y + from.h;          // shared row bottom
    const dip = (nodeH || 28) * 0.5;     // arc depth (peaks ~0.75*dip below)
    const cy = yb + dip;
    return `M ${fc.x} ${yb} C ${fc.x} ${cy}, ${tc.x} ${cy}, ${tc.x} ${yb}`;
  }

  // Different bands: vertical cubic between the facing horizontal edges.
  const p1 = { x: fc.x, y: fc.y + (tc.y > fc.y ? from.h / 2 : -from.h / 2) };
  const p2 = { x: tc.x, y: tc.y + (tc.y > fc.y ? -to.h / 2  : to.h / 2)   };
  const dy = p2.y - p1.y;
  const c1 = { x: p1.x, y: p1.y + dy * 0.5 };
  const c2 = { x: p2.x, y: p2.y - dy * 0.5 };
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Build the `d` string for a flow edge: a horizontal cubic from the right edge
 * of `from` to the left edge of `to`. Verbatim from the original
 * `buildFlowEdgePath`'s geometry — the horizontal control-point offset is
 * `max((Δx) * 0.5, 20)`.
 *
 * @param {Rect} from  source node geometry
 * @param {Rect} to    target node geometry
 * @returns {string} the SVG path `d` attribute string
 */
export function buildFlowEdgePath(from, to) {
  const p1 = { x: from.x + from.w, y: from.y + from.h / 2 };
  const p2 = { x: to.x,           y: to.y + to.h / 2     };
  const dx = Math.max((p2.x - p1.x) * 0.5, 20);
  return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Link path that also handles BACKWARD links (target left of source) by
 * mirroring buildFlowEdgePath: left edge of `from` → right edge of `to`.
 * Forward links delegate to buildFlowEdgePath unchanged. Used by the
 * pipeline-diagram renderer, whose Phase-2-authored links may point
 * anywhere (stage↔stage, node↔node).
 * @param {Rect} from @param {Rect} to @returns {string}
 */
export function buildLinkPath(from, to) {
  if (to.x >= from.x + from.w) return buildFlowEdgePath(from, to);
  const p1 = { x: from.x,      y: from.y + from.h / 2 };
  const p2 = { x: to.x + to.w, y: to.y + to.h / 2     };
  const dx = Math.max((p1.x - p2.x) * 0.5, 20);
  return `M ${p1.x} ${p1.y} C ${p1.x - dx} ${p1.y}, ${p2.x + dx} ${p2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Class string for a flow edge `<path>`. Single source of truth shared by the
 * flow renderer (registry) and the selection re-styler (selection), so a
 * `dispatch` edge keeps its dashed style through selection. `active` wins over
 * `dimmed` when both are set.
 * @param {string} [kind]  edge kind ('uses' | 'dispatch')
 * @param {{ active?: boolean, dimmed?: boolean }} [opts]
 * @returns {string}
 */
export function flowEdgeClass(kind, { active = false, dimmed = false } = {}) {
  let cls = 'edge flow';
  if (kind === 'dispatch') cls += ' dispatch';
  else if (kind && kind !== 'uses') cls += ' k-' + kind;
  if (active) cls += ' active';
  else if (dimmed) cls += ' dimmed';
  return cls;
}
