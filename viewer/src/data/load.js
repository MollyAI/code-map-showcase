// --------------------------------------------------------------------
// data/load — fetch code-map.json and dispatch to onModel/onError.
// Normalization + indexing + rendering are the caller's job (main.js).
// Was load() in index.html.
//
// The data URL is resolved by data/source.js: `/code-map.json` for local
// single-project serving, or `../data/<slug>/code-map.json` when opened as
// `?project=<slug>` in a multi-project gallery (GitHub Pages).
//
// Cache policy is mode-dependent (data/source.js isGallery):
//   - local serve (no ?project=): `no-store` — serve.mjs re-reads the file
//     every request, so a rebuild must be picked up on the next refresh.
//   - gallery (?project=): data is static per-publish, so respect the
//     server's caching headers (GitHub Pages sends max-age) instead of
//     forcing a full re-download + re-parse on every navigation. This is the
//     dominant speedup when browsing back and forth between project pages.
// --------------------------------------------------------------------

import { dataUrl, isGallery } from './source.js';

/**
 * @param {object} deps
 * @param {(json: any) => void} deps.onModel
 * @param {(msg: string) => void} deps.onError
 */
export async function load({ onModel, onError }) {
  try {
    const init = isGallery() ? {} : { cache: 'no-store' };
    const r = await fetch(dataUrl('code-map.json'), init);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    onModel(data);
  } catch (e) {
    onError((e && /** @type {any} */ (e).message) || String(e));
  }
}
