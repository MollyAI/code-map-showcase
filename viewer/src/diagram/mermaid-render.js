// --------------------------------------------------------------------
// diagram/mermaid-render — lazy-load Mermaid from a pinned CDN, render a
// flow.diagram to a Mermaid SVG string, and surface its bindFunctions so
// the caller can wire `click … call cmFlowClick(...)` after the SVG is in
// the live DOM. On CDN failure it returns a fallback marker carrying the
// compiled Mermaid source (the viewer shows copyable text — spec D5).
//
// The viewer's offline guarantee is intentionally relaxed here: only flow
// rendering needs the network (spec D1). Everything else still works
// offline. Pin is an exact version on jsdelivr (better CN reachability).
//
// Click wiring: flowchart nodes carry `click … call cmFlowClick("<declId>")`
// directives (compiler) → Mermaid's bindFunctions attaches them when called
// on the inserted element → window.cmFlowClick routes to onSelect(declId).
// Sequence-participant clicks are NOT wired (Mermaid has no sequence click
// directive) — best-effort, documented non-goal (spec A5).
// --------------------------------------------------------------------
import { compileDiagram } from './mermaid-compile.js';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.esm.min.mjs';

let _mermaidPromise = null;
/** Memoized dynamic import. Rejects (and resets) on CDN failure so a later
 *  attempt can retry. */
function loadMermaid() {
  if (!_mermaidPromise) {
    _mermaidPromise = import(MERMAID_URL)
      .then((m) => m.default || m)
      .catch((err) => { _mermaidPromise = null; throw err; });
  }
  return _mermaidPromise;
}

let _seq = 0;

/** Parse Mermaid's SVG sizing (viewBox preferred, else width/height attrs). */
function sizeFromSvg(svgStr) {
  try {
    const el = new DOMParser().parseFromString(svgStr, 'image/svg+xml').documentElement;
    const vb = (el.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length === 4 && vb[2] > 0) return { w: vb[2], h: vb[3] };
    return { w: parseFloat(el.getAttribute('width')) || 800, h: parseFloat(el.getAttribute('height')) || 400 };
  } catch {
    return { w: 800, h: 400 };
  }
}

/**
 * Render a flow.diagram via Mermaid.
 * @param {object} args
 * @param {any} args.diagram @param {Map<string,any>} args.classById
 * @param {string} args.lang @param {string} args.theme  'light' | 'dark'
 * @param {(declId:string)=>void} args.onSelect
 * @returns {Promise<{ ok:true, svg:string, bind:((el:Element)=>void)|null, width:number, height:number }
 *                   | { ok:false, def:string }>}
 */
export async function renderFlow({ diagram, classById, lang, theme, onSelect }) {
  const { def } = compileDiagram(diagram, classById, lang);
  // Global bridge for Mermaid's `click … call cmFlowClick(...)` directives.
  /** @type {any} */ (window).cmFlowClick = (declId) => { if (onSelect) onSelect(declId); };
  try {
    const mermaid = await loadMermaid();
    // Re-apply config every render so a theme/language toggle takes effect
    // (initialize merges; cheap). htmlLabels:false keeps labels as <text> so
    // the SVG rasterizes for PNG export (no foreignObject).
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      theme: theme === 'light' ? 'default' : 'dark',
    });
    const { svg, bindFunctions } = await mermaid.render('cm-flow-' + (_seq++), def);
    const { w, h } = sizeFromSvg(svg);
    return { ok: true, svg, bind: bindFunctions || null, width: w, height: h };
  } catch (err) {
    console.warn('[code-map] Mermaid load/render failed, showing source fallback:', err);
    return { ok: false, def };
  }
}
