// --------------------------------------------------------------------
// ui/detail — the right-hand detail panel. Renders a declaration's kicker,
// title (full signature for methods), tag chips, the @path:line deep-link
// copy row, a bilingual description, a method-vs-class meta grid, and
// depends-on / depended-on-by edge lists. Was renderDetail / edgeRow /
// pickDescription / simpleNameOf / packageOf / scrollNodeIntoView in
// index.html.
//
// Cross-cutting actions (selecting an edge-row target) are passed in via
// deps to avoid importing interact/* (no cycles). i18n is now explicit per
// call: t(key, state.lang).
// --------------------------------------------------------------------

import { state } from '../store.js';
import { t } from '../i18n.js';
import { escapeHtml, escapeAttr, copyToClipboard } from '../util.js';

/** Bilingual descriptions live on description_zh / description_en (core only).
 *  Prefer the active language, fall back to the other, then the legacy field.
 * @param {any} c
 */
function pickDescription(c) {
  const order = state.lang === 'zh'
    ? [c.description_zh, c.description_en]
    : [c.description_en, c.description_zh];
  for (const d of order) if (d) return d;
  return c.description || null;
}

/** @param {string} fqn */
function simpleNameOf(fqn) { const i = fqn.lastIndexOf('.'); return i < 0 ? fqn : fqn.slice(i + 1); }
/** @param {string} fqn */
function packageOf(fqn) { const i = fqn.lastIndexOf('.'); return i < 0 ? '' : fqn.slice(0, i); }

/**
 * @param {object} deps
 * @param {HTMLElement} deps.detailBody
 * @param {HTMLElement} deps.canvasWrap
 * @param {(id: string) => void} deps.onSelectTarget  select + scroll a clicked edge-row target
 */
