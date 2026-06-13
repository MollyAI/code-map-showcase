// --------------------------------------------------------------------
// i18n — the UI string dictionary and lookup helpers extracted from
// viewer/index.html. Top-level is DOM-free so this module is importable
// under node (tests, tsc). DOM access happens only inside
// applyI18nStatic, i.e. at call time.
// --------------------------------------------------------------------

/**
 * A flat key→string dictionary for a single language.
 * @typedef {Record<string, string>} LangDict
 */

/**
 * The UI string dictionary, keyed by language code. Each language carries
 * the same set of keys (some are plural variants, e.g. `class_one` /
 * `class_other`).
 * @type {{ en: LangDict, zh: LangDict }}
 */
export const I18N = {
  en: {
    group_layers: "layers",
    group_flows: "flows",
    flow_empty: "no flows — pick a flow from the sidebar",
    collapse_flows: "collapse flow list",
    expand_flows: "show flow list",
    menu: "more controls",
    close_panel: "close",
    font_small: "small",
    font_medium: "medium (default)",
    font_large: "large",
    toggle_theme: "toggle light / dark",
    export_image: "export as image",
    zoom_out: "zoom out",
    zoom_reset: "reset to 100%",
    zoom_in: "zoom in",
    nothing_selected: "nothing selected.",
    click_node: "click a node in the map",
    error_load: "failed to load code map.",
    error_hint: "run /code-map:build in this project first.",
    class_one: "class",
    class_other: "classes",
    count_types: "classes",
    count_functions: "functions",
    count_mixed: "{n} items ({c} cls · {f} fn)",
    no_package: "(no package)",
    no_desc: "no description — run /code-map:build to let Claude annotate this class.",
    no_desc_core: "no description — only core classes / methods are annotated.",
    label_in: "in",
    label_out: "out",
    label_weight: "weight",
    label_core: "core",
    label_file: "file",
    label_loc: "lines",
    label_calls: "calls",
    label_methods: "methods",
    label_refs: "referenced by",
    yes: "yes",
    no: "no",
    depends_on: "depends on",
    depended_on_by: "depended on by",
    no_edges: "no edges to other classes in the map.",
    copy: "copy",
    copied: "copied",
    failed: "failed",
    uses: "uses",
    label_members: "members",
    kind_artifact: "artifact",
    kind_actor: "external actor",
    kind_participant: "participant",
    built: "Built",
    branch: "Branch",
    commit: "Commit",
    dirty_note: "Built with uncommitted changes",
    arch_score_fmt: "Arch Score: {n}",
    score_difficulty: "Difficulty D",
    score_execution: "Execution E",
    score_layering: "Layering",
    score_dependencies: "Dependencies",
    score_hygiene: "Hygiene",
    score_adjustment: "AI adjustment",
  },
  zh: {
    group_layers: "分层",
    group_flows: "流程",
    flow_empty: "暂无流程 — 请从左侧选择一条流程",
    collapse_flows: "收起流程列表",
    expand_flows: "展开流程列表",
    menu: "更多",
    close_panel: "关闭",
    font_small: "小",
    font_medium: "中（默认）",
    font_large: "大",
    toggle_theme: "切换亮色 / 暗色主题",
    export_image: "导出为图片",
    zoom_out: "缩小",
    zoom_reset: "重置为 100%",
    zoom_in: "放大",
    nothing_selected: "未选中任何节点",
    click_node: "点击地图中的节点查看详情",
    error_load: "无法加载代码地图",
    error_hint: "请先在项目中运行 /code-map:build。",
    class_one: "个类",
    class_other: "个类",
    count_types: "个类",
    count_functions: "个函数",
    count_mixed: "{n} 项（{c} 类 · {f} 函数）",
    no_package: "（无包名）",
    no_desc: "暂无描述 — 运行 /code-map:build 让 Claude 添加注释。",
    no_desc_core: "暂无描述 — 仅对核心类 / 方法生成解释。",
    label_in: "入度",
    label_out: "出度",
    label_weight: "权重",
    label_core: "核心",
    label_file: "文件名",
    label_loc: "代码行数",
    label_calls: "调用次数",
    label_methods: "方法数",
    label_refs: "被引用次数",
    yes: "是",
    no: "否",
    depends_on: "依赖",
    depended_on_by: "被依赖",
    no_edges: "与地图中其他类无连接关系",
    copy: "复制",
    copied: "已复制",
    failed: "失败",
    uses: "使用",
    label_members: "成员",
    kind_artifact: "数据工件",
    kind_actor: "外部参与者",
    kind_participant: "参与者",
    built: "构建于",
    branch: "分支",
    commit: "提交",
    dirty_note: "构建时工作区有未提交改动",
    arch_score_fmt: "架构评分：{n}",
    score_difficulty: "难度分 D",
    score_execution: "执行系数 E",
    score_layering: "分层",
    score_dependencies: "依赖",
    score_hygiene: "整洁",
    score_adjustment: "AI 修正",
  },
};

