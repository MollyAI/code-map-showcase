// --------------------------------------------------------------------
// ui/langstats — the pinned detail-panel footer showing per-language
// declaration counts, sorted desc. Was renderLangStats in index.html.
// --------------------------------------------------------------------

import { escapeHtml } from '../util.js';
import { langColor } from '../render/node.js';

/**
 * @param {{ layers: Array<{ classes: Array<{ language?: string }> }> }} model
 * @param {HTMLElement | null} el
 */
export function renderLangStats(model, el) {
  if (!el) return;
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const L of model.layers) {
    for (const c of L.classes) {
      if (!c.language) continue;
      counts.set(c.language, (counts.get(c.language) || 0) + 1);
    }
  }
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.innerHTML = langs.map(([lang, n]) =>
    `<div class="lang-stat" style="--lang-color:${langColor(lang)}"><span>${escapeHtml(lang)}</span><b>${n}</b></div>`
  ).join('');
}
