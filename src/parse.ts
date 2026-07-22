import { Finding, ReviewResult, Severity } from './types';

const VALID_SEVERITIES: Severity[] = ['critical', 'warning', 'suggestion', 'nit'];

export function parseReview(raw: string): ReviewResult {
  const text = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = JSON.parse(stripTrailingCommas(text));
  }

  const obj = parsed as { summary?: unknown; findings?: unknown };
  const summary = typeof obj?.summary === 'string' ? obj.summary.trim() : '';
  const findings: Finding[] = Array.isArray(obj?.findings)
    ? (obj.findings as unknown[])
        .map(normalizeFinding)
        .filter((f): f is Finding => f !== null)
    : [];

  return { summary, findings };
}

function extractJson(raw: string): string {
  let text = raw.trim();

  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) {
    text = fence[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return text;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function normalizeFinding(value: unknown): Finding | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Record<string, unknown>;

  const file = typeof f.file === 'string' ? f.file.trim() : '';
  const comment = typeof f.comment === 'string' ? f.comment.trim() : '';
  if (!file || !comment) return null;

  const rawSeverity = typeof f.severity === 'string' ? f.severity.toLowerCase() : '';
  const severity: Severity = VALID_SEVERITIES.includes(rawSeverity as Severity)
    ? (rawSeverity as Severity)
    : 'suggestion';

  const line = toInt(f.line) ?? 0;
  const suggestion =
    typeof f.suggestion === 'string' && f.suggestion.trim() ? f.suggestion.trim() : undefined;

  return { file, line, severity, comment, suggestion };
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}
