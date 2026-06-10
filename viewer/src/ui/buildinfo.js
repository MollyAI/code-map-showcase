// --------------------------------------------------------------------
// ui/buildinfo — pure formatter for the topbar build-info badge.
// DOM-free and side-effect-free (like data/* and util.js) so it imports
// cleanly under node for tests. main.js does the DOM write.
//
// Input is model.project; output is { text, title, hidden }:
//   text   — badge label, e.g.
//            "⎇ main · a1b2c3d* · 2026-06-06 14:30 · 架构评分：124"
//            (the arch-score segment appears only when project.score exists)
//   title  — multi-line tooltip (full commit / time / dirty note / score breakdown)
//   hidden — true when there is nothing to show (no time, no git, no score)
// --------------------------------------------------------------------

import { t } from '../i18n.js';

/** ISO "2026-06-06T14:30:09" -> "2026-06-06 14:30" (minute precision). */
function fmtTime(iso) {
  if (!iso || typeof iso !== 'string') return '';
  return iso.replace('T', ' ').slice(0, 16);
}

/** Badge segment for project.score, e.g. "Arch Score: 124" / "架构评分：124". */
function scoreSegment(project, lang) {
  const s = project && project.score;
  if (!s || typeof s.total !== 'number') return null;
  return t('arch_score_fmt', lang).replace('{n}', String(s.total));
}

/** Tooltip lines for project.score (empty array when absent). */
function scoreTitleLines(project, lang) {
  const s = project && project.score;
  if (!s || typeof s.total !== 'number') return [];
  const d = s.dimensions || {};
  const lines = [
    scoreSegment(project, lang),
    `${t('score_difficulty', lang)}: ${s.difficulty} · ${t('score_execution', lang)}: ${s.execution}`,
    `${t('score_layering', lang)}: ${d.layering?.score ?? '—'} · ` +
      `${t('score_dependencies', lang)}: ${d.dependencies?.score ?? '—'} · ` +
      `${t('score_hygiene', lang)}: ${d.hygiene?.score ?? '—'}`,
  ];
  if (s.adjustment) {
    const reason = (lang === 'zh' ? s.adjustment.reason_zh : s.adjustment.reason_en) || '';
    const sign = s.adjustment.delta > 0 ? '+' : '';
    lines.push(`${t('score_adjustment', lang)}: ${sign}${s.adjustment.delta} — ${reason}`);
  }
  return lines;
}

/**
 * @param {any} project model.project (may be undefined)
 * @param {string} lang  'en' | 'zh'
 * @returns {{ text: string, title: string, hidden: boolean }}
 */
export function formatBuildInfo(project, lang) {
  const time = fmtTime(project && project.generated_at);
  const score = scoreSegment(project, lang);
  const scoreLines = scoreTitleLines(project, lang);
  const git = project && project.git;
  if (!git) {
    const text = [time, score].filter(Boolean).join(' · ');
    const titleLines = [time ? `${t('built', lang)}: ${time}` : '', ...scoreLines].filter(Boolean);
    return { text, title: titleLines.join('\n'), hidden: !text };
  }
  const branchPart = git.branch && git.branch !== 'HEAD' ? `⎇ ${git.branch}` : '';
  const commitPart = git.short ? git.short + (git.dirty ? '*' : '') : '';
  const text = [branchPart, commitPart, time, score].filter(Boolean).join(' · ');
  const titleLines = [
    branchPart ? `${t('branch', lang)}: ${git.branch}` : '',
    git.commit ? `${t('commit', lang)}: ${git.commit}` : '',
    time ? `${t('built', lang)}: ${time}` : '',
    git.dirty ? t('dirty_note', lang) : '',
    ...scoreLines,
  ].filter(Boolean);
  return { text, title: titleLines.join('\n'), hidden: !text };
}
