// --------------------------------------------------------------------
// render/diagrams — DOM builders for the two Phase-2-authored diagram
// renderers (pipeline stage containers / sequence lifelines+steps),
// called from registry.js's flowView. Helpers (appendNode, flowDecorate)
// are passed in as a parameter to avoid a registry↔diagrams import cycle.
//
// Constraints honoured here:
//  - link/step paths live in <g id="edges"> with class from
//    flowEdgeClass(kind) + data-from/to/kind, so the selection re-styler
//    (interact/selection drawEdges) can rebuild their classes in place —
//    that re-styler matches `path.edge`, so steps are <path>, not <line>.
//  - NO <marker> elements: export/png.js strips ids on the clone, which
//    breaks url(#...) refs — arrowheads are explicit triangle <path>s.
//  - synthetic nodes (artifact/actor/participant) register into
//    state.nodeById like decl nodes, so click→detail, tooltip and
//    applyVisualState dimming work unchanged.
// --------------------------------------------------------------------

import { pickL } from '../data/diagram.js';
import { buildLinkPath, flowEdgeClass } from './edges.js';
import { SELF_LOOP } from '../layout/sequence.js';
import { NS } from './backend.js';

/** @param {string} tag @param {Record<string, string>} attrs */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Build + register one synthetic node (artifact / actor / participant).
 *  Mirrors registry.appendNode's bookkeeping for non-decl data.
 * @param {any} st @param {Element} group
 * @param {{ datum: any, x: number, y: number, w: number, h: number }} n
 * @param {any} ctx */
function appendSynthetic(st, group, n, ctx) {
  const d = n.datum;
  const g = el('g', {
    class: 'node synthetic ' + d.kind,
    'data-id': d.id,
    transform: `translate(${n.x}, ${n.y})`,
  });
  const rect = el('rect', {
    width: String(n.w), height: String(n.h),
    rx: d.kind === 'actor' ? String(n.h / 2) : '3',
  });
  g.appendChild(rect);
  if (d.kind === 'artifact') {           // folded corner, top-right
    const s = 8;
    g.appendChild(el('path', { class: 'fold', d: `M ${n.w - s} 0 L ${n.w - s} ${s} L ${n.w} ${s}` }));
  }
  const txt = el('text', { class: 'nlabel', x: String(st.LAYOUT.nodePadX), y: String(n.h / 2 + 1) });
  // No truncation: layout sizes the box for the full name in either language.
  txt.textContent = d.name;
  g.appendChild(txt);
  g.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.handlers.onSelect(d.id); });
  g.addEventListener('mouseenter', (ev) => ctx.handlers.onHover(d.id, ev));
  g.addEventListener('mouseleave', () => ctx.handlers.onHoverEnd());
  if (ctx.handlers.onHoverMove) {
    const onMove = ctx.handlers.onHoverMove;
    g.addEventListener('mousemove', (ev) => onMove(ev));
  }
  group.appendChild(g);
  st.nodeById.set(d.id, { datum: d, el: g, rectEl: rect, x: n.x, y: n.y, w: n.w, h: n.h });
}

/** One edge label with halo. @param {number} x @param {number} y @param {string} text */
function labelEl(x, y, text) {
  const node = el('text', { class: 'edge-label', x: String(x), y: String(y) });
  node.textContent = text;
  return node;
}

/**
 * 阶段流水线：stage 容器（底层）→ links+labels（#edges）→ 节点（顶层）。
 * @param {any} backend @param {any} lay @param {any} ctx
 * @param {{ appendNode: Function, flowDecorate: (d: any) => string[] }} helpers
 */
export function buildPipelineContent(backend, lay, ctx, { appendNode, flowDecorate }) {
  const st = ctx.state;
  const lang = st.lang;

  const gStages = el('g', { class: 'stages' });
  lay.stages.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    const g = el('g', { class: 'stage-band stage-c' + (i % 4), 'data-stage': s.id });
    g.appendChild(el('rect', {
      class: 'bg', x: String(s.x), y: String(s.y),
      width: String(s.w), height: String(s.h), rx: '8',
    }));
    const title = el('text', { class: 'stage-title', x: String(s.x + 12), y: String(s.y + 20) });
    // No truncation: layoutPipeline widens each stage to fit its full title.
    title.textContent = pickL(s.spec, 'name', lang);
    g.appendChild(title);
    gStages.appendChild(g);
  });

  const gEdges = el('g', { id: 'edges' });
  const gLabels = el('g', { class: 'edge-labels' });   // topmost so boxes never cover labels
  for (const { link, from, to, label } of lay.links) {
    const kind = link.kind || 'data';
    gEdges.appendChild(el('path', {
      class: flowEdgeClass(kind),
      'data-from': link.from, 'data-to': link.to, 'data-kind': kind,
      d: buildLinkPath(from, to),
    }));
    gLabels.appendChild(labelEl(label.x, label.y, pickL(link, 'label', lang)));
  }

  const gNodes = el('g', { class: 'diagram-nodes' });
  for (const n of lay.nodes) appendNode(st, gNodes, n, ctx, flowDecorate);
  for (const n of lay.extraNodes) appendSynthetic(st, gNodes, n, ctx);

  backend.add(gStages);
  backend.add(gEdges);
  backend.add(gNodes);
  backend.add(gLabels);
}

