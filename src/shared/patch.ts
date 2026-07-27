import type { AnnotatedLine } from './types';

/** Parse a unified-diff patch into annotated lines (context/add/delete with new-line numbers). */
export function annotatePatch(patch: string): AnnotatedLine[] {
  const result: AnnotatedLine[] = [];
  const raw = patch.split('\n');
  let currentNew = 0;
  let inHunk = false;

  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

  for (const line of raw) {
    const hunk = hunkRe.exec(line);
    if (hunk && hunk[1] !== undefined) {
      currentNew = Number.parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith('+')) {
      result.push({ type: 'add', newLine: currentNew, content: line.slice(1) });
      currentNew++;
    } else if (line.startsWith('-')) {
      result.push({ type: 'delete', content: line.slice(1) });
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', newLine: currentNew, content });
      currentNew++;
    }
  }

  return result;
}
