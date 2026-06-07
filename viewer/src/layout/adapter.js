// --------------------------------------------------------------------
// layout/adapter — SEAM (placeholder). When the flow layout needs real
// crossing-minimization or non-tree edges that the current BFS-column
// scheme in layout/flow.js can't express, vendor @dagrejs/dagre here —
// the MAINTAINED fork (MIT, ~14KB gzipped, synchronous), NOT the
// abandoned `dagre` package, and NOT elkjs (1.6MB, async). Drop a pinned
// min.js next to index.html and implement:
//
//   layoutFlowViaDagre(flow, classById, LAYOUT) -> Scene
//
// with the SAME signature/return as layout/flow.js:layoutFlow so the
// renderer stays library-agnostic (swap behind this adapter, not in the
// renderer). No dependency is introduced today.
// --------------------------------------------------------------------

export const DAGRE_AVAILABLE = false;