/**
 * 时序图：lifelines（底层）→ steps+labels+箭头（#edges）→ 参与者盒（顶层）。
 * @param {any} backend @param {any} lay @param {any} ctx
 * @param {{ appendNode: Function, flowDecorate: (d: any) => string[] }} _helpers
 */
export function buildSequenceContent(backend, lay, ctx, _helpers) {
  const st = ctx.state;
  const lang = st.lang;

  const gLife = el('g', { class: 'lifelines' });
  for (const L of lay.lifelines) {
    gLife.appendChild(el('line', {
      class: 'lifeline', x1: String(L.x), y1: String(L.y1), x2: String(L.x), y2: String(L.y2),
    }));
  }

  const gEdges = el('g', { id: 'edges' });
  const gLabels = el('g', { class: 'edge-labels' });   // topmost so boxes never cover labels
  const AR = 7;                                        // arrowhead size
  for (const s of lay.steps) {
    const kind = s.step.kind || 'call';
    const label = `${s.index}. ${pickL(s.step, 'label', lang)}`;
    if (kind === 'self') {
      gEdges.appendChild(el('path', {
        class: flowEdgeClass(kind),
        'data-from': s.step.from, 'data-to': s.step.to, 'data-kind': kind,
        d: `M ${s.x1} ${s.y} h ${SELF_LOOP.w} v ${SELF_LOOP.h} h ${-SELF_LOOP.w}`,
      }));
      // arrowhead pointing back at the lifeline (explicit path — no markers)
      gEdges.appendChild(el('path', {
        class: 'seq-arrowhead self',
        d: `M ${s.x1} ${s.y + SELF_LOOP.h} l ${AR} ${-AR / 2} l 0 ${AR} Z`,
      }));
      // NB: anchor via class — the .edge-label CSS rule (text-anchor: middle)
      // would override a text-anchor presentation attribute.
      const lt = labelEl(s.x1 + SELF_LOOP.w + 8, s.y + SELF_LOOP.h / 2 + 3, label);
      lt.setAttribute('class', 'edge-label start');
      gLabels.appendChild(lt);
      continue;
    }
    gEdges.appendChild(el('path', {
      class: flowEdgeClass(kind),
      'data-from': s.step.from, 'data-to': s.step.to, 'data-kind': kind,
      d: `M ${s.x1} ${s.y} L ${s.x2} ${s.y}`,
    }));
    const dir = s.x2 >= s.x1 ? -1 : 1;      // arrowhead at the target end
    gEdges.appendChild(el('path', {
      class: 'seq-arrowhead' + (kind === 'return' ? ' return' : ''),
      d: `M ${s.x2} ${s.y} l ${dir * AR} ${-AR / 2} l 0 ${AR} Z`,
    }));
    gLabels.appendChild(labelEl((s.x1 + s.x2) / 2, s.y - 6, label));
  }

  const gParts = el('g', { class: 'diagram-nodes' });
  for (const p of lay.participants) {
    const spec = p.spec;
    const kind = (spec.kind || 'code') === 'code' ? 'participant' : spec.kind;
    const datum = {
      ...spec, kind, synthetic: true,
      name: pickL(spec, 'name', lang),
      members: spec.nodes || [],
    };
    appendSynthetic(st, gParts, { datum, x: p.x, y: p.y, w: p.w, h: p.h }, ctx);
  }

  // Wrap in a scope so the `.seq-scope` CSS can render sequence labels one size
  // up (SEQ_FONT_MULT) without touching pipeline. Paint order preserved:
  // lifelines → edges → participant boxes → labels. `#edges` keeps its id, so
  // interact/selection's getElementById/querySelectorAll still resolve it.
  const scope = el('g', { class: 'seq-scope' });
  scope.appendChild(gLife);
  scope.appendChild(gEdges);
  scope.appendChild(gParts);
  scope.appendChild(gLabels);
  backend.add(scope);
}
