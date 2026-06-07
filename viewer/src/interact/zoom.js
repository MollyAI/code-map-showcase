// --------------------------------------------------------------------
// interact/zoom — wheel zoom anchored to the cursor (bare wheel / two-finger
// scroll / trackpad pinch all zoom; native page scroll is given up — panning
// is left-drag), +/-/reset buttons anchored to the viewport center, and a
// ResizeObserver that re-applies zoom every frame of the panel-open
// transition. The pixel sizing itself lives in backend.applyZoom (the
// load-bearing part); this module is the gesture/anchor math. Was the zoom
// IIFE block.
// --------------------------------------------------------------------

import { state } from '../store.js';

/**
 * @param {import('../render/backend.js').RenderBackend} backend
 * @param {HTMLElement} canvasWrap
 */
export function initZoom(backend, canvasWrap) {
  const svg = backend.getSvg();

  /** @param {number} newZoom @param {number} anchorClientX @param {number} anchorClientY */
  function zoomTo(newZoom, anchorClientX, anchorClientY) {
    const clamped = Math.max(0.3, Math.min(4, newZoom));
    if (Math.abs(clamped - state.zoom) < 0.001) return;
    if (!state.baseWidth) { state.zoom = clamped; backend.updateZoomLabel(); return; }
    // Fraction of the SVG under the anchor — preserved across the zoom.
    const sr = svg.getBoundingClientRect();
    const fxX = sr.width > 0 ? (anchorClientX - sr.left) / sr.width : 0.5;
    const fxY = sr.height > 0 ? (anchorClientY - sr.top) / sr.height : 0.5;
    state.zoom = clamped;
    backend.applyZoom();
    // Slide the wrap so the same SVG fraction is back under the anchor.
    const nr = svg.getBoundingClientRect();
    canvasWrap.scrollLeft += (nr.left + fxX * nr.width) - anchorClientX;
    canvasWrap.scrollTop += (nr.top + fxY * nr.height) - anchorClientY;
  }

  // Wheel zoom, rAF-coalesced for smoothness. Multiple wheel events landing in
  // one frame (a fast scroll burst, or a stream of tiny trackpad deltas) are
  // accumulated and applied as ONE exponential zoom step per frame — no lag, no
  // jitter, and the factor stays continuous (exp(sum) == composing exp steps)
  // instead of stepped. Only one getBoundingClientRect pair runs per frame.
  let pendingDelta = 0;
  let anchorX = 0, anchorY = 0;
  let wheelRaf = 0;
  const WHEEL_SENS = 0.0015;   // zoom exponent per px of normalized wheel travel

  function flushWheel() {
    wheelRaf = 0;
    if (pendingDelta === 0) return;
    const factor = Math.exp(-pendingDelta * WHEEL_SENS);
    pendingDelta = 0;
    zoomTo(state.zoom * factor, anchorX, anchorY);
  }

  /** @param {WheelEvent} ev */
  function onWheelZoom(ev) {
    ev.preventDefault();   // no native scroll — wheel always zooms now
    // Normalize delta units to pixels (line/page modes vary by browser/OS).
    let dy = ev.deltaY;
    if (ev.deltaMode === 1) dy *= 16;                            // lines → px
    else if (ev.deltaMode === 2) dy *= canvasWrap.clientHeight;  // pages → px
    pendingDelta += dy;
    anchorX = ev.clientX;
    anchorY = ev.clientY;
    if (!wheelRaf) wheelRaf = requestAnimationFrame(flushWheel);
  }

  /** @param {string} direction */
  function zoomFromCenter(direction) {
    const wr = canvasWrap.getBoundingClientRect();
    const cx = wr.left + wr.width / 2;
    const cy = wr.top + wr.height / 2;
    if (direction === 'reset') { zoomTo(1, cx, cy); return; }
    zoomTo(state.zoom * (direction === 'in' ? 1.25 : 1 / 1.25), cx, cy);
  }

  canvasWrap.addEventListener('wheel', onWheelZoom, { passive: false });

  const zc = document.getElementById('zoom-controls');
  if (zc) {
    zc.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target)?.closest?.('button');
      if (btn && btn.dataset.zoom) zoomFromCenter(btn.dataset.zoom);
    });
  }

  // Re-apply zoom whenever the canvas-wrap resizes (panel-open transition).
  new ResizeObserver(() => { if (state.baseWidth) backend.applyZoom(); }).observe(canvasWrap);

  return { zoomTo, zoomFromCenter };
}
