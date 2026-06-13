// --------------------------------------------------------------------
// interact/menu — the mobile overflow menu (⋯). On narrow screens the
// secondary topbar controls collapse into a dropdown (.controls-overflow,
// styled in the CSS mobile block); this toggles it open, closes it on an
// outside tap, and closes it after a control inside is used so the menu
// doesn't linger over the map. Inert on desktop (the ⋯ button is
// display:none and the controls render inline).
// --------------------------------------------------------------------

/**
 * @param {object} deps
 * @param {HTMLElement} deps.menuToggle  the ⋯ button (#menu-toggle)
 * @param {HTMLElement} deps.overflow     the .controls-overflow container
 */
export function initMenu({ menuToggle, overflow }) {
  if (!menuToggle || !overflow) return;
  /** @param {boolean} open */
  function setOpen(open) {
    overflow.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  menuToggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setOpen(!overflow.classList.contains('open'));
  });
  // Using any control inside closes the menu.
  overflow.addEventListener('click', () => setOpen(false));
  // Outside tap closes.
  document.addEventListener('click', (ev) => {
    if (!overflow.classList.contains('open')) return;
    const tgt = /** @type {Node} */ (ev.target);
    if (overflow.contains(tgt) || menuToggle.contains(tgt)) return;
    setOpen(false);
  });
}
