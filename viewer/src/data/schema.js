// --------------------------------------------------------------------
// data/schema — pure data normalization for the loaded code-map JSON,
// extracted verbatim from viewer/index.html's `normalizeIds`. DOM-free
// and side-effect-free so it imports cleanly under node (tests, tsc).
//
// `loadModel(json)` returns a *new* normalized model — it never mutates
// the input `json`, its `layers`, or its `classes` (the original
// `normalizeIds(d)` mutated `d` in place; this works on a copy).
//
// Invariants preserved exactly from the original:
//   - id fallback chain: `c.path || c.namespace + "." + c.name || c.name`
//     (`+` binds tighter than `||`, so the middle term is the full
//     `namespace + "." + name`). id = qualified_name is an external key —
//     its format must not change.
//   - package / namespace are mirrored both ways when only one is set.
//   - loc / method_count / signature defaults: 0 / 0 / "".
//   - in_degree / out_degree / importance are backfilled from `edges`
//     when missing; with no edges, importance falls back to 0.5.
//   - description_zh / description_en are written ONLY by Phase 2 and are
//     left untouched here.
//
// `schemaVersion` (number, currently 1) is stamped on the returned model
// to support snapshot/diff versioning.
// --------------------------------------------------------------------

/** Current schema version stamped onto every loaded model. */
export const SCHEMA_VERSION = 1;

/**
 * A class / declaration datum. Only the fields touched by normalization
 * are typed here; the rest pass through unchanged (e.g. description_zh).
 * @typedef {object} ClassDatum
 * @property {string} [id] qualified_name; external key, format-stable
 * @property {string} [path]
 * @property {string} [namespace]
 * @property {string} [package]
 * @property {string} name
 * @property {number} [loc]
 * @property {number} [method_count]
 * @property {string} [signature]
 * @property {number} [in_degree]
 * @property {number} [out_degree]
 * @property {number} [importance]
 */

/**
 * A layer band.
 * @typedef {object} Layer
 * @property {string} [id]
 * @property {string} name
 * @property {number} [order]
 * @property {string} [summary_zh]
 * @property {string} [summary_en]
 * @property {string} [summary]  legacy 单语/拼接串 — 渲染层经 pickBilingual 兜底,INV-B1 判红
 * @property {ClassDatum[]} classes
 */

/**
 * A graph edge.
 * @typedef {{ from: string, to: string, kind?: string }} Edge
 */

/**
 * The raw code-map JSON shape (subset relevant to normalization).
 * @typedef {object} CodeMapJson
 * @property {object} [project]
 * @property {Layer[]} layers
 * @property {Edge[]} [edges]
 * @property {object[]} [flows]
 */

/**
 * Normalize a loaded code-map JSON into a model, without mutating input.
 *
 * Returns a shallow-copied model whose `layers` and their `classes` are
 * fresh objects, with missing ids / package-namespace mirrors / field
 * defaults / degree+importance backfill applied (matching the original
 * `normalizeIds`), and `schemaVersion` stamped on.
 *
 * @param {CodeMapJson} json
 * @returns {CodeMapJson & { schemaVersion: number }}
 */
export function loadModel(json) {
  const layers = (json.layers || []).map((L) => ({
    ...L,
    classes: (L.classes || []).map((c) => ({ ...c })),
  }));

  // Ensure every class has an id. Phase 1 (analyze.mjs) sets id =
  // qualified_name, but Phase 2 AI-written JSON may omit it. Fall back to
  // path, then namespace.name, then name. (`+` binds tighter than `||`.)
  for (const L of layers) {
    for (const c of L.classes) {
      if (!c.id) {
        c.id = c.path || c.namespace + "." + c.name || c.name;
      }
    }
  }
  // Normalize package / namespace — Phase 1 emits both, AI may write only one.
  for (const L of layers) {
    for (const c of L.classes) {
      if (!c.package && c.namespace) c.package = c.namespace;
      if (!c.namespace && c.package) c.namespace = c.package;
      // Defaults for fields added by newer Phase 1 — keep old code-map.json loading.
      if (c.loc == null) c.loc = 0;
      if (c.method_count == null) c.method_count = 0;
      if (c.signature == null) c.signature = "";
    }
  }
  // Also populate in_degree/out_degree/importance from edges if missing.
  const edges = json.edges;
  if (edges && edges.length) {
    /** @type {Map<string, number>} */
    const inDeg = new Map();
    /** @type {Map<string, number>} */
    const outDeg = new Map();
    for (const e of edges) {
      outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    }
    for (const L of layers) {
      for (const c of L.classes) {
        // c.id is guaranteed assigned by the id-fallback pass above.
        const id = /** @type {string} */ (c.id);
        if (c.in_degree == null) c.in_degree = inDeg.get(id) || 0;
        if (c.out_degree == null) c.out_degree = outDeg.get(id) || 0;
        if (c.importance == null) {
          const maxIn = Math.max(...inDeg.values(), 1);
          const maxOut = Math.max(...outDeg.values(), 1);
          c.importance = 0.7 * (c.in_degree / maxIn) + 0.2 * (c.out_degree / maxOut);
        }
      }
    }
  } else {
    // No edges — assign uniform importance so nodes still display.
    for (const L of layers) {
      for (const c of L.classes) {
        if (c.in_degree == null) c.in_degree = 0;
        if (c.out_degree == null) c.out_degree = 0;
        if (c.importance == null) c.importance = 0.5;
      }
    }
  }

  return { ...json, layers, schemaVersion: SCHEMA_VERSION };
}
