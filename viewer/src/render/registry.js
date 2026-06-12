// --------------------------------------------------------------------
// render/registry — the view registry (multi-view seam) plus the two
// built-in views (layer bands, flow DAG). Adding a future view (call
// graph, dependency matrix, ...) = registerView({...}) with no change to
// the render lifecycle. The original's ~6 scattered `state.grouping ===
// 'flow'` conditionals collapse into "look up the active ViewDef".
// --------------------------------------------------------------------

import { state } from '../store.js';
import { t } from '../i18n.js';
import { countLabel } from '../data/counts.js';
import { layoutLayers } from '../layout/layers.js';
import { layoutFlow } from '../layout/flow.js';
import { layoutPipeline } from '../layout/pipeline.js';
import { layoutSequence } from '../layout/sequence.js';
import { diagramOf } from '../data/diagram.js';
import { makeNodeEl } from './node.js';
import { buildFlowEdgePath, flowEdgeClass } from './edges.js';
import { buildPipelineContent, buildSequenceContent } from './diagrams.js';
import { renderScene } from './scene.js';
import { NS } from './backend.js';

/** @type {Map<string, import('./scene.js').ViewDef>} */
const views = new Map();

/** @param {import('./scene.js').ViewDef} def */
export function registerView(def) { views.set(def.id, def); }
/** @param {string} id */
export function getView(id) { return views.get(id); }
export function listViews() { return [...views.values()]; }

// Core/all filter + layer grouping (was visibleClasses + groupedLayers).
/** @param {any} st */
function visibleLayers(st) {
  const layers = [];
  for (const L of st.raw.layers) {
    let cls = L.classes;
    if (st.view === 'core') cls = cls.filter((/** @type {any} */ c) => c.core);
    if (cls.length) layers.push({ ...L, classes: cls });
  }
  return layers;
}

// The flow shown right now: the selected stored flow (was resolveActiveFlow).
/** @param {any} st */
export function resolveActiveFlow(st) {
  return st.flowsById.get(st.activeFlow) || null;
}

// Build one node element and register the full nodeById entry (with the
// geometry the layout produced — registerNode only sees id+el, so we build
// the entry here where `n` is in scope).
/** @param {any} st @param {Element} group @param {any} n @param {any} ctx @param {(d:any)=>string[]} decorateNode */
export function appendNode(st, group, n, ctx, decorateNode) {
  const el = makeNodeEl(n, {
    LAYOUT: st.LAYOUT, handlers: ctx.handlers, decorateNode,
    registerNode: () => {},
  });
  group.appendChild(el);
  st.nodeById.set(n.datum.id, {
    datum: n.datum, el, rectEl: el.querySelector('rect'),
    x: n.x, y: n.y, w: n.w, h: n.h,
  });
}

const NO_DECOR = () => [];
// Pipeline-diagram decl nodes: uniform "card on tinted stage" look — the
// flow-core/flow-hub accents read as noise inside stage containers.
const IN_STAGE = () => ['in-stage'];
/** @param {any} datum */
function flowDecorate(datum) {
  const out = [];
  if (datum.hub) out.push('flow-hub');
  if (datum.core) out.push('flow-core');
  return out;
}

/** @type {import('./scene.js').ViewDef} */
const layerView = {
  id: 'layer',
  labelKey: 'group_layers',
  computeLayout(st, ctx) {
    const layers = visibleLayers(st);
    const canvasWidth = ctx.canvasWidth();
    const { bands, totalHeight } = layoutLayers(layers, canvasWidth, st.LAYOUT);
    return { width: canvasWidth, height: Math.max(totalHeight, 200), bands };
  },
  buildContent(backend, layout, ctx) {
    const st = ctx.state;
    // edges group is created here but appended LAST so it paints on top.
    const gEdges = document.createElementNS(NS, 'g');
    gEdges.setAttribute('id', 'edges');
    for (const b of layout.bands) {
      const gBand = document.createElementNS(NS, 'g');
      gBand.setAttribute('class', 'layer-band');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'bg');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', String(b.y));
      rect.setAttribute('width', String(b.width));
      rect.setAttribute('height', String(b.height));
      rect.setAttribute('rx', '3');
      gBand.appendChild(rect);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'label');
      label.setAttribute('x', String(st.LAYOUT.bandLabelX));
      label.setAttribute('y', String(b.y + 26));
      label.textContent = b.layer.name;
      gBand.appendChild(label);

      const summary = document.createElementNS(NS, 'text');
      summary.setAttribute('class', 'summary');
      summary.setAttribute('x', String(st.LAYOUT.bandLabelX));
      summary.setAttribute('y', String(b.y + 44));
      summary.textContent = b.layer.summary || '';
      gBand.appendChild(summary);

      const count = document.createElementNS(NS, 'text');
      count.setAttribute('class', 'count');
      count.setAttribute('x', String(b.width - 16));
      count.setAttribute('y', String(b.y + 26));
      count.textContent = countLabel(b.layer.classes, st.lang);
      gBand.appendChild(count);

      for (const node of b.nodes) appendNode(st, gBand, node, ctx, NO_DECOR);
      backend.add(gBand);
    }
    backend.add(gEdges);   // edges last → on top of bands/nodes
  },
};

