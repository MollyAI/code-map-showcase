// --------------------------------------------------------------------
// ui/buildinfo — pure formatter for the topbar build-info badge.
// DOM-free and side-effect-free (like data/* and util.js) so it imports
// cleanly under node for tests. main.js does the DOM write.
//
// Input is model.project; output is { text, title, hidden }:
//   text   — badge label, e.g. "⎇ main · a1b2c3d* · 2026-06-06 14:30"
//   title  — multi-line tooltip (full commit / time / dirty note)
//   hidden — true when there is nothing to show (no time, no git)
// --------------------------------------------------------------------

import { t } from '../i18n.js';

/** ISO "2026-06-06T14:30:09" -> "2026-06-06 14:30" (minute precision). */
function fmtTime(iso) {
  if (!iso || typeof iso !== 'string') return '';
  return iso.replace('T', ' ').slice(0, 16);
}

/**
 * @param {any} project model.project (may be undefined)
 * @param {string} lang  'en' | 'zh'
 * @returns {{ text: string, title: string, hidden: boolean }}
 */
export function formatBuildInfo(project, lang) {
  const time = fmtTime(project && project.generated_at);
  const git = project && project.git;
  if (!git) {
    return { text: time, title: time ? `${t('built', lang)}: ${time}` : '', hidden: !time };
  }
  const branchPart = git.branch && git.branch !== 'HEAD' ? `⎇ ${git.branch}` : '';
  const commitPart = git.short ? git.short + (git.dirty ? '*' : '') : '';
  const text = [branchPart, commitPart, time].filter(Boolean).join(' · ');
  const titleLines = [
    branchPart ? `${t('branch', lang)}: ${git.branch}` : '',
    git.commit ? `${t('commit', lang)}: ${git.commit}` : '',
    time ? `${t('built', lang)}: ${time}` : '',
    git.dirty ? t('dirty_note', lang) : '',
  ].filter(Boolean);
  return { text, title: titleLines.join('\n'), hidden: !text };
}
