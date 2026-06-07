// --------------------------------------------------------------------
// settings — localStorage persistence wrapper extracted from
// viewer/index.html. Single persistence entry point for every UI setting:
// new settings read their initial value via .get(key, fallback) and call
// .set(key, value) on change — that's all it takes to survive a
// server/browser restart. Keys are namespaced with "code-map-"; existing
// keys are kept verbatim so values saved by older versions still load.
//
// Top-level is storage-free so this module is importable under node (tests,
// tsc): the storage backend is injected, defaulting to
// globalThis.localStorage, and only touched inside method bodies.
// --------------------------------------------------------------------

/**
 * Minimal subset of the Web Storage API this wrapper depends on.
 * @typedef {{
 *   getItem(key: string): string | null,
 *   setItem(key: string, value: string): void,
 * }} StorageLike
 */

/**
 * The persistence facade returned by {@link createSettings}.
 * @typedef {{
 *   get(key: string, fallback?: string | null): string | null,
 *   set(key: string, value: string): void,
 * }} Settings
 */

/**
 * Build a namespaced, fault-tolerant localStorage wrapper. Mirrors the
 * original `Settings` object from viewer/index.html: get/set wrap every
 * storage access in try/catch (so a disabled/throwing storage degrades to
 * the fallback rather than crashing) and prefix keys with `prefix`.
 * @param {StorageLike} [storage=globalThis.localStorage]
 * @param {string} [prefix="code-map-"]
 * @returns {Settings}
 */
export function createSettings(storage = globalThis.localStorage, prefix = "code-map-") {
  return {
    /**
     * @param {string} key
     * @param {string | null} [fallback=null]
     * @returns {string | null}
     */
    get(key, fallback = null) {
      try {
        const v = storage.getItem(prefix + key);
        return v === null ? fallback : v;
      } catch (_) { return fallback; }
    },
    /**
     * @param {string} key
     * @param {string} value
     * @returns {void}
     */
    set(key, value) {
      try { storage.setItem(prefix + key, value); } catch (_) { /* ignore */ }
    },
  };
}

/**
 * Normalize a persisted grouping mode. Mirrors the inline migration in
 * viewer/index.html's initGrouping: anything that isn't "flow" collapses to
 * "layer", which migrates the legacy "subsystem" value to "layer".
 * @param {string | null} value
 * @returns {"flow" | "layer"}
 */
export function migrateGrouping(value) {
  return (value === "flow") ? "flow" : "layer";
}
