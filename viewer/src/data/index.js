// --------------------------------------------------------------------
// data/index — pure index builders for the loaded code-map model,
// extracted verbatim from viewer/index.html's `buildEdgeIndex`,
// `buildClassIndex`, and `buildFlowIndex`. DOM-free and side-effect-free
// so they import cleanly under node (tests, tsc).
//
// The original functions read and wrote globals off `state` / `state.raw`;
// here each takes its inputs as parameters and returns a result object,
// writing nothing global:
//   - buildEdgeIndex: read  state.raw.edges
//                     write state.edgesFromIdx / state.edgesToIdx
//   - buildClassIndex: read  state.raw.layers
//                      write state.classById / state.hubIds
//   - buildFlowIndex: read  state.raw.flows, state.classById, state.activeFlow
//                     write state.flowsById, state.activeFlow
//                     (keeps only flows with a valid pipeline/sequence
//                      `diagram` — the DAG renderer + synthesize fallback were
//                      removed; an undiagrammed flow has nothing to draw.)
// --------------------------------------------------------------------

import { diagramOf } from './diagram.js';

/**
 * A top-level graph edge. `from`/`to` are class ids; `kind` is the edge
 * relation (e.g. "uses", "extends").
 * @typedef {{ from: string, to: string, kind?: string }} GraphEdge
 */

/**
 * A class / declaration datum. Only fields the index builders touch are
 * typed; everything else passes through unchanged.
 * @typedef {{ id: string, name: string, hub?: boolean, tags?: string[] }} ClassDatum
 */

/**
 * A layer band as stored in the model. `classes` is the bucket of
 * declarations assigned to this layer.
 * @typedef {{ classes: ClassDatum[] }} Layer
 */

/**
 * A stored flow as written by Phase 1/2 (`scripts/lib/flows.mjs`). Only the
 * fields this module touches are typed; a valid `diagram` gates visibility.
 * @typedef {{ id: string, diagram?: any }} FlowLike
 */

/**
 * Build the from/to adjacency indexes over the graph edges. Each edge object
 * is kept by reference (not copied) — the same `{from,to,kind}` instance lands
 * in both its `from` bucket and its `to` bucket, exactly as the original did.
 * @param {GraphEdge[]} edges
 * @returns {{ edgesFromIdx: Map<string, GraphEdge[]>, edgesToIdx: Map<string, GraphEdge[]> }}
 */
export function buildEdgeIndex(edges) {
  /** @type {Map<string, GraphEdge[]>} */
  const edgesFromIdx = new Map();
  /** @type {Map<string, GraphEdge[]>} */
  const edgesToIdx = new Map();
  for (const e of edges) {
    if (!edgesFromIdx.has(e.from)) edgesFromIdx.set(e.from, []);
    /** @type {GraphEdge[]} */ (edgesFromIdx.get(e.from)).push(e);
    if (!edgesToIdx.has(e.to)) edgesToIdx.set(e.to, []);
    /** @type {GraphEdge[]} */ (edgesToIdx.get(e.to)).push(e);
  }
  return { edgesFromIdx, edgesToIdx };
}

/**
 * Build the id→class index and the set of hub ids — both consumed by flow
 * mode. Walks every class in every layer; `hubIds` collects the id of any
 * class whose `hub` is truthy (`if (c.hub)` in the original).
 * @param {Layer[]} layers
 * @returns {{ classById: Map<string, ClassDatum>, hubIds: Set<string> }}
 */
export function buildClassIndex(layers) {
  /** @type {Map<string, ClassDatum>} */
  const classById = new Map();
  /** @type {Set<string>} */
  const hubIds = new Set();
  for (const L of layers) {
    for (const c of L.classes) {
      classById.set(c.id, c);
      if (c.hub) hubIds.add(c.id);
    }
  }
  return { classById, hubIds };
}

/**
 * Context for buildFlowIndex.
 * @typedef {object} FlowIndexContext
 * @property {Map<string, ClassDatum>} classById id → class datum (validates diagrams)
 * @property {string | null} [activeFlow] currently selected flow id, if any —
 *   preserved as `defaultFlowId` when it still resolves to a (diagrammed) flow.
 */

/**
 * Build the id→flow index, keeping ONLY flows with a valid pipeline/sequence
 * `diagram` (the DAG renderer was removed — an undiagrammed flow can't render).
 *
 * `defaultFlowId` selection: if `ctx.activeFlow` is non-null AND still present
 * in the built index, it is kept; otherwise it falls to the first flow's id, or
 * `null` when there are no diagrammed flows.
 *
 * @param {{ flows?: FlowLike[] }} model the loaded code-map model (provides `flows`)
 * @param {FlowIndexContext} ctx classById (for diagram validation) + activeFlow
 * @returns {{ flowsById: Map<string, FlowLike>, defaultFlowId: string | null }}
 */
export function buildFlowIndex(model, ctx) {
  // Only flows that carry a valid pipeline/sequence diagram are shown — the old
  // DAG ("关系图") renderer was removed, so an undiagrammed flow has nothing to draw.
  const flows = (model.flows || []).filter((/** @type {any} */ f) => diagramOf(f, ctx.classById));
  /** @type {Map<string, FlowLike>} */
  const flowsById = new Map();
  for (const f of flows) flowsById.set(f.id, f);
  const active = ctx.activeFlow ?? null;
  /** @type {string | null} */
  let defaultFlowId = active;
  if (defaultFlowId == null || !flowsById.has(defaultFlowId)) {
    defaultFlowId = flows.length ? flows[0].id : null;
  }
  return { flowsById, defaultFlowId };
}
