// --------------------------------------------------------------------
// diagram/mermaid-compile — pure compiler: structured flow.diagram JSON
// → Mermaid source text. DOM-free, network-free, deterministic.
//
// Decl ids (qualifiedNames with . < > ( ) spaces) are NEVER used as
// Mermaid node ids — Mermaid would sanitize/break them. We mint short
// aliases (n0,n1,… / a0,a1,…) and return idMap alias→declId for click
// wiring. Pipeline link endpoints may be stage ids (validateDiagram
// allows stage↔stage links). Mermaid/dagre lays out subgraph→subgraph
// edges poorly (the target subgraph floats out of the LR rank flow —
// the layout-mess bug), so a stage-endpoint link is redirected onto a
// representative node INSIDE that stage (its first node); the edge then
// pins the subgraph into the row. The old in-house renderer drew stage
// edges directly; Mermaid can't.
//
// Labels are bilingual via pickBilingual and escaped for Mermaid's
// ["..."] / : message syntax. The full raw signature is never emitted —
// the label is the decl's display_name||name (the detail panel carries
// the signature), matching the in-house renderer it replaces.
// --------------------------------------------------------------------
import { pickBilingual } from '../i18n.js';

/** Escape text for a Mermaid quoted label ["..."] / message tail. Mermaid
 *  accepts HTML entities; #quot; is the documented quote escape. Newlines
 *  collapse to spaces (Mermaid treats a bare newline as a statement break). */
function esc(s) {
  return String(s == null ? '' : s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');
}

/** Sequence message tail must not contain a raw newline or semicolon. */
function escMsg(s) {
  return esc(s).replace(/;/g, '،');
}

const LINK_OP = { data: '-->', control: '-.->', dispatch: '==>' };

/** @param {any} diagram @param {Map<string,any>} classById @param {string} lang
 *  @returns {{ def: string, idMap: Map<string,string> }} */
export function compileDiagram(diagram, classById, lang) {
  if (diagram && diagram.type === 'sequence') return compileSequence(diagram, classById, lang);
  return compilePipeline(diagram, classById, lang);
}

function compilePipeline(dg, classById, lang) {
  const idMap = new Map();
  const alias = new Map();          // endpointId → mermaid alias
  let n = 0;
  const aliasFor = (id) => {
    if (!alias.has(id)) alias.set(id, 'n' + n++);
    return alias.get(id);
  };
  const lines = ['flowchart LR'];
  const clicks = [];

  for (const s of dg.stages || []) {
    lines.push(`  subgraph ${aliasFor(s.id)}["${esc(pickBilingual(s, 'name', lang))}"]`);
    for (const id of s.nodes || []) {
      const decl = classById.get(id);
      const label = decl ? esc(decl.display_name || decl.name) : esc(id);
      const a = aliasFor(id);
      lines.push(`    ${a}["${label}"]`);
      idMap.set(a, id);
      clicks.push(`  click ${a} call cmFlowClick("${esc(id)}")`);
    }
    lines.push('  end');
  }
  for (const x of dg.extra_nodes || []) {
    const a = aliasFor(x.id);
    // actor → stadium (["..."]) ; artifact → parallelogram [/"..."/]
    const shape = x.kind === 'actor' ? `(["${esc(x.name)}"])` : `[/"${esc(x.name)}"/]`;
    lines.push(`  ${a}${shape}`);
  }
  // stage id → its first node id; a stage-endpoint link attaches to that
  // node so dagre keeps the subgraph in the rank flow (no floating subgraph).
  const stageRep = new Map();
  for (const s of dg.stages || []) {
    const rep = (s.nodes || [])[0];
    if (rep != null) stageRep.set(s.id, rep);
  }
  const endpoint = (id) => aliasFor(stageRep.get(id) ?? id);
  for (const l of dg.links || []) {
    const op = LINK_OP[l.kind] || LINK_OP.data;
    const lbl = esc(pickBilingual(l, 'label', lang));
    lines.push(`  ${endpoint(l.from)} ${op}|"${lbl}"| ${endpoint(l.to)}`);
  }
  return { def: [...lines, ...clicks].join('\n'), idMap };
}

function compileSequence(dg, classById, lang) {
  const idMap = new Map();
  const alias = new Map();
  let n = 0;
  const aliasFor = (pid) => {
    if (!alias.has(pid)) alias.set(pid, 'a' + n++);
    return alias.get(pid);
  };
  const lines = ['sequenceDiagram'];
  for (const p of dg.participants || []) {
    const a = aliasFor(p.id);
    const kw = (p.kind || 'code') === 'actor' ? 'actor' : 'participant';
    lines.push(`  ${kw} ${a} as ${esc(pickBilingual(p, 'name', lang))}`);
    const first = (p.nodes || [])[0];
    if (first) idMap.set(a, first);   // best-effort: participant → its first decl
  }
  let i = 0;
  for (const s of dg.steps || []) {
    i++;
    const arrow = (s.kind === 'return') ? '-->>' : '->>';   // self uses ->> with from===to
    lines.push(`  ${aliasFor(s.from)}${arrow}${aliasFor(s.to)}: ${i}. ${escMsg(pickBilingual(s, 'label', lang))}`);
  }
  return { def: lines.join('\n'), idMap };
}
