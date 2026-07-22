import { ChangedFile, Finding, ReviewComment } from './types';
import { formatInlineComment } from './format';

export interface MappedReview {
  comments: ReviewComment[];
  unmapped: Finding[];
}

export function mapFindings(findings: Finding[], files: ChangedFile[]): MappedReview {
  const byFile = new Map<string, ChangedFile>();
  for (const f of files) byFile.set(f.filename, f);

  const comments: ReviewComment[] = [];
  const unmapped: Finding[] = [];
  const placed = new Set<string>();

  for (const f of findings) {
    const file = findFile(byFile, f.file);
    if (!file) {
      unmapped.push(f);
      continue;
    }

    const line = snapToValidLine(f.line, file.validNewLines);
    if (line == null) {
      unmapped.push(f);
      continue;
    }

    const key = `${file.filename}:${line}:${f.comment}`;
    if (placed.has(key)) continue;
    placed.add(key);

    comments.push({
      path: file.filename,
      line,
      side: 'RIGHT',
      body: formatInlineComment(f),
    });
  }

  return { comments, unmapped };
}

function findFile(byFile: Map<string, ChangedFile>, name: string): ChangedFile | undefined {
  const target = name.trim();
  if (byFile.has(target)) return byFile.get(target);

  const targetBase = target.split('/').pop();
  for (const file of byFile.values()) {
    const fileBase = file.filename.split('/').pop();
    if (fileBase && targetBase && fileBase === targetBase) return file;
    if (file.filename.endsWith(target) || target.endsWith(file.filename)) return file;
  }
  return undefined;
}

function snapToValidLine(line: number, valid: Set<number>): number | null {
  if (valid.size === 0) return null;
  if (line > 0 && valid.has(line)) return line;

  let best: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of valid) {
    const delta = Math.abs(candidate - (line > 0 ? line : 0));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}
