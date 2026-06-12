// --------------------------------------------------------------------
// data/diagram — pure validation + helpers for the Phase-2-authored
// flow.diagram annotation layer (spec: docs/superpowers/specs/
// 2026-06-11-flow-diagram-redesign-design.md §3). DOM-free.
// Invalid or absent diagram → callers fall back to the DAG renderer
// (miss rather than misidentify): validateDiagram never throws, it
// collects errors; diagramOf returns null unless fully valid.
// --------------------------------------------------------------------

const LINK_KINDS = new Set(['data', 'control', 'dispatch']);
const STEP_KINDS = new Set(['call', 'return', 'self']);
const EXTRA_KINDS = new Set(['artifact', 'actor']);
const PART_KINDS = new Set(['code', 'actor', 'artifact']);

/** 双语字段取值：优先当前语言，缺失退另一种，再退无后缀字段。
 * @param {any} obj @param {string} base @param {string} lang */
export function pickL(obj, base, lang) {
  const zh = obj[base + '_zh'], en = obj[base + '_en'];
  if (zh || en) return lang === 'zh' ? (zh || en) : (en || zh);
  return obj[base] || '';
}

/** @param {any} o @param {string} base */
const hasPair = (o, base) =>
  !!(o && String(o[base + '_zh'] || '').trim() && String(o[base + '_en'] || '').trim());

/**
 * Structural validation of `flow.diagram` against the flow + the class index.
 * @param {any} flow
 * @param {Map<string, any>} classById
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDiagram(flow, classById) {
  /** @type {string[]} */
  const errors = [];
  const dg = flow ? flow.diagram : null;
  if (!dg || typeof dg !== 'object') return { ok: false, errors: ['no diagram'] };
  if (dg.type === 'pipeline') validatePipeline(flow, dg, classById, errors);
  else if (dg.type === 'sequence') validateSequence(dg, classById, errors);
  else errors.push('unknown diagram type: ' + dg.type);
  return { ok: errors.length === 0, errors };
}

/** @param {any} flow @param {any} dg @param {Map<string, any>} classById @param {string[]} errors */
function validatePipeline(flow, dg, classById, errors) {
  const stages = Array.isArray(dg.stages) ? dg.stages : [];
  if (!stages.length) errors.push('pipeline: empty stages');
  const flowNodes = new Set(flow.nodes || []);
  const stageIds = new Set();
  const placed = new Set();
  for (const s of stages) {
    if (!s.id || stageIds.has(s.id)) errors.push('stage id missing/duplicate: ' + (s && s.id));
    stageIds.add(s.id);
    if (!hasPair(s, 'name')) errors.push('stage ' + s.id + ': name_zh/name_en required');
    const nodes = Array.isArray(s.nodes) ? s.nodes : [];
    if (!nodes.length) errors.push('stage ' + s.id + ': empty nodes');
    for (const id of nodes) {
      if (!flowNodes.has(id)) errors.push('stage ' + s.id + ': node ' + id + ' not in flow.nodes');
      if (!classById.has(id)) errors.push('stage ' + s.id + ': node ' + id + ' unknown decl');
      if (placed.has(id)) errors.push('node ' + id + ' placed in two stages');
      placed.add(id);
    }
  }
  const extraIds = new Set();
  for (const x of (Array.isArray(dg.extra_nodes) ? dg.extra_nodes : [])) {
    const xid = x && x.id ? String(x.id) : '';
    if (!xid.startsWith('x:') || extraIds.has(xid) || classById.has(xid)) {
      errors.push('extra node id invalid/duplicate: ' + xid);
    }
    extraIds.add(xid);
    if (!EXTRA_KINDS.has(x.kind)) errors.push('extra node ' + xid + ': bad kind ' + x.kind);
    if (!String(x.name || '').trim()) errors.push('extra node ' + xid + ': name required');
    if (x.stage != null && !stageIds.has(x.stage)) errors.push('extra node ' + xid + ': unknown stage ' + x.stage);
  }
  const endpoint = (/** @type {string} */ id) => stageIds.has(id) || placed.has(id) || extraIds.has(id);
  const links = Array.isArray(dg.links) ? dg.links : [];
  if (!links.length) errors.push('pipeline: empty links');
  for (const l of links) {
    if (!endpoint(l.from)) errors.push('link from ' + l.from + ': unknown endpoint');
    if (!endpoint(l.to)) errors.push('link to ' + l.to + ': unknown endpoint');
    if (!hasPair(l, 'label')) errors.push('link ' + l.from + '->' + l.to + ': label_zh/label_en required');
    if (l.kind != null && !LINK_KINDS.has(l.kind)) errors.push('link ' + l.from + '->' + l.to + ': bad kind ' + l.kind);
  }
}

/** @param {any} dg @param {Map<string, any>} classById @param {string[]} errors */
function validateSequence(dg, classById, errors) {
  const parts = Array.isArray(dg.participants) ? dg.participants : [];
  if (parts.length < 2) errors.push('sequence: need >=2 participants');
  const pids = new Set();
  for (const p of parts) {
    const pid = p && p.id ? String(p.id) : '';
    if (!pid.startsWith('p:') || pids.has(pid)) errors.push('participant id invalid/duplicate: ' + pid);
    pids.add(pid);
    if (!hasPair(p, 'name')) errors.push('participant ' + pid + ': name_zh/name_en required');
    const kind = p.kind || 'code';
    if (!PART_KINDS.has(kind)) errors.push('participant ' + pid + ': bad kind ' + p.kind);
    if (kind === 'code') {
      const nodes = Array.isArray(p.nodes) ? p.nodes : [];
      if (!nodes.length) errors.push('participant ' + pid + ': code participant needs nodes');
      for (const id of nodes) if (!classById.has(id)) errors.push('participant ' + pid + ': unknown decl ' + id);
    }
  }
  const steps = Array.isArray(dg.steps) ? dg.steps : [];
  if (!steps.length) errors.push('sequence: empty steps');
  for (const s of steps) {
    if (!pids.has(s.from)) errors.push('step from ' + s.from + ': unknown participant');
    if (!pids.has(s.to)) errors.push('step to ' + s.to + ': unknown participant');
    if (!hasPair(s, 'label')) errors.push('step ' + s.from + '->' + s.to + ': label_zh/label_en required');
    const kind = s.kind || 'call';
    if (!STEP_KINDS.has(kind)) errors.push('step: bad kind ' + s.kind);
    if (kind === 'self' && s.from !== s.to) errors.push('self step needs from === to');
  }
}

/** The validated diagram, or null (→ DAG fallback).
 * @param {any} flow @param {Map<string, any>} classById */
export function diagramOf(flow, classById) {
  if (!flow || !flow.diagram) return null;
  return validateDiagram(flow, classById).ok ? flow.diagram : null;
}

/** 时序图选中集：参与者自身 + 触及它的 step 的两端（interact/selection 用）。
 * @param {any} dg @param {string} id @returns {Set<string>} */
export function sequenceHighlight(dg, id) {
  const set = new Set([id]);
  for (const s of dg.steps || []) {
    if (s.from === id || s.to === id) { set.add(s.from); set.add(s.to); }
  }
  return set;
}

/** 流水线选中集补充：把含已点亮 decl 的 stage id 也加入（这样 stage↔stage
 *  links 的 data-from/to 能命中选中集，不至于整图连线全部压暗）。
 * @param {any} dg @param {Set<string>} set @returns {Set<string>} */
export function withLitStages(dg, set) {
  for (const s of dg.stages || []) {
    if ((s.nodes || []).some((/** @type {string} */ n) => set.has(n))) set.add(s.id);
  }
  return set;
}
