// viewer/src/data/counts.js — DOM-free honest layer counts (R6).
// A layer header must not call everything "N 个类" — separate types from
// functions so a mostly-function layer reads honestly.
import { t } from '../i18n.js';

// kinds that are architectural TYPES; everything else (function / method /
// composable_function / accessor / unknown) is a behavioral unit.
const TYPE_KINDS = new Set([
  'class', 'interface', 'struct', 'protocol', 'enum', 'type_alias', 'type',
  'object', 'data_class', 'enum_class', 'sealed_class', 'actor', 'union', 'typedef',
]);

/**
 * @param {Iterable<{kind?:string}>} classes
 * @returns {{types:number, functions:number, total:number}}
 */
export function honestCount(classes) {
  let types = 0, functions = 0;
  for (const c of classes) {
    if (TYPE_KINDS.has(c.kind)) types++; else functions++;
  }
  return { types, functions, total: types + functions };
}

/**
 * Localized header label: "N 个类" / "N 个函数" / "N 项（M 类 · K 函数）".
 * @param {Iterable<{kind?:string}>} classes
 * @param {string} lang
 * @returns {string}
 */
export function countLabel(classes, lang) {
  const { types, functions, total } = honestCount(classes);
  if (functions === 0) return `${total} ${t('count_types', lang)}`;
  if (types === 0) return `${total} ${t('count_functions', lang)}`;
  return t('count_mixed', lang)
    .replace('{n}', String(total)).replace('{c}', String(types)).replace('{f}', String(functions));
}
