// --------------------------------------------------------------------
// data/load — fetch code-map.json (no-store, so a rebuild is picked up on
// refresh) and dispatch to onModel/onError. Normalization + indexing +
// rendering are the caller's job (main.js). Was load() in index.html.
//
// The data URL is resolved by data/source.js: `/code-map.json` for local
// single-project serving, or `../data/<slug>/code-map.json` when opened as
// `?project=<slug>` in a multi-project gallery (GitHub Pages).
// --------------------------------------------------------------------

import { dataUrl } from './source.js';

/**
 * @param {object} deps
 * @param {(json: any) => void} deps.onModel
 * @param {(msg: string) => void} deps.onError
 */
export async function load({ onModel, onError }) {
  try {
    const r = await fetch(dataUrl('code-map.json'), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    onModel(data);
  } catch (e) {
    onError((e && /** @type {any} */ (e).message) || String(e));
  }
}
