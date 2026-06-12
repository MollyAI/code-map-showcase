// --------------------------------------------------------------------
// ui/buildpopover — click-to-open popover for the build-info badge.
// Replaces the native `title` tooltip so the content (full commit hash,
// build time, score breakdown) is selectable, with a one-click copy-all
// button. The popover element lives at body level (like #tooltip): the
// topbar's backdrop-filter would otherwise become the containing block
// for position:fixed and break viewport positioning.
// --------------------------------------------------------------------

import { copyToClipboard, escapeHtml } from '../util.js';
import { t } from '../i18n.js';

/**
 * @param {{ badgeEl: HTMLElement, popEl: HTMLElement, getLang: () => string }} opts
 * @returns {{ sync: (lines: string[]) => void, close: () => void }}
 */
export function createBuildPopover({ badgeEl, popEl, getLang }) {
  /** @type {string[]} */
  let lines = [];

  function render() {
    const tr = (/** @type {string} */ k) => t(k, getLang());
    popEl.innerHTML = `<button class="copy">${escapeHtml(tr('copy'))}</button>
      <div class="rows">${lines.map(l => `<div class="row">${escapeHtml(l)}</div>`).join('')}</div>`;
    const btn = /** @type {HTMLButtonElement} */ (popEl.querySelector('.copy'));
    btn.addEventListener('click', () => {
      copyToClipboard(lines.join('\n')).then(() => {
        btn.textContent = tr('copied');
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = tr('copy'); btn.classList.remove('ok'); }, 1400);
      }).catch(() => {
        btn.textContent = tr('failed');
        setTimeout(() => { btn.textContent = tr('copy'); }, 1400);
      });
    });
  }

  // Anchor under the badge's left edge, nudged back inside the viewport
  // when the popover would overflow on the right.
  function position() {
    const r = badgeEl.getBoundingClientRect();
    const w = popEl.offsetWidth;
    const x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    popEl.style.left = x + 'px';
    popEl.style.top = (r.bottom + 8) + 'px';
  }

  function open() {
    if (!lines.length) return;
    render();
    popEl.hidden = false;
    position();
  }
  function close() { popEl.hidden = true; }

  /**
   * Called on every renderBuildInfo (incl. the language toggle): keep the
   * line set current, and re-render in place when the popover is open.
   * @param {string[]} newLines
   */
  function sync(newLines) {
    lines = newLines || [];
    if (popEl.hidden) return;
    if (!lines.length) { close(); return; }
    render();
    position();
  }

  badgeEl.addEventListener('click', (ev) => {
    ev.stopPropagation();
    popEl.hidden ? open() : close();
  });
  document.addEventListener('click', (ev) => {
    if (!popEl.hidden && !popEl.contains(/** @type {Node} */ (ev.target))) close();
  });
  // Capture phase so an open popover swallows the Escape that would
  // otherwise also deselect the current node (keyboard.js listens on bubble).
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !popEl.hidden) { ev.stopPropagation(); close(); }
  }, true);

  return { sync, close };
}
