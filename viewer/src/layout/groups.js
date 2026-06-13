// --------------------------------------------------------------------
// layout/groups — 2D arrangement. Rebuilds the tier/group structure from
// flat leaf layers + group descriptors, then lays it out top-to-bottom.
// Standalone leaves reuse the flat full-width band; row-groups place child
// leaf layers side-by-side; column-groups stack them. DOM-free / pure.
//
// Returns { bands, frames, totalHeight }:
//   bands  — positioned bands (full-width standalone OR child sub-bands),
//            shape { layer, x, y, width, height, nodes } with ABSOLUTE node
//            coords (same shape layoutLayers emits — the renderer reuses it).
//   frames — group umbrella rects { group, x, y, width, height } drawn behind
//            the bands; a frame whose group has no `name` renders no title.
// --------------------------------------------------------------------

import { nodeWidth } from './metrics.js';
import { packRows } from './layers.js';

/**
 * @typedef {import('./metrics.js').Layout} Layout
 */

// Header room inside a child sub-band (label + count only — no summary line,
// so smaller than a top band's bandPadTop). Sized to clear the ~16px sub-band
// title (registry.js labelY = y+22) with a small gap before the node row.
const CHILD_HEAD = 34;

/**
 * Lay out one leaf layer's nodes inside [x, x+width], content starting at
 * `contentTop + CHILD_HEAD`. Returns absolute nodes + total band height.
 * @param {{ classes: Array }} layer
 * @param {number} x
 * @param {number} width
 * @param {number} contentTop
 * @param {Layout} LAYOUT
 * @returns {{ nodes: Array, height: number }}
 */
function layoutChild(layer, x, width, contentTop, LAYOUT) {
  const sorted = [...layer.classes].sort((a, b) => b.importance - a.importance);
  const innerLeft = x + LAYOUT.bandPadX;
  const innerW = Math.max(LAYOUT.minNodeW, width - 2 * LAYOUT.bandPadX);
  const { nodes, contentHeight } = packRows(sorted, innerLeft, innerW, contentTop + CHILD_HEAD, LAYOUT);
  const height = CHILD_HEAD + contentHeight + LAYOUT.bandPadBottom;
  return { nodes, height };
}

/** Widest single node in a layer + side padding (content-based column sizing). */
function widestNode(layer, LAYOUT) {
  let w = LAYOUT.minNodeW;
  for (const c of layer.classes) w = Math.max(w, nodeWidth(c, LAYOUT));
  return w + 2 * LAYOUT.bandPadX;
}

/**
 * @param {Array} leaves  flat leaf layers (each with `order`, optional `group`, `classes`)
 * @param {Array} groups  group descriptors ({ id, name?, summary?, order, layout, children })
 * @param {number} canvasWidth
 * @param {Layout} LAYOUT
 * @returns {{ bands: Array, frames: Array, totalHeight: number }}
 */
export function layoutGrouped(leaves, groups, canvasWidth, LAYOUT) {
  const byId = new Map(leaves.map((l) => [l.id, l]));
  // top-level entries: standalone leaves + groups, sorted by order (stable).
  const entries = [];
  for (const l of leaves) if (!l.group) entries.push({ order: l.order, leaf: l });
  for (const g of groups) entries.push({ order: g.order, group: g });
  entries.sort((a, b) => (a.order - b.order) || 0);

  const bands = [];
  const frames = [];
  let y = 0;

  for (const e of entries) {
    if (e.leaf) {
      // standalone full-width band (mirrors layoutLayers for one layer)
      const layer = e.leaf;
      const sorted = [...layer.classes].sort((a, b) => b.importance - a.importance);
      const innerLeft = LAYOUT.bandPadX;
      const innerW = canvasWidth - 2 * LAYOUT.bandPadX;
      const { nodes, contentHeight } = packRows(sorted, innerLeft, innerW, y + LAYOUT.bandPadTop, LAYOUT);
      const height = LAYOUT.bandPadTop + contentHeight + LAYOUT.bandPadBottom;
      bands.push({ layer, x: 0, y, width: canvasWidth, height, nodes });
      y += height + LAYOUT.bandGapY;
      continue;
    }
    const g = e.group;
    const kids = g.children.map((id) => byId.get(id)).filter(Boolean);
    const frameTop = y;
    // named group reserves a title row; bare group only needs top padding.
    const headTop = g.name ? LAYOUT.bandPadTop : LAYOUT.bandPadBottom;
    const contentTop = frameTop + headTop;

    if (g.layout === 'column') {
      let cy = contentTop;
      for (const kid of kids) {
        const { nodes, height } = layoutChild(kid, 0, canvasWidth, cy, LAYOUT);
        bands.push({ layer: kid, x: 0, y: cy, width: canvasWidth, height, nodes });
        cy += height + LAYOUT.nodeGapY;
      }
      const frameH = cy - frameTop + LAYOUT.bandPadBottom;
      frames.push({ group: g, x: 0, y: frameTop, width: canvasWidth, height: frameH });
      y = frameTop + frameH + LAYOUT.bandGapY;
    } else { // row (default)
      const n = kids.length || 1;
      const colGap = LAYOUT.bandPadX;
      const avail = canvasWidth - 2 * LAYOUT.bandPadX - (n - 1) * colGap;
      const target = avail / n;
      let cx = LAYOUT.bandPadX;
      let maxH = 0;
      for (const kid of kids) {
        const colW = Math.max(target, widestNode(kid, LAYOUT));
        const { nodes, height } = layoutChild(kid, cx, colW, contentTop, LAYOUT);
        bands.push({ layer: kid, x: cx, y: contentTop, width: colW, height, nodes });
        maxH = Math.max(maxH, height);
        cx += colW + colGap;
      }
      const frameW = Math.max(canvasWidth, cx - colGap + LAYOUT.bandPadX);
      const frameH = headTop + maxH + LAYOUT.bandPadBottom;
      frames.push({ group: g, x: 0, y: frameTop, width: frameW, height: frameH });
      y = frameTop + frameH + LAYOUT.bandGapY;
    }
  }
  return { bands, frames, totalHeight: y };
}
