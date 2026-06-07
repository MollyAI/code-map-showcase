// --------------------------------------------------------------------
// interact/keyboard — global key bindings. Currently: Escape deselects.
// Was the standalone keydown listener in index.html.
// --------------------------------------------------------------------

/**
 * @param {() => void} onEscape  deselect (was selectNode(null))
 */
export function initKeyboard(onEscape) {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') onEscape();
  });
}
