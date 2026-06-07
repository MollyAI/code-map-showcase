// --------------------------------------------------------------------
// data/source — resolve where the viewer fetches its data from.
//
// Single-project mode (local `serve.mjs`, the default): no `?project=`
// query param, so data lives at the server root — `/code-map.json`,
// `/git-history.json` — exactly as before. Behaviour is unchanged.
//
// Multi-project mode (a static gallery such as GitHub Pages): the page is
// opened as `viewer/index.html?project=<slug>`, and each project's data
// sits in a sibling `data/<slug>/` directory next to the viewer. The URL is
// resolved RELATIVE to the viewer page (`../data/<slug>/…`) so it works under
// any base path (`/code-map-showcase/`, a user/org root, etc.) without the
// viewer knowing where it is deployed.
//
// Pure (DOM-free): `search` is injected and defaults to `location.search`,
// so the resolver is unit-testable under node.
// --------------------------------------------------------------------

/**
 * Resolve the fetch URL for a data file (`code-map.json` / `git-history.json`).
 * @param {string} name basename of the data file
 * @param {string} [search] the query string, e.g. `location.search` ("?project=foo")
 * @returns {string} an absolute (`/name`) or viewer-relative (`../data/<slug>/name`) URL
 */
export function dataUrl(name, search = (typeof location !== 'undefined' ? location.search : '')) {
  let slug = null;
  try { slug = new URLSearchParams(search).get('project'); } catch (_) { slug = null; }
  return slug ? `../data/${encodeURIComponent(slug)}/${name}` : `/${name}`;
}
