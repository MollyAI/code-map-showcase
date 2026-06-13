// --------------------------------------------------------------------
// layout/pipeline — pure geometry for the Phase-2-authored stage-pipeline
// diagram (flow.diagram.type === 'pipeline'). DOM-free. Convention shared
// with layout/sequence.js: fontScale is recovered from LAYOUT.charW,
// stage columns run left→right, members stack vertically inside their
// stage container, all stages share the max height (spec §4 等高对齐).
// Caller guarantees the diagram passed validateDiagram; this module is
// still defensive (unknown ids are skipped, never thrown).
// --------------------------------------------------------------------

import { LAYOUT_BASE, nodeWidth, labelWidth } from './metrics.js';

/**
 * @typedef {import('./metrics.js').Layout} Layout
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 */

/** Synthetic datum for an extra node (artifact / actor) — the shape the
 *  renderer registers into nodeById and the detail panel reads.
 * @param {any} spec */
function extraDatum(spec) {
  return { ...spec, name: spec.name || '', synthetic: true, members: [] };
}

/**
 * @param {any} flow  flow with a VALIDATED pipeline diagram
 * @param {Map<string, any>} classById
 * @param {Layout} LAYOUT
 * @returns {{
 *   stages: Array<{ id: string, x: number, y: number, w: number, h: number, spec: any }>,
 *   nodes: Array<{ datum: any, x: number, y: number, w: number, h: number }>,
 *   extraNodes: Array<{ datum: any, x: number, y: number, w: number, h: number }>,
 *   links: Array<{ link: any, from: Rect, to: Rect, label: { x: number, y: number } }>,
 *   width: number, height: number,
 * }}
 */
