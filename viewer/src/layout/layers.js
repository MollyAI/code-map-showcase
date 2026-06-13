// --------------------------------------------------------------------
// layout/layers — pure geometry for the layer-band renderer, extracted
// verbatim from viewer/index.html's `layoutLayers`. DOM-free and
// side-effect-free so it imports cleanly under node (tests, tsc).
//
// The original read the mutable global `LAYOUT` and called the old
// `nodeWidth(name, importance)`. Here `LAYOUT` is an explicit parameter
// and `nodeWidth(decl, LAYOUT)` is imported with its current signature.
// Geometry (sort, row packing, band rects, centring) is unchanged.
// --------------------------------------------------------------------

import { nodeWidth } from './metrics.js';

/**
 * @typedef {import('./metrics.js').Layout} Layout
 */

/**
 * A positioned node within a band.
 * @typedef {object} PositionedNode
 * @property {*} datum     the source class/declaration object
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * One layout band, mirroring a single layer.
 * @typedef {object} Band
 * @property {*} layer            the source layer object
 * @property {number} y
 * @property {number} x
 * @property {number} width
 * @property {number} height
 * @property {PositionedNode[]} nodes
 */

/**
 * Lay out the layer bands top-to-bottom. Each layer's classes are sorted by
 * descending importance, packed into rows that fit the inner width, then
 * positioned. Returns the bands plus the total stacked height.
 * @param {Array<{ classes: Array<{ name: string, importance: number }> }>} layers
 * @param {number} canvasWidth
 * @param {Layout} LAYOUT
 * @returns {{ bands: Band[], totalHeight: number }}
 */
/**
 * Pack a layer's classes (caller pre-sorts by importance) into rows fitting
 * `innerW`, returning positioned nodes relative to (innerLeft, contentTop) and
 * the total content height. Extracted verbatim from layoutLayers' inner loop so
 * the layer-band renderer and the grouped renderer (layout/groups.js) share one
 * packing implementation. The geometry is byte-for-byte the original's.
 * @param {Array<{ name: string, importance: number }>} sorted classes, importance-desc
 * @param {number} innerLeft left x of the content area
 * @param {number} innerW available content width
 * @param {number} contentTop y of the first row
 * @param {Layout} LAYOUT
 * @returns {{ nodes: PositionedNode[], rows: number, contentHeight: number }}
 */
export function packRows(sorted, innerLeft, innerW, contentTop, LAYOUT) {
  const rows = [];
  let row = [];
  let rowW = 0;
  for (const c of sorted) {
    const w = nodeWidth(c, LAYOUT);
    const needed = (row.length ? LAYOUT.nodeGapX : 0) + w;
    if (rowW + needed > innerW && row.length) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push({ datum: c, w });
    rowW += needed;
  }
  if (row.length) rows.push(row);

  const nodes = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    let x = innerLeft;
    const ny = contentTop + ri * (LAYOUT.nodeH + LAYOUT.nodeGapY);
    for (const it of r) {
      nodes.push({ datum: it.datum, x, y: ny, w: it.w, h: LAYOUT.nodeH });
      x += it.w + LAYOUT.nodeGapX;
    }
  }
  const contentHeight = rows.length
    ? rows.length * LAYOUT.nodeH + (rows.length - 1) * LAYOUT.nodeGapY
    : 0;
  return { nodes, rows: rows.length, contentHeight };
}

export function layoutLayers(layers, canvasWidth, LAYOUT) {
  const innerLeft = LAYOUT.bandPadX;
  const innerW = canvasWidth - 2 * LAYOUT.bandPadX;

  let y = 0;
  const bands = [];

  for (const L of layers) {
    const sorted = [...L.classes].sort((a, b) => b.importance - a.importance);
    const { nodes, contentHeight } = packRows(sorted, innerLeft, innerW, y + LAYOUT.bandPadTop, LAYOUT);
    const bandH = LAYOUT.bandPadTop + contentHeight + LAYOUT.bandPadBottom;

    bands.push({
      layer: L,
      y,
      x: 0,
      width: canvasWidth,
      height: bandH,
      nodes,
    });
    y += bandH + LAYOUT.bandGapY;
  }

  return { bands, totalHeight: y };
}
