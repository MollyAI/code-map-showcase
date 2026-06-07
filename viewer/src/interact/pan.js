// --------------------------------------------------------------------
// interact/pan — left-click drag on the background scrolls canvas-wrap.
// A PAN_THRESHOLD discriminates a click from a drag; after a real drag we
// set suppressNextSvgClick so the trailing click doesn't deselect. The
// background-click deselect handler lives here too because it shares that
// flag. Both behaviors are load-bearing (§9) — keep verbatim.
// --------------------------------------------------------------------

/**
 * @param {HTMLElement} canvasWrap
 * @param {SVGSVGElement} svg
 * @param {() => void} onBackgroundClick  deselect (was selectNode(null))
 */
export function initPan(canvasWrap, svg, onBackgroundClick) {
  /** @type {null | { startX: number, startY: number, startScrollLeft: number, startScrollTop: number, moved: boolean }} */
  let panState = null;
  let suppressNextSvgClick = false;
  const PAN_THRESHOLD = 4;   // px — below this the gesture is a click, not a pan

  canvasWrap.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const target = /** @type {Element} */ (ev.target);
    // Don't hijack clicks on interactive children.
    if (target.closest('.node') || target.closest('.zoom-controls')) return;
    panState = {
      startX: ev.clientX, startY: ev.clientY,
      startScrollLeft: canvasWrap.scrollLeft, startScrollTop: canvasWrap.scrollTop,
      moved: false,
    };
  });

  window.addEventListener('mousemove', (ev) => {
    if (!panState) return;
    const dx = ev.clientX - panState.startX;
    const dy = ev.clientY - panState.startY;
    if (!panState.moved && (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD)) {
      panState.moved = true;
      canvasWrap.classList.add('panning');
    }
    if (panState.moved) {
      canvasWrap.scrollLeft = panState.startScrollLeft - dx;
      canvasWrap.scrollTop = panState.startScrollTop - dy;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!panState) return;
    if (panState.moved) suppressNextSvgClick = true;  // imminent click is the drag's tail
    panState = null;
    canvasWrap.classList.remove('panning');
  });

  // One-time background-click handler (deselect) — registered once, not per render.
  svg.addEventListener('click', () => {
    if (suppressNextSvgClick) { suppressNextSvgClick = false; return; }
    onBackgroundClick();
  });
}
