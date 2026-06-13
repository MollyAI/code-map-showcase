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
import { layoutGrouped } from '../layout/groups.js';
import { layoutPipeline } from '../layout/pipeline.js';
import { layoutSequence } from '../layout/sequence.js';
import { diagramOf } from '../data/diagram.js';
import { makeNodeEl } from './node.js';
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

// Core-only filter + layer grouping. The viewer shows core declarations only
// (the all-classes view was removed); Phase 1's lonely-layer floor keeps thin
// layers from rendering with a single box.
/** @param {any} st */
function visibleLayers(st) {
  const layers = [];
  for (const L of st.raw.layers) {
    const cls = L.classes.filter((/** @type {any} */ c) => c.core);
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

/** @type {import('./scene.js').ViewDef} */
const layerView = {
  id: 'layer',
  labelKey: 'group_layers',
  computeLayout(st, ctx) {
    const layers = visibleLayers(st);
    const canvasWidth = ctx.canvasWidth();
    const groups = st.raw.layer_groups;
    if (groups && groups.length) {
      const { bands, frames, totalHeight } = layoutGrouped(layers, groups, canvasWidth, st.LAYOUT);
      return { width: canvasWidth, height: Math.max(totalHeight, 200), bands, frames };
    }
    const { bands, totalHeight } = layoutLayers(layers, canvasWidth, st.LAYOUT);
    return { width: canvasWidth, height: Math.max(totalHeight, 200), bands, frames: [] };
  },
  buildContent(backend, layout, ctx) {
    const st = ctx.state;
    // edges group is created here but appended LAST so it paints on top.
    const gEdges = document.createElementNS(NS, 'g');
    gEdges.setAttribute('id', 'edges');

    // Group umbrella frames (2D layering) — drawn FIRST so bands paint on top.
    // A frame whose group has no `name` (bare peer) renders no title text.
    for (const f of layout.frames || []) {
      const gGroup = document.createElementNS(NS, 'g');
      gGroup.setAttribute('class', 'layer-group');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'bg');
      rect.setAttribute('x', String(f.x));
      rect.setAttribute('y', String(f.y));
      rect.setAttribute('width', String(f.width));
      rect.setAttribute('height', String(f.height));
      rect.setAttribute('rx', '4');
      gGroup.appendChild(rect);

      if (f.group.name) {
        const glabel = document.createElementNS(NS, 'text');
        glabel.setAttribute('class', 'glabel');
        glabel.setAttribute('x', String(f.x + st.LAYOUT.bandLabelX));
        glabel.setAttribute('y', String(f.y + 22));
        glabel.textContent = f.group.name;
        gGroup.appendChild(glabel);

        if (f.group.summary) {
          const gsum = document.createElementNS(NS, 'text');
          gsum.setAttribute('class', 'gsummary');
          gsum.setAttribute('x', String(f.x + st.LAYOUT.bandLabelX));
          gsum.setAttribute('y', String(f.y + 38));
          gsum.textContent = f.group.summary;
          gGroup.appendChild(gsum);
        }
      }
      backend.add(gGroup);
    }

    for (const b of layout.bands) {
      // A band with a `group` is a nested child sub-band (drawn inside a group
      // umbrella). It sits one level deeper than a top-level band: smaller
      // title (.sub-band CSS), tighter header (no room for a summary line), and
      // its label baseline rides higher inside the compact CHILD_HEAD region.
      const isSub = !!b.layer.group;
      const labelY = b.y + (isSub ? 22 : 26);

      const gBand = document.createElementNS(NS, 'g');
      gBand.setAttribute('class', isSub ? 'layer-band sub-band' : 'layer-band');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'bg');
      rect.setAttribute('x', String(b.x));
      rect.setAttribute('y', String(b.y));
      rect.setAttribute('width', String(b.width));
      rect.setAttribute('height', String(b.height));
      rect.setAttribute('rx', '3');
      gBand.appendChild(rect);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'label');
      label.setAttribute('x', String(b.x + st.LAYOUT.bandLabelX));
      label.setAttribute('y', String(labelY));
      label.textContent = b.layer.name;
      gBand.appendChild(label);

      // The summary line only fits under a top-level band; a nested sub-band
      // would overlap its node row, and the group umbrella already carries the
      // wider context.
      if (!isSub) {
        const summary = document.createElementNS(NS, 'text');
        summary.setAttribute('class', 'summary');
        summary.setAttribute('x', String(b.x + st.LAYOUT.bandLabelX));
        summary.setAttribute('y', String(b.y + 44));
        summary.textContent = b.layer.summary || '';
        gBand.appendChild(summary);
      }

      const count = document.createElementNS(NS, 'text');
      count.setAttribute('class', 'count');
      count.setAttribute('x', String(b.x + b.width - 16));
      count.setAttribute('y', String(labelY));
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
    // No DAG fallback — flowsById only holds flows with a valid diagram.
    return { width: Math.max(canvasWidth, 200), height: 200, kind: 'empty' };
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
    // No other kinds: computeLayout only emits 'empty' (handled above) /
    // 'pipeline' / 'sequence'. The DAG ('flow') renderer was removed in v1.19.
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
