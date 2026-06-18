// --------------------------------------------------------------------
// render/registry — the view registry (multi-view seam) plus the two
// built-in views (layer bands, flow DAG). Adding a future view (call
// graph, dependency matrix, ...) = registerView({...}) with no change to
// the render lifecycle. The original's ~6 scattered `state.grouping ===
// 'flow'` conditionals collapse into "look up the active ViewDef".
// --------------------------------------------------------------------

import { state } from '../store.js';
import { t, pickBilingual } from '../i18n.js';
import { countLabel } from '../data/counts.js';
import { layoutLayers } from '../layout/layers.js';
import { layoutGrouped } from '../layout/groups.js';
import { diagramOf } from '../data/diagram.js';
import { renderFlow } from '../diagram/mermaid-render.js';
import { makeNodeEl } from './node.js';
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

        const gsumText = pickBilingual(f.group, 'summary', st.lang);
        if (gsumText) {
          const gsum = document.createElementNS(NS, 'text');
          gsum.setAttribute('class', 'gsummary');
          gsum.setAttribute('x', String(f.x + st.LAYOUT.bandLabelX));
          gsum.setAttribute('y', String(f.y + 38));
          gsum.textContent = gsumText;
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
        summary.textContent = pickBilingual(b.layer, 'summary', st.lang);
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
  // Mermaid renders asynchronously, but the view lifecycle is synchronous. The
  // bridge: kick the async render off here, cache the result keyed by
  // flow|lang|theme (so a flow/language/theme change re-renders), and request
  // another render on resolve — which then hits the cache. Until then, a
  // 'flow-loading' placeholder. Mermaid sizes the diagram; we read its viewBox.
  computeLayout(st, ctx) {
    ctx.populateFlowList();   // refresh the left flow sidebar before laying out
    const canvasWidth = ctx.canvasWidth();
    const flow = resolveActiveFlow(st);
    if (!flow) return { width: Math.max(canvasWidth, 200), height: 200, kind: 'empty' };
    const dg = diagramOf(flow, st.classById);   // invalid/absent → null → empty
    if (!dg) return { width: Math.max(canvasWidth, 200), height: 200, kind: 'empty' };

    const key = `${flow.id}|${st.lang}|${currentTheme()}`;
    const cache = st.flowRender;
    if (cache && cache.key === key) {
      if (cache.fallback) return { width: Math.max(canvasWidth, 200), height: Math.max(cache.height || 300, 300), kind: 'flow-fallback', def: cache.def };
      return { width: Math.max(cache.width, canvasWidth), height: Math.max(cache.height, 200), kind: 'flow-mermaid', svg: cache.svg, bind: cache.bind };
    }
    if (st.flowRenderPending !== key) {
      st.flowRenderPending = key;
      renderFlow({ diagram: dg, classById: st.classById, lang: st.lang, theme: currentTheme(), onSelect: ctx.handlers.onSelect })
        .then((res) => {
          st.flowRender = res.ok
            ? { key, svg: res.svg, bind: res.bind, width: res.width, height: res.height }
            : { key, fallback: true, def: res.def, height: 300 };
          if (st.flowRenderPending === key) st.flowRenderPending = null;
          ctx.requestRender();
        });
    }
    return { width: Math.max(canvasWidth, 200), height: 200, kind: 'flow-loading' };
  },
  buildContent(backend, layout, ctx) {
    const st = ctx.state;
    if (layout.kind === 'empty' || layout.kind === 'flow-loading') {
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'summary');
      txt.setAttribute('x', String(layout.width / 2));
      txt.setAttribute('y', '100');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = t(layout.kind === 'flow-loading' ? 'flow_loading' : 'flow_empty', st.lang);
      backend.add(txt);
      return;
    }
    if (layout.kind === 'flow-mermaid') {
      // Parse Mermaid's SVG string fresh each render (ids are stable, so the
      // cached bindFunctions re-attaches click handlers to this element) and
      // nest it in our main SVG — pan/zoom/export all keep working unchanged.
      const doc = new DOMParser().parseFromString(layout.svg, 'image/svg+xml');
      const inner = /** @type {any} */ (document.importNode(doc.documentElement, true));
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
      inner.setAttribute('class', 'mermaid-flow');
      backend.add(inner);
      if (layout.bind) { try { layout.bind(inner); } catch (e) { console.warn('[code-map] mermaid bindFunctions failed:', e); } }
      return;
    }
    if (layout.kind === 'flow-fallback') {
      buildFlowFallback(backend, layout, st);
      return;
    }
  },
};

/** Current theme for Mermaid: the viewer keeps theme on body.light (no state
 *  field), so read it from the DOM. */
function currentTheme() {
  return (typeof document !== 'undefined' && document.body.classList.contains('light')) ? 'light' : 'dark';
}

/** CDN-failure fallback: show the compiled Mermaid source as copyable text +
 *  a mermaid.live link, inside a foreignObject so it scrolls/selects. */
function buildFlowFallback(backend, layout, st) {
  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('x', '20'); fo.setAttribute('y', '20');
  fo.setAttribute('width', String(Math.max(layout.width - 40, 320)));
  fo.setAttribute('height', String(Math.max(layout.height - 40, 240)));
  const div = document.createElement('div');
  div.className = 'flow-fallback';
  const note = document.createElement('p');
  note.textContent = t('flow_cdn_failed', st.lang);
  const pre = document.createElement('pre');
  pre.textContent = layout.def;
  const link = document.createElement('a');
  link.href = 'https://mermaid.live/'; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = 'mermaid.live';
  div.append(note, pre, link);
  fo.appendChild(div);
  backend.add(fo);
}

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
