import { describe, it, expect } from 'vitest';
import { annotatePatch } from './pull-request';

describe('annotatePatch', () => {
  it('returns empty for an empty patch', () => {
    expect(annotatePatch('')).toEqual([]);
  });

  it('ignores text before the first hunk header', () => {
    const patch = `diff --git a/a.ts b/a.ts
index 1234..5678 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 line1
-old
+new
 line3`;
    const out = annotatePatch(patch);
    expect(out).toEqual([
      { type: 'context', newLine: 1, content: 'line1' },
      { type: 'delete', content: 'old' },
      { type: 'add', newLine: 2, content: 'new' },
      { type: 'context', newLine: 3, content: 'line3' },
    ]);
  });

  it('tracks new-line numbers across hunks', () => {
    const patch = `@@ -10,2 +10,2 @@
 a
-b
+B
@@ -50,2 +51,2 @@
 c
-d
+D`;
    const out = annotatePatch(patch);
    expect(out[0]).toEqual({ type: 'context', newLine: 10, content: 'a' });
    expect(out[1]).toEqual({ type: 'delete', content: 'b' });
    expect(out[2]).toEqual({ type: 'add', newLine: 11, content: 'B' });
    expect(out[3]).toEqual({ type: 'context', newLine: 51, content: 'c' });
    expect(out[4]).toEqual({ type: 'delete', content: 'd' });
    expect(out[5]).toEqual({ type: 'add', newLine: 52, content: 'D' });
  });

  it('does not number delete lines', () => {
    const patch = `@@ -1,2 +1,1 @@
 kept
-removed`;
    const out = annotatePatch(patch);
    expect(out[0]).toEqual({ type: 'context', newLine: 1, content: 'kept' });
    expect(out[1]).toEqual({ type: 'delete', content: 'removed' });
    expect(out[1]).not.toHaveProperty('newLine');
  });

  it('skips "\ No newline at end of file" markers', () => {
    const patch = `@@ -1,2 +1,2 @@
 a
-b
+B
\\ No newline at end of file`;
    const out = annotatePatch(patch);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ type: 'add', newLine: 2, content: 'B' });
  });

  it('handles a hunk header with no count', () => {
    const patch = `@@ -0,0 +1 @@
+added`;
    const out = annotatePatch(patch);
    expect(out).toEqual([{ type: 'add', newLine: 1, content: 'added' }]);
  });

  it('handles a context line without leading space', () => {
    const patch = `@@ -1,1 +1,1 @@
bare`;
    const out = annotatePatch(patch);
    expect(out[0]).toEqual({ type: 'context', newLine: 1, content: 'bare' });
  });
});
