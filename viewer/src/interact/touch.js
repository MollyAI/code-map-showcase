// --------------------------------------------------------------------
// interact/touch — two-finger pinch-to-zoom for touch devices. One-finger
// pan is left to .canvas-wrap's native scroll (CSS touch-action: pan-x
// pan-y, which also disables the browser's whole-page pinch). This module
// owns ONLY the two-finger pinch, mapping it onto zoom.js's existing zoomTo
// (anchored at the fingers' midpoint). Mouse/wheel paths (zoom.js, pan.js)
// are untouched. Top-level is DOM-free so the pure helpers are unit-testable
// under node.
// --------------------------------------------------------------------

import { state } from '../store.js';

/** @typedef {{ clientX: number, clientY: number }} Pt */

/** @param {Pt} a @param {Pt} b @returns {number} euclidean distance */
export function touchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** @param {Pt} a @param {Pt} b @returns {{ x: number, y: number }} client-space midpoint */
export function touchMidpoint(a, b) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/** Absolute target zoom for a pinch: startZoom scaled by the finger-distance
 *  ratio. A degenerate start distance (0) leaves the zoom unchanged.
 *  @param {number} startZoom @param {number} startDist @param {number} curDist
 *  @returns {number} */
export function pinchZoom(startZoom, startDist, curDist) {
  if (!(startDist > 0)) return startZoom;
  return startZoom * (curDist / startDist);
}

/**
 * Wire two-finger pinch-to-zoom on the canvas. Single-touch is ignored here
 * (native scroll handles one-finger pan); only a two-finger gesture is
 * captured, and only then is the default prevented — so a one-finger tap
 * still produces a click and selects a node.
 * @param {object} deps
 * @param {HTMLElement} deps.canvasWrap
 * @param {(z: number, anchorX: number, anchorY: number) => void} deps.zoomTo
 */
export function initTouchZoom({ canvasWrap, zoomTo }) {
  if (!canvasWrap) return;
  let startDist = 0;
  let startZoom = 1;
  let pinching = false;

  canvasWrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 2) { pinching = false; return; }
    startDist = touchDistance(ev.touches[0], ev.touches[1]);
    startZoom = state.zoom;
    pinching = startDist > 0;
  }, { passive: true });

  canvasWrap.addEventListener('touchmove', (ev) => {
    if (!pinching || ev.touches.length !== 2) return;
    ev.preventDefault();   // take the gesture over from native scroll
    const dist = touchDistance(ev.touches[0], ev.touches[1]);
    const mid = touchMidpoint(ev.touches[0], ev.touches[1]);
    zoomTo(pinchZoom(startZoom, startDist, dist), mid.x, mid.y);
  }, { passive: false });

  const end = (/** @type {TouchEvent} */ ev) => { if (ev.touches.length < 2) pinching = false; };
  canvasWrap.addEventListener('touchend', end);
  canvasWrap.addEventListener('touchcancel', end);
}