export function createDetail({ detailBody, canvasWrap, onSelectTarget }) {
  /** @param {string} k */
  const tr = (k) => t(k, state.lang);

  /** @param {string} targetId @param {string} dir @param {string} [kind] */
  function edgeRow(targetId, dir, kind) {
    const node = state.nodeById.get(targetId);
    const name = node ? node.datum.name : simpleNameOf(targetId);
    const pkg = node ? node.datum.package : packageOf(targetId);
    const cls = 'edge-row ' + (dir === 'out' ? 'is-out' : 'is-in');
    return `<div class="${cls}" data-target="${escapeAttr(targetId)}" title="${escapeAttr(targetId)}">
      <div class="edge-row-main">
        <span class="arrow"></span>
        <span class="edge-name">${escapeHtml(name)}</span>
        <span class="kind">${escapeHtml(kind || tr('uses'))}</span>
      </div>
      ${pkg ? `<div class="edge-pkg">${escapeHtml(pkg)}</div>` : ''}
    </div>`;
  }

  /** @param {string} id */
  function scrollNodeIntoView(id) {
    const entry = state.nodeById.get(id);
    if (!entry) return;
    const rect = entry.el.getBoundingClientRect();
    const wrap = canvasWrap.getBoundingClientRect();
    const dy = rect.top - wrap.top - wrap.height / 2 + rect.height / 2;
    canvasWrap.scrollBy({ top: dy, behavior: 'smooth' });
  }

  /** @param {any} c */
  function renderDetail(c) {
    if (!c) {
      detailBody.innerHTML = `<div class="empty">
        <div>${escapeHtml(tr('nothing_selected'))}</div>
        <div class="hint">${escapeHtml(tr('click_node'))}</div>
      </div>`;
      return;
    }

    const outs = (state.edgesFromIdx.get(c.id) || []);
    const ins = (state.edgesToIdx.get(c.id) || []);
    const layer = state.raw.layers.find((/** @type {any} */ L) => L.classes.some((/** @type {any} */ cl) => cl.id === c.id));
    const tags = Array.isArray(c.tags) ? c.tags : [];

    const isMethod = ['function', 'method', 'composable_function'].includes(c.kind);
    const desc = pickDescription(c);
    const titleText = (isMethod && c.signature) ? c.signature : c.name;
    const fileName = (c.path || '').split('/').pop();
    const lineSuffix = c.line ? `:${c.line}` : '';

    detailBody.innerHTML = `
      <div>
        <div class="kicker">${escapeHtml(layer?.name || '')} <span style="opacity:0.5">·</span> ${escapeHtml(c.kind || 'class')}${c.language ? ` <span style="opacity:0.5">·</span> <span class="lang-tag">${escapeHtml(c.language)}</span>` : ''}</div>
        <h2 class="class-title${(isMethod && c.signature) ? ' is-signature' : ''}">${escapeHtml(titleText)}</h2>
        ${tags.length ? `<div class="tag-row">${tags.map((/** @type {string} */ tag) => {
          const muted = tag === 'ai-inferred' || tag === 'excluded';
          return `<span class="tag-chip${muted ? ' muted' : ''}">${escapeHtml(tag)}</span>`;
        }).join('')}</div>` : ''}
      </div>

      <div class="path-row">
        <div class="path-at">@</div>
        <div class="path-text" title="${escapeHtml(c.path + lineSuffix)}">${escapeHtml(c.path + lineSuffix)}</div>
        <button class="copy" data-copy="${escapeAttr('@' + c.path + lineSuffix)}">${escapeHtml(tr('copy'))}</button>
      </div>

      ${desc
        ? `<p class="description">${escapeHtml(desc)}</p>`
        : `<p class="description muted">${escapeHtml(tr('no_desc_core'))}</p>`}

      <div class="meta-grid">
        ${isMethod ? `
        <div class="cell"><span class="label">${escapeHtml(tr('label_file'))}</span><span class="value" title="${escapeAttr(c.path || '')}">${escapeHtml(fileName)}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_loc'))}</span><span class="value">${c.loc ?? 0}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_calls'))}</span><span class="value">${c.in_degree ?? 0}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_core'))}</span><span class="value">${c.core ? tr('yes') : tr('no')}</span></div>
        ` : `
        <div class="cell"><span class="label">${escapeHtml(tr('label_methods'))}</span><span class="value">${c.method_count ?? 0}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_loc'))}</span><span class="value">${c.loc ?? 0}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_refs'))}</span><span class="value">${c.in_degree ?? 0}</span></div>
        <div class="cell"><span class="label">${escapeHtml(tr('label_core'))}</span><span class="value">${c.core ? tr('yes') : tr('no')}</span></div>
        `}
      </div>

      ${outs.length ? `
        <div>
          <div class="section-h">${escapeHtml(tr('depends_on'))} (${outs.length})</div>
          <div class="edge-list">
            ${outs.map((/** @type {any} */ e) => edgeRow(e.to, 'out', e.kind)).join('')}
          </div>
        </div>` : ''}

      ${ins.length ? `
        <div>
          <div class="section-h">${escapeHtml(tr('depended_on_by'))} (${ins.length})</div>
          <div class="edge-list">
            ${ins.map((/** @type {any} */ e) => edgeRow(e.from, 'in', e.kind)).join('')}
          </div>
        </div>` : ''}

      ${(!outs.length && !ins.length) ? `
        <div class="subhint">${escapeHtml(tr('no_edges'))}</div>
      ` : ''}
    `;

    const copyBtn = detailBody.querySelector('.copy');
    if (copyBtn) copyBtn.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.currentTarget);
      const text = btn.getAttribute('data-copy') || '';
      copyToClipboard(text).then(() => {
        btn.textContent = tr('copied');
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = tr('copy'); btn.classList.remove('ok'); }, 1400);
      }).catch(() => {
        btn.textContent = tr('failed');
        setTimeout(() => { btn.textContent = tr('copy'); }, 1400);
      });
    });

    detailBody.querySelectorAll('.edge-row[data-target]').forEach((row) => {
      row.addEventListener('click', () => {
        const target = row.getAttribute('data-target');
        if (target && state.nodeById.has(target)) {
          onSelectTarget(target);
          scrollNodeIntoView(target);
        }
      });
    });
  }

  return { renderDetail };
}
