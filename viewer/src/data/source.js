// --------------------------------------------------------------------
// data/source — resolve where the viewer fetches its data from.
//
// Single-project mode (local `serve.mjs`, the default): no `?project=`
// query param, so data lives at the server root — `/code-map.json` —
// exactly as before. Behaviour is unchanged.
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
 * Resolve the fetch URL for a data file (e.g. `code-map.json`).
 * @param {string} name basename of the data file
 * @param {string} [search] the query string, e.g. `location.search` ("?project=foo")
 * @returns {string} an absolute (`/name`) or viewer-relative (`../data/<slug>/name`) URL
 */
export function dataUrl(name, search = (typeof location !== 'undefined' ? location.search : '')) {
  const slug = gallerySlug(search);
  return slug ? `../data/${encodeURIComponent(slug)}/${name}` : `/${name}`;
}

/**
 * The `?project=<slug>` value, or null when serving a single project locally.
 * @param {string} [search]
 * @returns {string | null}
 */
function gallerySlug(search = (typeof location !== 'undefined' ? location.search : '')) {
  try {
    const slug = new URLSearchParams(search).get('project');
    return slug ? slug : null;
  } catch (_) { return null; }
}

/**
 * True in multi-project gallery mode (`?project=<slug>` present). The gallery's
 * data is static per-publish, so it should be browser-cacheable; local
 * single-project serving (`serve.mjs`, which re-reads the file every request)
 * must bypass the cache to pick up rebuilds. Consumed by data/load.js.
 * @param {string} [search]
 * @returns {boolean}
 */
export function isGallery(search = (typeof location !== 'undefined' ? location.search : '')) {
  return gallerySlug(search) !== null;
}
