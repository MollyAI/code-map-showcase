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
export function layoutLayers(layers, canvasWidth, LAYOUT) {
  const innerLeft = LAYOUT.bandPadX;
  const innerRight = canvasWidth - LAYOUT.bandPadX;
  const innerW = innerRight - innerLeft;

  let y = 0;
  const bands = [];

  for (const L of layers) {
    const sorted = [...L.classes].sort((a, b) => b.importance - a.importance);
    // pack into rows
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

    // assign x,y to each node
    const positioned = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      let x = innerLeft;
      const ny = y + LAYOUT.bandPadTop + ri * (LAYOUT.nodeH + LAYOUT.nodeGapY);
      for (const it of r) {
        positioned.push({ datum: it.datum, x, y: ny, w: it.w, h: LAYOUT.nodeH });
        x += it.w + LAYOUT.nodeGapX;
      }
    }

    const bandH = LAYOUT.bandPadTop +
                  rows.length * LAYOUT.nodeH + (rows.length - 1) * LAYOUT.nodeGapY +
                  LAYOUT.bandPadBottom;

    bands.push({
      layer: L,
      y,
      x: 0,
      width: canvasWidth,
      height: bandH,
      nodes: positioned,
    });
    y += bandH + LAYOUT.bandGapY;
  }

  return { bands, totalHeight: y };
}
