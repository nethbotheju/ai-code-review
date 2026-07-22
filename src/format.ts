import { Finding, Severity } from './types';

const SEVERITY_META: Record<Severity, { icon: string; label: string }> = {
  critical: { icon: '🔴', label: 'Critical' },
  warning: { icon: '🟠', label: 'Warning' },
  suggestion: { icon: '🔵', label: 'Suggestion' },
  nit: { icon: '⚪', label: 'Nit' },
};

export function formatInlineComment(f: Finding): string {
  const meta = SEVERITY_META[f.severity] ?? SEVERITY_META.suggestion;
  const lines: string[] = [`**${meta.icon} ${meta.label}**`, '', f.comment];
  if (f.suggestion) {
    lines.push('', `**How to fix:** ${f.suggestion}`);
  }
  return lines.join('\n');
}

export interface SummaryOptions {
  summary: string;
  findings: Finding[];
  reviewedFiles: number;
  totalFiles: number;
  truncated: boolean;
  truncatedReason?: string;
  unmapped: Finding[];
  model: string;
  apiType: string;
}

export function formatSummary(opts: SummaryOptions): string {
  const counts = countBySeverity(opts.findings);
  const lines: string[] = ['## 🤖 AI Code Review', ''];

  lines.push(
    `Reviewed **${opts.reviewedFiles}** of **${opts.totalFiles}** changed file(s) · **${opts.findings.length}** finding(s).`,
    ''
  );

  if (opts.truncated) {
    lines.push(
      `> ⚠️ This review was limited to fit the model's context (${opts.truncatedReason}). Additional files were not reviewed.`,
      ''
    );
  }

  lines.push('| Severity | Count |', '| --- | --- |');
  for (const key of ['critical', 'warning', 'suggestion', 'nit'] as Severity[]) {
    lines.push(`| ${SEVERITY_META[key].icon} ${SEVERITY_META[key].label} | ${counts[key]} |`);
  }
  lines.push('');

  lines.push('### Overview', opts.summary.trim() || '_No summary provided._', '');

  if (opts.unmapped.length > 0) {
    lines.push('<details><summary>📌 General findings (not tied to a specific diff line)</summary>', '');
    for (const f of opts.unmapped) {
      const meta = SEVERITY_META[f.severity] ?? SEVERITY_META.suggestion;
      lines.push(`**${meta.icon} ${meta.label} — \`${f.file}\`**`, f.comment);
      if (f.suggestion) lines.push(`_How to fix:_ ${f.suggestion}`);
      lines.push('');
    }
    lines.push('</details>', '');
  }

  lines.push(
    '---',
    `_Automated review using \`${opts.model}\` via \`${opts.apiType}\`. Findings are recommendations, not blocking checks._`
  );

  return lines.join('\n');
}

export function formatNoChanges(): string {
  return [
    '## 🤖 AI Code Review',
    '',
    'No reviewable code changes were found (only excluded, generated, deleted, or binary files).',
    '',
    '_Review skipped._',
  ].join('\n');
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    warning: 0,
    suggestion: 0,
    nit: 0,
  };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}