/** @type {import('./scene.js').ViewDef} */
const flowView = {
  id: 'flow',
  labelKey: 'group_flows',
  computeLayout(st, ctx) {
    ctx.populateFlowList();   // refresh the left flow sidebar before laying out
    const canvasWidth = ctx.canvasWidth();
    const flow = resolveActiveFlow(st);
    if (!flow) return { width: Math.max(canvasWidth, 200), height: 200, kind: 'empty' };
    const dg = diagramOf(flow, st.classById);   // invalid/absent → null → DAG 回退
    if (dg && dg.type === 'pipeline') {
      const lay = layoutPipeline(flow, st.classById, st.LAYOUT);
      return { width: Math.max(lay.width, canvasWidth), height: Math.max(lay.height, 200), kind: 'pipeline', lay };
    }
    if (dg && dg.type === 'sequence') {
      const lay = layoutSequence(flow, st.LAYOUT);
      return { width: Math.max(lay.width, canvasWidth), height: Math.max(lay.height, 200), kind: 'sequence', lay };
    }
    const lay = layoutFlow(flow, st.classById, st.LAYOUT);
    return { width: Math.max(lay.width, canvasWidth), height: Math.max(lay.height, 200), kind: 'flow', lay };
  },
  buildContent(backend, layout, ctx) {
    const st = ctx.state;
    if (layout.kind === 'empty') {
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'summary');
      txt.setAttribute('x', String(layout.width / 2));
      txt.setAttribute('y', '100');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = t('flow_empty', st.lang);
      backend.add(txt);
      return;
    }
    if (layout.kind === 'pipeline') {
      buildPipelineContent(backend, layout.lay, ctx, { appendNode, flowDecorate: IN_STAGE });
      return;
    }
    if (layout.kind === 'sequence') {
      buildSequenceContent(backend, layout.lay, ctx, { appendNode, flowDecorate: NO_DECOR });
      return;
    }
    const lay = layout.lay;
    const gEdges = document.createElementNS(NS, 'g');
    gEdges.setAttribute('id', 'edges');
    const pos = new Map(lay.nodes.map((/** @type {any} */ n) => [n.datum.id, n]));
    for (const e of lay.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (a && b) {
        const path = document.createElementNS(NS, 'path');
        // resting flow edge; selection re-styles it active/dimmed by endpoint
        // (interact/selection drawEdges) via the data-from/data-to ids.
        path.setAttribute('class', flowEdgeClass(e.kind));
        path.setAttribute('data-from', e.from);
        path.setAttribute('data-to', e.to);
        path.setAttribute('data-kind', e.kind || 'uses');
        if (e.via) path.setAttribute('data-via', e.via);
        path.setAttribute('d', buildFlowEdgePath(a, b));
        gEdges.appendChild(path);
      }
    }
    const gNodes = document.createElementNS(NS, 'g');
    for (const node of lay.nodes) appendNode(st, gNodes, node, ctx, flowDecorate);
    for (const o of lay.omitted || []) {
      const n = pos.get(o.from);
      if (!n) continue;
      const more = document.createElementNS(NS, 'text');
      more.setAttribute('class', 'dispatch-more');
      more.setAttribute('x', String(n.x + n.w + 6));
      more.setAttribute('y', String(n.y + n.h - 2));
      more.textContent = '+' + o.count + ' more';
      gNodes.appendChild(more);
    }
    backend.add(gEdges);   // edges under nodes (flow)
    backend.add(gNodes);
  },
};

export function registerBuiltinViews() {
  registerView(layerView);
  registerView(flowView);
}

/**
 * The store subscriber: pick the active view and run the shared lifecycle.
 * @param {import('./backend.js').RenderBackend} backend
 * @param {any} ctx
 */
export function renderApp(backend, ctx) {
  const view = getView(state.activeView) || getView('layer');
  if (view) renderScene(backend, view, ctx);
}
