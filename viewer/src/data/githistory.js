// --------------------------------------------------------------------
// data/githistory — commit-history sidebar data. buildNodesByPath /
// nodeIdsForCommit are pure (unit-tested); loadGitHistory lazily fetches
// the build-time sidecar (/git-history.json) and caches it on state.
// --------------------------------------------------------------------

import { state } from '../store.js';
import { dataUrl } from './source.js';

/** path → [class id, …] over all layers. A file may host several classes.
 * @param {Array<{classes?: Array<{id:string,path?:string}>}>} layers
 * @returns {Map<string, string[]>} */
export function buildNodesByPath(layers) {
  /** @type {Map<string, string[]>} */
  const m = new Map();
  for (const L of layers || []) {
    for (const c of (L.classes || [])) {
      if (!c.path) continue;
      if (!m.has(c.path)) m.set(c.path, []);
      /** @type {string[]} */ (m.get(c.path)).push(c.id);
    }
  }
  return m;
}

/** Union of class ids whose file was changed in `commit`.
 * @param {{files?: string[]}} commit @param {Map<string,string[]>} nodesByPath
 * @returns {Set<string>} */
export function nodeIdsForCommit(commit, nodesByPath) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const f of ((commit && commit.files) || [])) {
    for (const id of (nodesByPath.get(f) || [])) out.add(id);
  }
  return out;
}

/** Lazily fetch the sidecar once; cache { loaded, commits, error } on state.
 * @returns {Promise<{loaded:boolean,commits:any[],error:string|null}>} */
export async function loadGitHistory() {
  if (state.gitHistory && state.gitHistory.loaded) return state.gitHistory;
  try {
    const r = await fetch(dataUrl('git-history.json'), { cache: 'no-store' });
    const j = r.ok ? await r.json() : { commits: [] };
    state.gitHistory = { loaded: true, commits: Array.isArray(j.commits) ? j.commits : [], error: null };
  } catch (e) {
    state.gitHistory = { loaded: true, commits: [], error: (e && /** @type {any} */ (e).message) || String(e) };
  }
  return state.gitHistory;
}
