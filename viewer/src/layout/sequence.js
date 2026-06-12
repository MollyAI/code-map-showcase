// --------------------------------------------------------------------
// layout/sequence — pure geometry for the Phase-2-authored sequence
// diagram (flow.diagram.type === 'sequence'). DOM-free. Participant
// boxes sit on one top row; dashed lifelines drop from each box; steps
// are horizontal arrows assigned increasing y in array order (the array
// order IS the temporal order, spec §3.2). Self steps loop on one
// lifeline (x1 === x2; the renderer draws the loop).
// Layout is language-independent: participant box width AND lifeline
// spacing are driven by the LONGER of the _zh/_en strings so toggling
// the language never reflows the diagram. Adjacent lifeline distance
// grows to fit the widest step label between them (CJK-aware), so
// labels never overlap boxes or neighbouring lifelines.
// --------------------------------------------------------------------

import { LAYOUT_BASE, labelWidth } from './metrics.js';

/**
 * @typedef {import('./metrics.js').Layout} Layout
 */

/** Self-loop geometry shared with the renderer (render/diagrams.js). */
export const SELF_LOOP = Object.freeze({ w: 34, h: 18 });

/** Adaptive (no truncation): fits the longer of the _zh/_en names plus padding.
 * @param {any} p @param {Layout} LAYOUT */
function participantWidth(p, LAYOUT) {
  const w = Math.max(labelWidth(p.name_zh, LAYOUT), labelWidth(p.name_en, LAYOUT)) + 28;
  return Math.max(LAYOUT.minNodeW, w);
}

/**
 * @param {any} flow  flow with a VALIDATED sequence diagram
 * @param {Layout} LAYOUT
 * @returns {{
 *   participants: Array<{ spec: any, x: number, y: number, w: number, h: number }>,
 *   lifelines: Array<{ x: number, y1: number, y2: number }>,
 *   steps: Array<{ step: any, index: number, y: number, x1: number, x2: number }>,
 *   width: number, height: number,
 * }}
 */
export function layoutSequence(flow, LAYOUT) {
  const dg = flow.diagram;
  const fontScale = LAYOUT.charW / LAYOUT_BASE.charW;
  const P_GAP = Math.round(48 * fontScale);
  const STEP_GAP = Math.round(40 * fontScale);
  const PAD_X = LAYOUT.bandPadX;
  const PAD_Y = Math.round(24 * fontScale);

  const parts = dg.participants || [];
  // One uniform participant width per diagram (widest name wins) — equal boxes
  // per flow read much calmer than per-participant sizing.
  const uniformW = parts.length
    ? Math.max(...parts.map((/** @type {any} */ p) => participantWidth(p, LAYOUT)))
    : LAYOUT.minNodeW;
  const pw = parts.map(() => uniformW);
  /** @type {Map<string, number>} */
  const colOf = new Map(parts.map((/** @type {any} */ p, /** @type {number} */ i) => [p.id, i]));

  // Required distance between adjacent lifelines: box halves + gap, grown to
  // fit the widest step label between them. The rendered label is
  // `${index}. ${label}` — allow ~4 latin units for the numeric prefix.
  const PREFIX = Math.round(4 * LAYOUT.charW);
  const need = [];
  for (let i = 0; i + 1 < parts.length; i++) need.push(pw[i] / 2 + P_GAP + pw[i + 1] / 2);
  let trailing = 0;   // room past the last lifeline (self labels on the last participant)
  for (const s of dg.steps || []) {
    const a = colOf.get(s.from), b = colOf.get(s.to);
    if (a == null || b == null) continue;
    const lw = Math.max(labelWidth(s.label_zh, LAYOUT), labelWidth(s.label_en, LAYOUT)) + PREFIX;
    if ((s.kind || 'call') === 'self') {
      const ext = SELF_LOOP.w + 8 + lw + 12;
      if (a < parts.length - 1) { if (ext > need[a]) need[a] = ext; }
      else if (ext > trailing) trailing = ext;
    } else if (Math.abs(a - b) === 1) {
      const g = Math.min(a, b);
      const w = lw + 24;
      if (w > need[g]) need[g] = w;
    }
  }

  const participants = [];
  /** @type {Map<string, number>} */
  const cxById = new Map();
  /** @type {number[]} */
  const cx = [];
  for (let i = 0; i < parts.length; i++) {
    cx.push(i === 0 ? PAD_X + pw[0] / 2 : cx[i - 1] + need[i - 1]);
    participants.push({ spec: parts[i], x: cx[i] - pw[i] / 2, y: PAD_Y, w: pw[i], h: LAYOUT.nodeH });
    cxById.set(parts[i].id, cx[i]);
  }
  const lastRight = parts.length ? cx[parts.length - 1] + pw[parts.length - 1] / 2 : PAD_X;
  const lastExt = parts.length ? cx[parts.length - 1] + trailing : PAD_X;
  const width = Math.max(lastRight, lastExt) + PAD_X;
  const top = PAD_Y + LAYOUT.nodeH;

  const steps = [];
  let y = top + STEP_GAP;
  (dg.steps || []).forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    const x1 = cxById.get(s.from), x2 = cxById.get(s.to);
    if (x1 == null || x2 == null) return;               // defensive skip
    steps.push({ step: s, index: i + 1, y, x1, x2 });
    y += STEP_GAP;
  });

  const height = y - STEP_GAP + PAD_Y * 2;
  const lifelines = participants.map((p) => ({ x: p.x + p.w / 2, y1: top, y2: height - PAD_Y }));
  return { participants, lifelines, steps, width, height };
}
