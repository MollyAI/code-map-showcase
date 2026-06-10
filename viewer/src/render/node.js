// --------------------------------------------------------------------
// render/node — builds the shared SVG node element, extracted from
// viewer/index.html's `makeNodeEl`. This is the one DOM/SVG builder that
// both renderers (layer bands + flow) call per positioned node.
//
// The original read/wrote globals: `state.grouping` (to add flow-hub/
// flow-core classes), `state.nodeById` (to register the built element), the
// module `LAYOUT`, and called `selectNode` / `showTooltip` / `hideTooltip` /
// `positionTooltip` inline. Here all of that is passed in via `ctx`, so this
// module is side-effect-free w.r.t. globals:
//   - the flow class branch        -> ctx.decorateNode(datum)
//   - state.nodeById.set(...)      -> ctx.registerNode(id, el)
//   - the inline handlers          -> ctx.handlers.*
//   - LAYOUT                       -> ctx.LAYOUT
// SVG structure (the double-rect `rect` + `.lang-stripe` + `.nlabel text`),
// coordinates, sizes, label truncation, and listener wiring are otherwise
// byte-for-byte identical to the original.
// --------------------------------------------------------------------

import { truncate } from '../util.js';

/**
 * @typedef {import('../layout/metrics.js').Layout} Layout
 */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Language -> CSS color variable. Verbatim from the original `langColor`;
 * the lang-stripe rect's fill is set from this. Unknown languages fall back
 * to `--lang-default`.
 * @param {string} lang
 * @returns {string}
 */
export function langColor(lang) {
  /** @type {Record<string, string>} */
  const map = {
    kotlin: 'var(--lang-kotlin)',
    java: 'var(--lang-java)',
    python: 'var(--lang-python)',
    go: 'var(--lang-go)',
    rust: 'var(--lang-rust)',
    typescript: 'var(--lang-typescript)',
    javascript: 'var(--lang-javascript)',
  };
  return map[lang] || 'var(--lang-default)';
}

/**
 * A positioned node: the layout output `makeNodeEl` consumes.
 * `datum` is the full declaration object (id/name/language/core/hub/...).
 * @typedef {object} PositionedNode
 * @property {{ id: string, name: string, display_name?: string, language?: string, core?: boolean, hub?: boolean }} datum
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * Event/decoration hooks supplied by the renderer. These replace the
 * original's inline global calls; see the module header for the mapping.
 * @typedef {object} NodeHandlers
 * @property {(id: string) => void} onSelect     click (was `selectNode`)
 * @property {(id: string, evt: MouseEvent) => void} onHover  mouseenter (was `showTooltip`)
 * @property {() => void} onHoverEnd             mouseleave (was `hideTooltip`)
 * @property {(evt: MouseEvent) => void} [onHoverMove]  mousemove (was `positionTooltip`)
 */

/**
 * Render context: handlers plus the bits formerly read from globals.
 * @typedef {object} NodeContext
 * @property {NodeHandlers} handlers
 * @property {(datum: PositionedNode['datum']) => string[]} decorateNode
 *   extra classes to add to the node group (replaces the `state.grouping
 *   === 'flow'` flow-hub/flow-core branch).
 * @property {(id: string, el: SVGGElement) => void} registerNode
 *   record the built element (replaces `state.nodeById.set`).
 * @property {Layout} LAYOUT
 */

/**
 * Build one `<g class="node">` for the positioned node `n`, wire its
 * listeners, register it via `ctx.registerNode`, and return the group.
 * Shared by the layer-band renderer and the flow renderer.
 * @param {PositionedNode} n
 * @param {NodeContext} ctx
 * @returns {SVGGElement}
 */
export function makeNodeEl(n, ctx) {
  const { handlers, decorateNode, registerNode, LAYOUT } = ctx;

  const gNode = /** @type {SVGGElement} */ (document.createElementNS(NS, 'g'));
  let cls = 'node';
  for (const extra of decorateNode(n.datum)) cls += ' ' + extra;
  gNode.setAttribute('class', cls);
  gNode.setAttribute('data-id', n.datum.id);
  gNode.setAttribute('transform', `translate(${n.x}, ${n.y})`);

  const nrect = document.createElementNS(NS, 'rect');
  nrect.setAttribute('width', String(n.w));
  nrect.setAttribute('height', String(n.h));
  nrect.setAttribute('rx', '3');
  gNode.appendChild(nrect);

  if (n.datum.language) {
    const stripe = document.createElementNS(NS, 'rect');
    stripe.setAttribute('class', 'lang-stripe');
    stripe.setAttribute('width', '3');
    stripe.setAttribute('height', String(n.h));
    stripe.setAttribute('rx', '1.5');
    stripe.setAttribute('style', 'fill: ' + langColor(n.datum.language));
    gNode.appendChild(stripe);
  }

  const txt = document.createElementNS(NS, 'text');
  txt.setAttribute('class', 'nlabel');
  txt.setAttribute('x', String(LAYOUT.nodePadX));
  txt.setAttribute('y', String(n.h / 2 + 1));
  txt.textContent = truncate(n.datum.display_name || n.datum.name, Math.max(5, Math.floor((n.w - LAYOUT.nodePadX * 2) / LAYOUT.charW)));
  gNode.appendChild(txt);

  gNode.addEventListener('click', (ev) => { ev.stopPropagation(); handlers.onSelect(n.datum.id); });
  gNode.addEventListener('mouseenter', (ev) => handlers.onHover(n.datum.id, ev));
  gNode.addEventListener('mouseleave', () => handlers.onHoverEnd());
  if (handlers.onHoverMove) {
    const onMove = handlers.onHoverMove;
    gNode.addEventListener('mousemove', (ev) => onMove(ev));
  }

  registerNode(n.datum.id, gNode);
  return gNode;
}
