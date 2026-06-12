// --------------------------------------------------------------------
// render/backend — the SVG rendering backend behind a small interface.
// This concentrates the load-bearing, SVG-specific behaviors the spec
// flags (§9): zoom by sizing the SVG element in pixels (viewBox stays
// fixed) with the sub-pixel write-skip anti-flicker guard, and the
// selection visual-state class toggling. A future canvas/WebGL backend
// would implement the same shape (the "scale" seam).
//
// It deliberately does NOT build scene content (bands/nodes/edges) — that
// is render/scene.js + render/registry.js, which call backend.add(). The
// seam is the render/ folder as a whole.
// --------------------------------------------------------------------

import { state } from '../store.js';

export const NS = 'http://www.w3.org/2000/svg';
// canvas-wrap horizontal padding — must match the CSS so applyZoom knows the content-area width.
export const CANVAS_PAD_L = 28;

/**
 * @typedef {object} RenderBackend
 * @property {() => void} clear
 * @property {(w: number, h: number) => void} setViewBox
 * @property {(el: Element) => void} add
 * @property {() => SVGSVGElement} getSvg
 * @property {() => void} applyZoom
 * @property {() => void} updateZoomLabel
 * @property {() => void} goHome
 * @property {() => void} centerContent
 * @property {(nodeById: Map<string, any>, layoutEl: HTMLElement, peers?: Set<string>|null) => void} applyVisualState
 */

/**
 * @param {SVGSVGElement} svg
 * @param {HTMLElement} canvasWrap
 * @returns {RenderBackend}
 */
export function createSvgBackend(svg, canvasWrap) {
  // Pan gutter — extra scrollable space around the SVG so the canvas can be
  // dragged freely even at 100% zoom (where the SVG exactly fits the content
  // width and would otherwise have no horizontal scroll room). A quarter
  // viewport on each side: enough overscroll room without letting the diagram
  // wander far off-screen. Computed once from the initial viewport as fixed px
  // (not vw/vh) so a mid-session window resize can't shift the content under
  // the user. Applied as a margin on the SVG, which enlarges canvas-wrap's
  // scrollable area WITHOUT touching applyZoom's width contract (that reads
  // clientWidth, never scrollWidth) and WITHOUT affecting export (png.js sizes
  // its clone from viewBox, ignoring this margin).
  const gutterX = Math.round((window.innerWidth || 1200) * 0.25);
  const gutterY = Math.round((window.innerHeight || 800) * 0.25);
  svg.style.margin = gutterY + 'px ' + gutterX + 'px';

  function clear() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  /** @param {number} w @param {number} h */
  function setViewBox(w, h) { svg.setAttribute('viewBox', `0 0 ${w} ${h}`); }

  /** @param {Element} el */
  function add(el) { svg.appendChild(el); }

  function getSvg() { return svg; }

  function updateZoomLabel() {
    const el = document.getElementById('zoom-pct');
    if (el) el.textContent = Math.round(state.zoom * 100) + '%';
  }

  // Size the SVG element to baseWidth × baseHeight × zoom — scroll handles pan.
  // viewBox stays fixed (export relies on it spanning the full diagram).
  function applyZoom() {
    if (!state.baseWidth) return;
    const containerW = Math.max(1, canvasWrap.clientWidth - 2 * CANVAS_PAD_L);
    const w = containerW * state.zoom;
    const h = w * (state.baseHeight / state.baseWidth);
    // Skip sub-pixel writes — they don't change anything visible but can re-trigger
    // ResizeObserver and keep the page oscillating after a panel transition settles.
    const prevW = parseFloat(svg.style.width) || 0;
    const prevH = parseFloat(svg.style.height) || 0;
    if (Math.abs(w - prevW) < 0.5 && Math.abs(h - prevH) < 0.5) { updateZoomLabel(); return; }
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
    updateZoomLabel();
  }

  // Scroll past the pan gutter so the SVG's top-left sits at the visible
  // top-left — the gutter is overscroll room for dragging, not initial empty
  // space. Called once after the first render (main.onModel).
  function goHome() {
    canvasWrap.scrollLeft = gutterX;
    canvasWrap.scrollTop = gutterY;
  }

  // Centre the diagram in the viewport (the "reset 100%" companion): align the
  // SVG's centre with the canvas-wrap's centre on both axes. Content taller
  // than the viewport is top-aligned instead (centring would hide the first
  // layers above the fold).
  function centerContent() {
    const sr = svg.getBoundingClientRect();
    const wr = canvasWrap.getBoundingClientRect();
    canvasWrap.scrollLeft += (sr.left + sr.width / 2) - (wr.left + wr.width / 2);
    if (sr.height <= wr.height) {
      canvasWrap.scrollTop += (sr.top + sr.height / 2) - (wr.top + wr.height / 2);
    } else {
      canvasWrap.scrollTop = gutterY;
    }
  }

  // Toggle selected/peer/dimmed classes on the rendered node elements, and the
  // layout's has-selection class. The peer set is computed by the caller
  // (interact/selection) so it can be mode-aware — global graph neighbours in
  // layer mode, the connected flow slice in flow mode — keeping this backend
  // free of grouping logic.
  /** @param {Map<string, any>} nodeById @param {HTMLElement} layoutEl @param {Set<string>|null} [peers] */
  function applyVisualState(nodeById, layoutEl, peers) {
    const id = state.selected;
    layoutEl.classList.toggle('has-selection', !!(id && nodeById.has(id)));
    for (const [, entry] of nodeById) entry.el.classList.remove('selected', 'peer', 'dimmed');
    if (id && nodeById.has(id)) {
      nodeById.get(id).el.classList.add('selected');
      const peerSet = peers || new Set();
      for (const [nid, entry] of nodeById) {
        if (nid === id) continue;
        entry.el.classList.add(peerSet.has(nid) ? 'peer' : 'dimmed');
      }
    }
  }

  return { clear, setViewBox, add, getSvg, applyZoom, updateZoomLabel, goHome, centerContent, applyVisualState };
}
