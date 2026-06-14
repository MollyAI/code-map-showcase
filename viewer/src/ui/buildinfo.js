// --------------------------------------------------------------------
// ui/buildinfo — pure formatter for the topbar build-info badge.
// DOM-free and side-effect-free (like data/* and util.js) so it imports
// cleanly under node for tests. main.js does the DOM write.
//
// Input is model.project; output is { text, lines, title, hidden }:
//   text   — badge label, e.g. "⎇ main · a1b2c3d* · 2026-06-06 14:30"
//   lines  — structured rows (full commit / time / dirty note) for the
//            click-to-open copyable popover
//   title  — lines joined with '\n' (legacy tooltip form)
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
 * @returns {{ text: string, lines: string[], title: string, hidden: boolean }}
 */
export function formatBuildInfo(project, lang) {
  const time = fmtTime(project && project.generated_at);
  const git = project && project.git;
  if (!git) {
    const text = time;
    const lines = [time ? `${t('built', lang)}: ${time}` : ''].filter(Boolean);
    return { text, lines, title: lines.join('\n'), hidden: !text };
  }
  const branchPart = git.branch && git.branch !== 'HEAD' ? `⎇ ${git.branch}` : '';
  const commitPart = git.short ? git.short + (git.dirty ? '*' : '') : '';
  const text = [branchPart, commitPart, time].filter(Boolean).join(' · ');
  const lines = [
    branchPart ? `${t('branch', lang)}: ${git.branch}` : '',
    git.commit ? `${t('commit', lang)}: ${git.commit}` : '',
    time ? `${t('built', lang)}: ${time}` : '',
    git.dirty ? t('dirty_note', lang) : '',
  ].filter(Boolean);
  return { text, lines, title: lines.join('\n'), hidden: !text };
}