export function layoutPipeline(flow, classById, LAYOUT) {
  const dg = flow.diagram;
  const fontScale = LAYOUT.charW / LAYOUT_BASE.charW;
  const COL_GAP = Math.round(76 * fontScale);          // room for edge labels
  const ROW_GAP = LAYOUT.nodeGapY + 4;
  const PAD_X = LAYOUT.bandPadX;
  const PAD_Y = LAYOUT.bandPadTop;
  const TITLE_H = Math.round(30 * fontScale);
  const SPAD = 12;                                      // stage inner padding
  const MIN_STAGE_W = Math.round(140 * fontScale);

  // One uniform node width across the whole diagram (widest label wins) —
  // equal boxes per flow read much calmer than per-node sizing.
  const allWidths = [
    ...(dg.stages || []).flatMap((/** @type {any} */ s) =>
      (s.nodes || []).map((/** @type {string} */ id) => classById.get(id)).filter(Boolean)
        .map((/** @type {any} */ m) => nodeWidth(m, LAYOUT))),
    ...(dg.extra_nodes || []).map((/** @type {any} */ e) => nodeWidth({ name: e.name || '' }, LAYOUT)),
  ];
  const uniformW = Math.max(LAYOUT.minNodeW, ...allWidths);

  // column contents + widths — a stage is wide enough for its (uniform) member
  // boxes AND its full title in either language, so titles never truncate.
  const cols = (dg.stages || []).map((/** @type {any} */ s) => {
    const members = (s.nodes || []).map((/** @type {string} */ id) => classById.get(id)).filter(Boolean);
    const extras = (dg.extra_nodes || []).filter((/** @type {any} */ e) => e.stage === s.id);
    const titleW = Math.max(labelWidth(s.name_zh, LAYOUT), labelWidth(s.name_en, LAYOUT)) + 24;
    const w = Math.max(MIN_STAGE_W, uniformW + 2 * SPAD, titleW);
    return { s, members, extras, w };
  });
  const rows = (/** @type {any} */ c) => c.members.length + c.extras.length;
  const innerH = (/** @type {any} */ c) =>
    rows(c) * LAYOUT.nodeH + Math.max(0, rows(c) - 1) * ROW_GAP;
  const maxInner = Math.max(LAYOUT.nodeH, ...cols.map(innerH));
  const stageH = TITLE_H + maxInner + SPAD;             // 等高对齐

  // Per-gap widths: a gap grows to fit the widest (CJK-aware, both-language)
  // label crossing it, so edge labels never overlap stage/node boxes.
  const unstaged = (dg.extra_nodes || []).filter((/** @type {any} */ e) => e.stage == null);
  /** @type {Map<string, number>} */
  const idCol = new Map();
  cols.forEach((c, i) => {
    idCol.set(c.s.id, i);
    for (const m of c.members) idCol.set(m.id, i);
    for (const e of c.extras) idCol.set(e.id, i);
  });
  for (const e of unstaged) idCol.set(e.id, cols.length);
  const nGaps = cols.length - 1 + (unstaged.length ? 1 : 0);
  const gapW = new Array(Math.max(0, nGaps)).fill(COL_GAP);
  for (const l of dg.links || []) {
    const a = idCol.get(l.from), b = idCol.get(l.to);
    if (a == null || b == null || a === b) continue;
    const g = Math.floor((a + b - 1) / 2);   // the gap the label midpoint falls in
    if (g < 0 || g >= gapW.length) continue;
    const w = Math.max(labelWidth(l.label_zh, LAYOUT), labelWidth(l.label_en, LAYOUT)) + 20;
    if (w > gapW[g]) gapW[g] = w;
  }

  const stages = [];
  const nodes = [];
  const extraNodes = [];
  /** @type {Map<string, Rect>} */
  const rectById = new Map();
  let x = PAD_X;
  cols.forEach((c, i) => {
    stages.push({ id: c.s.id, x, y: PAD_Y, w: c.w, h: stageH, spec: c.s });
    rectById.set(c.s.id, { x, y: PAD_Y, w: c.w, h: stageH });
    let y = PAD_Y + TITLE_H + (maxInner - innerH(c)) / 2;
    for (const m of c.members) {
      const n = { datum: m, x: x + (c.w - uniformW) / 2, y, w: uniformW, h: LAYOUT.nodeH };
      nodes.push(n);
      rectById.set(m.id, n);
      y += LAYOUT.nodeH + ROW_GAP;
    }
    for (const e of c.extras) {
      const n = { datum: extraDatum(e), x: x + (c.w - uniformW) / 2, y, w: uniformW, h: LAYOUT.nodeH };
      extraNodes.push(n);
      rectById.set(e.id, n);
      y += LAYOUT.nodeH + ROW_GAP;
    }
    x += c.w + (gapW[i] ?? 0);
  });

  // unstaged extras: one trailing column, vertically centred against stages
  if (unstaged.length) {
    const colH = unstaged.length * LAYOUT.nodeH + (unstaged.length - 1) * ROW_GAP;
    let y = PAD_Y + Math.max(0, (stageH - colH) / 2);
    for (const e of unstaged) {
      const n = { datum: extraDatum(e), x, y, w: uniformW, h: LAYOUT.nodeH };
      extraNodes.push(n);
      rectById.set(e.id, n);
      y += LAYOUT.nodeH + ROW_GAP;
    }
    x += uniformW;
  }

  const width = x + PAD_X;
  const height = PAD_Y + stageH + LAYOUT.bandPadBottom;

  // links: resolve endpoints; dangling refs are skipped (defensive)
  const links = [];
  for (const l of dg.links || []) {
    const from = rectById.get(l.from), to = rectById.get(l.to);
    if (!from || !to) continue;
    const forward = to.x >= from.x + from.w;
    const label = {
      x: forward ? (from.x + from.w + to.x) / 2 : (to.x + to.w + from.x) / 2,
      y: (from.y + from.h / 2 + to.y + to.h / 2) / 2 - 6,
    };
    links.push({ link: l, from, to, label });
  }
  return { stages, nodes, extraNodes, links, width, height };
}
