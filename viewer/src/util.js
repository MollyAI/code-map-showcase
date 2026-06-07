// --------------------------------------------------------------------
// util — pure helpers extracted from viewer/index.html.
// Top-level is DOM-free so this module is importable under node (tests,
// tsc). DOM/global access (navigator, document, window) only happens
// inside function bodies, i.e. at call time.
// --------------------------------------------------------------------

/**
 * Trailing-edge debounce: invokes `fn` once `ms` has elapsed since the
 * last call, with the most recent arguments.
 * @template {any[]} A
 * @param {(...args: A) => void} fn
 * @param {number} ms
 * @returns {(...args: A) => void}
 */
export function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * Escape a value for safe interpolation into HTML text.
 * Nullish input yields the empty string.
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, ch => (/** @type {Record<string, string>} */ ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }))[ch]);
}

/**
 * Escape a value for safe interpolation into an HTML attribute.
 * @param {unknown} s
 * @returns {string}
 */
export function escapeAttr(s) { return escapeHtml(s); }

/**
 * Truncate `s` to at most `max` characters, appending an ellipsis when
 * it overflows. Falsy input yields the empty string.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function truncate(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

/**
 * Copy `text` to the clipboard, preferring the async Clipboard API and
 * falling back to a hidden textarea + execCommand for non-secure
 * contexts.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // fallback for non-secure context (http on localhost is fine in modern browsers,
  // but we keep this for safety)
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand failed"));
    } catch (e) { reject(e); }
  });
}
