// --------------------------------------------------------------------
// data/invariants — model-level regression assertions (INV-1 / INV-U1).
// Pure, DOM-free: operates on the loaded code-map model + layout geometry.
// INV-1 needs only the model. INV-U1 (sub-task 2) reuses ../layout/metrics.js
// so the "box fits the full label" guarantee is checked against the SAME math
// the renderer uses — single source of truth for the CLI gate and unit tests.
// --------------------------------------------------------------------

import { nodeWidth as realNodeWidth, labelWidth as realLabelWidth } from '../layout/metrics.js';

/** Rendered label for a class datum — exactly what render/node.js draws. */
export function renderedLabel(c) {
  return c.display_name || c.name;
}

/** Classes that actually render in layer mode: core only (v1.14 core-only). */
function renderedClasses(layer) {
  return (layer.classes || []).filter((c) => c.core);
}

/**
 * INV-1 — within each layer (category), every rendered node's label is unique.
 * @param {{ layers?: Array<{id?:string,name?:string,classes?:Array}> }} model
 * @returns {Array<object>} violations
 */
export function assertInv1(model) {
  const out = [];
  for (const layer of model.layers || []) {
    const seen = new Map(); // label -> classes[]
    for (const c of renderedClasses(layer)) {
      const label = renderedLabel(c);
      if (!seen.has(label)) seen.set(label, []);
      seen.get(label).push(c);
    }
    for (const [label, nodes] of seen) {
      if (nodes.length > 1) {
        out.push({
          inv: 'INV-1',
          category: layer.name || layer.id,
          label,
          sources: nodes.map((c) => ({ path: c.path, signature: c.signature || '' })),
        });
      }
    }
  }
  return out;
}

/**
 * INV-U1 — every rendered node's box is wide enough for its full label.
 * Compares the box width the layout WILL use (`nodeWidth`) against an
 * INDEPENDENT lower bound (`labelWidth(fullLabel) + 2·nodePadX`); a width cap
 * reintroduced inside `nodeWidth` shrinks the box below that bound and fires.
 * `deps` is injectable so the regression can be exercised in tests; production
 * passes the real metrics functions.
 * @param {{ layers?: Array }} model
 * @param {import('../layout/metrics.js').Layout} LAYOUT
 * @param {{ nodeWidth?: Function, labelWidth?: Function, eps?: number }} [deps]
 * @returns {Array<object>} violations
 */
export function assertInvU1(model, LAYOUT, deps = {}) {
  const nodeWidth = deps.nodeWidth || realNodeWidth;
  const labelWidth = deps.labelWidth || realLabelWidth;
  const EPS = deps.eps ?? 1;
  const out = [];
  for (const layer of model.layers || []) {
    for (const c of renderedClasses(layer)) {
      const label = renderedLabel(c);
      const boxW = nodeWidth(c, LAYOUT);
      const needW = labelWidth(label, LAYOUT) + LAYOUT.nodePadX * 2;
      if (boxW + EPS < needW) {
        out.push({
          inv: 'INV-U1',
          node: label,
          reason: `box narrower than label (nodeWidth ${Math.round(boxW)}px < label ${Math.round(needW)}px)`,
        });
      }
    }
  }
  return out;
}

/**
 * Bilingual completeness of a `<base>` field: a value present in ANY form
 * (pair half or legacy bare key) must come as a complete _zh + _en pair.
 * @param {any} obj @param {string} base
 * @returns {'ok'|'incomplete'|'absent'}
 */
function bilingualState(obj, base) {
  const zh = String((obj && obj[base + '_zh']) || '').trim();
  const en = String((obj && obj[base + '_en']) || '').trim();
  const legacy = String((obj && obj[base]) || '').trim();
  if (zh && en) return 'ok';
  if (!zh && !en && !legacy) return 'absent';
  return 'incomplete';
}

/**
 * INV-B1 — every rendered descriptive string carries a complete bilingual pair,
 * so the EN/中 toggle can't degrade to one language.
 *   - layer.summary / group.summary: present ⇒ must be a pair (absent is OK — optional).
 *   - flow WITH a diagram (the only flows that render, v1.19): name MUST be a pair
 *     (name always shows); description: present ⇒ pair. Diagram-less candidate flows
 *     are exempt, so a Phase-1 raw_structure.json never trips this gate.
 * @param {{ layers?: Array, flows?: Array, layer_groups?: Array }} model
 * @returns {Array<object>} violations
 */
export function assertInvB1(model) {
  const out = [];
  const push = (subject, field, st) => out.push({
    inv: 'INV-B1', subject, field,
    reason: st === 'absent'
      ? 'missing bilingual pair (name required)'
      : 'only one language present (need both _zh and _en)',
  });
  for (const L of model.layers || []) {
    if (bilingualState(L, 'summary') === 'incomplete') push(`layer "${L.name || L.id}"`, 'summary', 'incomplete');
  }
  for (const g of model.layer_groups || []) {
    if (bilingualState(g, 'summary') === 'incomplete') push(`group "${g.name || g.id}"`, 'summary', 'incomplete');
  }
  for (const f of model.flows || []) {
    if (!f.diagram) continue;                       // undiagrammed candidate flow → not rendered → exempt
    const nameSt = bilingualState(f, 'name');
    if (nameSt !== 'ok') push(`flow "${f.id}"`, 'name', nameSt);
    if (bilingualState(f, 'description') === 'incomplete') push(`flow "${f.id}"`, 'description', 'incomplete');
  }
  return out;
}

/** Run all assertions over the model; returns the merged violation list. */
export function collectViolations(model, LAYOUT, deps = {}) {
  return [...assertInv1(model), ...assertInvU1(model, LAYOUT, deps), ...assertInvB1(model)];
}

/** Render violations in the actionable diagnostic format. */
export function formatDiagnostics(violations) {
  return violations.map((v) => {
    if (v.inv === 'INV-1') {
      const srcs = v.sources.map((s) => `    - ${s.path}  ${s.signature}`).join('\n');
      return `INV-1 FAIL — category "${v.category}"\n`
        + `  duplicate rendered label: "${v.label}" ×${v.sources.length}\n`
        + `  sources:\n${srcs}\n`
        + `  fix: R3b 按签名消歧, 或合并(若真重复)`;
    }
    if (v.inv === 'INV-B1') {
      return `INV-B1 FAIL — ${v.subject}\n`
        + `  field "${v.field}": ${v.reason}\n`
        + `  fix: 写齐 ${v.field}_zh 和 ${v.field}_en(删掉拼接串/单语)`;
    }
    // else: currently only INV-U1 reaches here
    return `INV-U1 FAIL — node "${v.node}"\n`
      + `  reason: ${v.reason}\n`
      + `  fix: 检查 nodeWidth 是否重新引入了截断帽`;
  }).join('\n\n');
}
