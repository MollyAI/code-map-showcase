// --------------------------------------------------------------------
// landing.js — gallery home. Reuses the synced viewer's settings + util so
// theme/language persist seamlessly into the map (same-origin localStorage,
// same "code-map-" keys). Loads projects.json (produced by scripts/publish.mjs)
// and renders a searchable card grid; each card links to the viewer with
// ?project=<slug>, which the viewer resolves to data/<slug>/code-map.json.
//
// Coupling contract with the viewer (kept stable across CI syncs):
//   viewer/src/settings.js  → createSettings
//   viewer/src/util.js      → escapeHtml
//   viewer/style.css        → design tokens + .light theme + theme-toggle CSS
// --------------------------------------------------------------------
import { createSettings } from './viewer/src/settings.js';
import { escapeHtml } from './viewer/src/util.js';

const settings = createSettings();
const $ = (id) => document.getElementById(id);

const STR = {
  en: {
    tagline: 'Codebase architecture maps, built for humans.',
    search: 'Search projects by name or language…',
    files: 'files', decls: 'decls', layers: 'layers', flows: 'flows',
    score: 'Arch Score',
    raw: 'phase 1',
    empty: 'No projects yet. Publish one with <code>node scripts/publish.mjs --from &lt;path&gt;/.code-map</code>',
    none: (q) => `No projects match “${escapeHtml(q)}”.`,
    failed: 'Could not load projects.json.',
    cta_title: 'Build a code map for your project',
    cta_desc: 'code map is a free, open-source plugin — turn any codebase into an interactive architectural map.',
    cta_btn: 'View on GitHub',
  },
  zh: {
    tagline: '为人类构建的代码库架构地图。',
    search: '按名称或语言搜索项目…',
    files: '文件', decls: '声明', layers: '层', flows: '流程',
    score: '架构评分',
    raw: '未精炼',
    empty: '还没有项目。用 <code>node scripts/publish.mjs --from &lt;路径&gt;/.code-map</code> 发布一个。',
    none: (q) => `没有匹配 “${escapeHtml(q)}” 的项目。`,
    failed: '无法加载 projects.json。',
    cta_title: '为你的项目构建 code map',
    cta_desc: 'code map 是免费、开源的插件 —— 把任意代码库变成可交互的架构地图。',
    cta_btn: '在 GitHub 查看',
  },
};

// initial language mirrors the viewer's fallback (controls.js initLang): stored
// value, else browser locale, else English — so a zh visitor sees the gallery and
// the map in the same language on first visit.
let lang = settings.get('lang') || ((navigator.language && navigator.language.startsWith('zh')) ? 'zh' : 'en');
let all = [];
let booted = false;   // false until projects.json settles — distinguishes "loading" from "genuinely empty"
let loadError = false;

// ---------- theme (mirrors viewer/src/ui/controls.js) ----------
const applyTheme = (t) => document.body.classList.toggle('light', t === 'light');
const sysLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
applyTheme(settings.get('theme') || (sysLight ? 'light' : 'dark'));
$('theme-toggle').addEventListener('click', () => {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next);
  settings.set('theme', next);
});

// ---------- language ----------
function applyLang() {
  const s = STR[lang];
  document.getElementById('html-root').lang = lang === 'zh' ? 'zh-CN' : 'en';
  $('hero-tagline').textContent = s.tagline;
  $('search').placeholder = s.search;
  $('cta-title').textContent = s.cta_title;
  $('cta-desc').textContent = s.cta_desc;
  $('cta-btn-label').textContent = s.cta_btn;
  $('lang-toggle').textContent = lang === 'zh' ? '中' : 'EN';   // current language glyph, matching the viewer
  render();
}
$('lang-toggle').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  settings.set('lang', lang);
  applyLang();
});

// ---------- render ----------
function cardHtml(p) {
  const s = STR[lang];
  const href = `viewer/index.html?project=${encodeURIComponent(p.slug)}`;
  const langs = (p.languages || []).map((l) => `<span class="lang-chip">${escapeHtml(l)}</span>`).join('');
  const stats = [
    p.files != null ? [p.files, s.files] : null,
    [p.declarations, s.decls],
    [p.layers, s.layers],
    [p.flows, s.flows],
  ].filter(Boolean)
    .map(([n, label]) => `${Number(n)} ${label}`)   // coerce: stats are numeric; hardens against a hand-edited projects.json
    .join('<span class="dot">·</span>');
  const desc = p.description ? `<p class="card-desc">${escapeHtml(p.description)}</p>` : '';
  const tag = p.refined ? '' : `<span class="card-tag" title="Phase 1 only — run /code-map:build for a refined map">${s.raw}</span>`;
  // arch-score badge (plugin ≥1.11 stamps project.score; older maps have none)
  const score = p.score != null
    ? `<span class="card-score" title="${s.score}">${Number(p.score)}</span>`
    : '';
  const git = p.git && p.git.short
    ? `<div class="card-git">${escapeHtml(p.git.branch || '')} <span class="accent">${escapeHtml(p.git.short)}</span></div>`
    : '';
  return `<a class="card" href="${href}">
    <div class="card-head"><span class="card-name">${escapeHtml(p.name)}</span><span class="card-head-side">${score}${tag}</span></div>
    ${langs ? `<div class="card-langs">${langs}</div>` : ''}
    ${desc}
    <div class="card-stats">${stats}</div>
    ${git}
  </a>`;
}

function render() {
  const gallery = $('gallery');
  const note = $('gallery-note');
  const s = STR[lang];

  if (loadError) {
    gallery.innerHTML = '';
    note.textContent = s.failed;
    note.hidden = false;
    return;
  }
  if (!booted) {                       // still loading — show nothing, not the empty-state copy
    gallery.innerHTML = '';
    note.hidden = true;
    return;
  }
  if (!all.length) {
    gallery.innerHTML = '';
    note.innerHTML = s.empty;
    note.hidden = false;
    return;
  }

  const q = $('search').value.trim().toLowerCase();
  const hits = q
    ? all.filter((p) => [p.name, p.slug, p.description, ...(p.languages || []), ...(p.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(q))
    : all;

  gallery.innerHTML = hits.map(cardHtml).join('');
  if (!hits.length) { note.innerHTML = s.none(q); note.hidden = false; }
  else note.hidden = true;
}

$('search').addEventListener('input', render);

// ---------- boot ----------
applyLang();
fetch('./projects.json', { cache: 'no-store' })
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then((j) => {
    all = Array.isArray(j.projects) ? j.projects : [];
    // publish.mjs already orders by score, but re-sort defensively (older projects.json)
    all.sort((a, b) => ((b.score ?? -Infinity) - (a.score ?? -Infinity)) || String(a.name).localeCompare(String(b.name)));
    booted = true; render();
  })
  .catch(() => { loadError = true; booted = true; render(); });
