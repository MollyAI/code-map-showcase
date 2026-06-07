// --------------------------------------------------------------------
// data/flows — pure flow-trace logic for the flow renderer, extracted
// verbatim from viewer/index.html's `traceFlow` / `synthesizeFlows`.
// DOM-free and side-effect-free so it imports cleanly under node.
//
// The original functions read four globals off `state`:
//   - `state.edgesFromIdx` (from-id → outgoing edges),
//   - `state.hubIds`        (qualified_names flagged hub → flow leaves),
//   - `state.classById`     (id → class datum),
//   - `state.flowMaxDepth`  (depth cap, default 6).
// Here they are passed in through an explicit `ctx` parameter instead.
//
// Mirrors scripts/lib/flows.mjs:traceFlow / buildFlows for the uses-only
// CLIENT-SIDE FALLBACK (old JSON without flows[]). Dispatch expansion is
// Phase-1-only — it needs declaration `refs`, which are not serialized — so
// this fallback never synthesizes dispatch edges; new builds carry them from
// Phase 1 and the renderer just draws kind:"dispatch" dashed. Forward BFS over 'uses' edges; a hub node is
// included but not expanded (leaf) unless it is the seed; each node is
// placed once at its shortest depth; the traversal stops past maxDepth.
// Flow `edges` carry ONLY `{ from, to }` (no `kind`) — that field lives
// only on the top-level graph edges.
// --------------------------------------------------------------------

/**
 * A graph edge as stored in `edgesFromIdx` (the top-level edge shape).
 * @typedef {{ from?: string, to: string, kind?: string }} GraphEdge
 */

/**
 * A class/declaration datum keyed by id in `classById`.
 * @typedef {{ id: string, name: string, tags?: string[] }} ClassDatum
 */

/**
 * Context replacing the globals the original closures read off `state`.
 * @typedef {object} FlowContext
 * @property {Map<string, GraphEdge[]>} edgesFromIdx from-id → outgoing edges
 * @property {Set<string>} hubIds qualified_names flagged hub (flow leaves)
 * @property {Map<string, ClassDatum>} classById id → class datum
 * @property {number} maxDepth depth cap (Python default 6)
 */

/**
 * A flow edge — only `{ from, to }`, never `kind`.
 * @typedef {{ from: string, to: string }} FlowEdge
 */

/**
 * The node ids + edges produced by a single trace.
 * @typedef {{ nodes: string[], edges: FlowEdge[] }} FlowTrace
 */

/**
 * A fully-formed flow (the shape consumed by the flow renderer and written
 * by scripts/lib/flows.py:build_flows).
 * @typedef {object} Flow
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} seed
 * @property {string[]} nodes
 * @property {FlowEdge[]} edges
 * @property {string} confidence
 */

/**
 * Forward BFS over 'uses' edges from `seedId`, mirroring
 * scripts/lib/flows.py:trace_flow. A hub node is included but not expanded
 * (leaf) unless it is the seed itself; each node is placed once at its
 * shortest depth; edges back to an already-placed node are omitted; the
 * traversal stops past `ctx.maxDepth`.
 * @param {string} seedId
 * @param {FlowContext} ctx
 * @returns {FlowTrace} ordered node ids + flow edges (`{ from, to }` only)
 */
export function traceFlow(seedId, ctx) {
  const { edgesFromIdx, hubIds, classById, maxDepth } = ctx;
  const visited = new Set([seedId]);
  const nodes = [seedId];
  /** @type {FlowEdge[]} */
  const edges = [];
  const depth = new Map([[seedId, 0]]);
  const queue = [seedId];
  while (queue.length) {
    const u = /** @type {string} */ (queue.shift());
    if (u !== seedId && hubIds.has(u)) continue;
    if (/** @type {number} */ (depth.get(u)) >= maxDepth) continue;
    const outs = (edgesFromIdx.get(u) || []).filter(e => e.kind === "uses");
    for (const e of outs) {
      const v = e.to;
      if (!classById.has(v) || visited.has(v)) continue;
      visited.add(v);
      depth.set(v, /** @type {number} */ (depth.get(u)) + 1);
      nodes.push(v);
      edges.push({ from: u, to: v });
      queue.push(v);
    }
  }
  return { nodes, edges };
}

/**
 * Synthesize flows client-side when the JSON has none (old builds): one per
 * entry-point class, traced with the same rules. Mirrors
 * scripts/lib/flows.py:build_flows (which seeds on entry-point declarations).
 * @param {Iterable<ClassDatum>} classes the class data (e.g. `classById.values()`)
 * @param {FlowContext} ctx
 * @returns {Flow[]}
 */
export function synthesizeFlows(classes, ctx) {
  /** @type {Flow[]} */
  const out = [];
  for (const c of classes) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (!tags.includes("entry-point")) continue;
    const { nodes, edges } = traceFlow(c.id, ctx);
    out.push({ id: "flow:" + c.id, name: c.name, description: "",
               seed: c.id, nodes, edges, confidence: "high" });
  }
  return out;
}