/**
 * Look up a UI string by key for the given language. Falls back to the
 * English string when the requested language lacks the key, and to the
 * key itself when neither language defines it. Faithful to the original
 * `t` in index.html, but with `lang` passed explicitly instead of read
 * from a module-global.
 * @param {string} key
 * @param {string} lang
 * @returns {string}
 */
export function t(key, lang) {
  const dict = /** @type {Record<string, LangDict>} */ (I18N)[lang];
  return (dict && dict[key]) || I18N.en[key] || key;
}

/**
 * Pick the active-language half of a possibly-bilingual string.
 *
 * Flow names / descriptions may be authored as a single combined string
 * ("中文 · English" / "中文描述 / English description"). When the string
 * splits on a known separator into two halves that differ in CJK content,
 * return the half matching `lang`; otherwise return the whole string
 * unchanged (monolingual, or an ambiguous split we won't guess at). This is
 * the fallback for legacy flow data that predates the explicit
 * name_zh/name_en/description_zh/description_en fields.
 * @param {string | null | undefined} combined
 * @param {string} lang  'zh' | 'en'
 * @returns {string}
 */
export function pickLangText(combined, lang) {
  if (!combined) return combined || '';
  const CJK = /[㐀-鿿]/;   // CJK Unified Ideographs (+ Ext A) — "is this the 中文 half?"
  for (const sep of [' / ', ' · ', ' | ', ' — ']) {
    const i = combined.indexOf(sep);
    if (i <= 0) continue;
    const a = combined.slice(0, i).trim();
    const b = combined.slice(i + sep.length).trim();
    if (!a || !b) continue;
    const aCJK = CJK.test(a), bCJK = CJK.test(b);
    if (aCJK === bCJK) continue;        // both / neither CJK — not a clean zh|en split
    const zh = aCJK ? a : b;
    const en = aCJK ? b : a;
    return lang === 'zh' ? zh : en;
  }
  return combined;
}

/**
 * 单一双语取值入口。配对字段(`<base>_zh`/`<base>_en`)优先,按 lang 挑、缺一半退另一半;
 * 没有配对时退回 pickLangText 拆旧拼接串("中文 · English"),再退单语裸串。所有渲染处
 * (detail / flow 列表 / layer band / group / 图内 label)统一走这里 —— 切换正确性的单一事实源。
 * @param {any} obj
 * @param {string} base
 * @param {string} lang  'zh' | 'en'
 * @returns {string}
 */
export function pickBilingual(obj, base, lang) {
  if (!obj) return '';
  const zh = obj[base + '_zh'], en = obj[base + '_en'];
  if (zh || en) return lang === 'zh' ? (zh || en) : (en || zh);
  return pickLangText(obj[base], lang);
}

/**
 * Translate all `[data-i18n]` text and `[data-i18n-title]` titles under
 * `root` into `lang`, and set the language on the `#html-root` element.
 * @param {ParentNode} root
 * @param {string} lang
 * @returns {void}
 */
export function applyI18nStatic(root, lang) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(/** @type {string} */ (el.getAttribute("data-i18n")), lang);
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    /** @type {HTMLElement} */ (el).title = t(/** @type {string} */ (el.getAttribute("data-i18n-title")), lang);
  });
  const htmlRoot = document.getElementById("html-root");
  if (htmlRoot) htmlRoot.lang = lang === "zh" ? "zh-CN" : "en";
}
