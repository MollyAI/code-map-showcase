// --------------------------------------------------------------------
// ui/tooltip — the hover tooltip (name + package), positioned next to the
// cursor with a crude offscreen guard. Was showTooltip/hideTooltip/
// positionTooltip in index.html.
// --------------------------------------------------------------------

import { escapeHtml } from '../util.js';

/** @param {HTMLElement} tooltipEl */
export function createTooltip(tooltipEl) {
  /** @param {{ name: string, package?: string }} c */
  function show(c) {
    tooltipEl.innerHTML = `${escapeHtml(c.name)} <span class="pkg">${escapeHtml(c.package || '')}</span>`;
    tooltipEl.classList.add('visible');
  }
  function hide() { tooltipEl.classList.remove('visible'); }
  /** @param {MouseEvent} ev */
  function position(ev) {
    const pad = 14;
    let x = ev.clientX + pad;
    const y = ev.clientY + pad;
    const w = tooltipEl.offsetWidth || 200;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
  }
  return { show, hide, position };
}
