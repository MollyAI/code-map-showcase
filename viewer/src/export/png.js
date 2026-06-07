// --------------------------------------------------------------------
// export/png — rasterize the whole map SVG to a PNG. The viewBox always
// spans the full diagram (zoom/pan only scale the rendered element), so we
// export the entire architecture regardless of zoom. External CSS is lost
// on serialization, so we inline computed paint/text props onto a clone
// (PROPS), strip class/id, rasterize at 2x onto a PADded canvas, and save
// via showSaveFilePicker with an <a download> fallback.
//
// Export is WYSIWYG: the live SVG is cloned verbatim, so whatever is on
// screen — the selected node's highlight, its dimmed peers, and (layer mode)
// the selected node's in/out edges that live in #edges — is baked into the
// PNG exactly as seen. inlineStyles reads the computed paint of that exact
// state, so no save/restore dance is needed. Was the initExport IIFE.
// --------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

// SVG presentation properties worth copying for a faithful render.
const PROPS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'opacity', 'color', 'display', 'visibility',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline', 'text-transform',
];

/** @param {Element} srcRoot @param {Element} cloneRoot */
function inlineStyles(srcRoot, cloneRoot) {
  const src = [srcRoot, ...srcRoot.querySelectorAll('*')];
  const dst = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
  for (let i = 0; i < src.length; i++) {
    const cs = getComputedStyle(src[i]);
    let decl = '';
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) decl += `${p}:${v};`;
    }
    dst[i].setAttribute('style', decl);
    dst[i].removeAttribute('class');
    dst[i].removeAttribute('id');
  }
}

/** @param {Blob} blob @param {string} suggestedName */
async function saveBlob(blob, suggestedName) {
  // Preferred (Chromium): native save dialog with a location picker.
  const anyWin = /** @type {any} */ (window);
  if (anyWin.showSaveFilePicker) {
    try {
      const handle = await anyWin.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err && /** @type {any} */ (err).name === 'AbortError') return; // user cancelled
      // any other failure: fall back to a plain download
    }
  }
  // Fallback (Firefox/Safari): trigger a download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {object} deps
 * @param {SVGSVGElement} deps.svg
 * @param {HTMLElement} deps.projectNameEl
 */
function makeExporter({ svg, projectNameEl }) {
  return async function exportPng() {
    const vb = svg.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height) return; // nothing rendered yet

    // WYSIWYG: clone the live SVG verbatim — selection highlight, dimmed peers
    // and the selected node's edges (in #edges) are all carried through, and
    // inlineStyles bakes the computed paint of that exact state onto the clone.
    const clone = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
    inlineStyles(svg, clone);

    const scale = 2;  // crisp on hi-dpi displays
    const pad = 64;   // breathing room around the diagram, in viewBox units
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', String(vb.width));
    clone.setAttribute('height', String(vb.height));
    clone.setAttribute('viewBox', `0 0 ${vb.width} ${vb.height}`);

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('svg render failed'));
        img.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil((vb.width + pad * 2) * scale);
      canvas.height = Math.ceil((vb.height + pad * 2) * scale);
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      // paint the page background so the PNG isn't transparent
      const bg = getComputedStyle(document.body).getPropertyValue('--bg-0').trim() || '#0a0e13';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // offset the diagram by `pad` (scaled) so the fill reads as a uniform margin
      ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
      ctx.drawImage(img, 0, 0);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const name = (projectNameEl.textContent || 'code-map').trim().replace(/[^\w.-]+/g, '-') || 'code-map';
      await saveBlob(blob, `${name}-code-map.png`);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };
}

/**
 * Wire the export button.
 * @param {object} deps
 * @param {SVGSVGElement} deps.svg
 * @param {HTMLElement} deps.exportBtn
 * @param {HTMLElement} deps.projectNameEl
 */
export function initExport({ svg, exportBtn, projectNameEl }) {
  const exportPng = makeExporter({ svg, projectNameEl });
  exportBtn.addEventListener('click', async () => {
    if (exportBtn.getAttribute('aria-busy') === 'true') return;
    exportBtn.setAttribute('aria-busy', 'true');
    try {
      await exportPng();
    } catch (err) {
      console.error('[code-map] export failed:', err);
    } finally {
      exportBtn.removeAttribute('aria-busy');
    }
  });
}
