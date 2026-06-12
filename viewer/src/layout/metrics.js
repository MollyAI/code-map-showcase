// --------------------------------------------------------------------
// layout/metrics — single source of truth for layout geometry, extracted
// from viewer/index.html. DOM-free and side-effect-free so it imports
// cleanly under node (tests, tsc).
//
// The original code kept a base constant `LAYOUT_BASE` plus a mutable
// global `LAYOUT`, and `rescaleLayout(scale)` mutated `LAYOUT` in place.
// Here `makeLayout(fontScale)` returns a *fresh* object instead, never
// touching `LAYOUT_BASE` (which is frozen).
// --------------------------------------------------------------------

/**
 * @typedef {object} Layout
 * @property {number} padX          padding inside the canvas (matches CSS)
 * @property {number} bandGapY      vertical gap between bands
 * @property {number} bandPadX
 * @property {number} bandPadTop
 * @property {number} bandPadBottom
 * @property {number} bandLabelX
 * @property {number} nodeH
 * @property {number} nodeGapX
 * @property {number} nodeGapY
 * @property {number} charW         approx width of a JetBrains Mono char at 11px
 * @property {number} nodePadX
 * @property {number} minNodeW
 * @property {number} maxNodeW
 */

/**
 * Reference geometry at scale = 1 (medium). Fields that visually track the
 * font size are recomputed by `makeLayout()` whenever the user changes it.
 * Frozen: never mutated.
 * @type {Readonly<Layout>}
 */
export const LAYOUT_BASE = Object.freeze({
  padX: 28,         // padding inside the canvas (matches CSS)
  bandGapY: 24,     // vertical gap between bands
  bandPadX: 22,
  bandPadTop: 56,
  bandPadBottom: 18,
  bandLabelX: 16,
  nodeH: 28,
  nodeGapX: 10,
  nodeGapY: 8,
  charW: 7,         // approx width of a JetBrains Mono char at 11px
  nodePadX: 14,
  minNodeW: 80,
  maxNodeW: 220,
});

/**
 * Build a layout for the given font scale. Returns a new object; the
 * scale-sensitive fields are recomputed (same formulas the original
 * `rescaleLayout` used) and the rest are carried over from `LAYOUT_BASE`.
 * @param {number} fontScale
 * @returns {Layout}
 */
export function makeLayout(fontScale) {
  return {
    ...LAYOUT_BASE,
    bandGapY:   Math.round(LAYOUT_BASE.bandGapY   * fontScale),
    bandPadTop: Math.round(LAYOUT_BASE.bandPadTop * fontScale),
    nodeH:      Math.round(LAYOUT_BASE.nodeH      * fontScale),
    nodeGapY:   Math.round(LAYOUT_BASE.nodeGapY   * fontScale),
    charW:      LAYOUT_BASE.charW * fontScale,
    minNodeW:   Math.round(LAYOUT_BASE.minNodeW   * fontScale),
    maxNodeW:   Math.round(LAYOUT_BASE.maxNodeW   * fontScale),
  };
}

/**
 * Approximate rendered width of a (possibly CJK) label in the mono font.
 * CJK glyphs are ~2× the latin advance, so they count as 2 units. Used by
 * the diagram layouts to size gaps so edge/step labels never overlap boxes.
 * @param {string} text
 * @param {Layout} LAYOUT
 * @returns {number}
 */
export function labelWidth(text, LAYOUT) {
  let units = 0;
  for (const ch of String(text || '')) {
    units += (/** @type {number} */ (ch.codePointAt(0)) > 0x2e7f) ? 2 : 1;
  }
  return Math.round(units * LAYOUT.charW);
}

/**
 * Width of a node box given its declaration and the active layout.
 * Driven by the (clamped) label length; clamped to [minNodeW, maxNodeW].
 * Uses `display_name` when present (matches what the node renderer shows).
 * @param {{ name: string, display_name?: string }} decl
 * @param {Layout} LAYOUT
 * @returns {number}
 */
export function nodeWidth(decl, LAYOUT) {
  const label = decl.display_name || decl.name;
  const baseChars = Math.min(label.length, 22);
  const w = LAYOUT.minNodeW + (baseChars - 6) * LAYOUT.charW;
  return Math.min(LAYOUT.maxNodeW, Math.max(LAYOUT.minNodeW, Math.round(w)));
}
