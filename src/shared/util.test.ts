import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ALWAYS_EXCLUDES, DEFAULT_EXCLUDES } from './util';
import { buildRepoTree } from '../modes/agent/snapshot';

describe('exclude resolution', () => {
  function fixture(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exclude-test-'));
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export {};');
    return dir;
  }

  it('always excludes build artifacts and dependencies regardless of useDefaultExcludes', () => {
    const dir = fixture();
    try {
      const tree = buildRepoTree(dir, { useDefaultExcludes: false, excludePatterns: [] });
      expect(tree).not.toContain('node_modules');
      expect(tree).not.toContain('dist/');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('also excludes lockfiles and minified files when useDefaultExcludes is true', () => {
    const dir = fixture();
    try {
      const tree = buildRepoTree(dir, { useDefaultExcludes: true, excludePatterns: [] });
      expect(tree).not.toContain('package-lock.json');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes lockfiles when useDefaultExcludes is false', () => {
    const dir = fixture();
    try {
      const tree = buildRepoTree(dir, { useDefaultExcludes: false, excludePatterns: [] });
      expect(tree).toContain('package-lock.json');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('user exclude patterns are appended after the defaults', () => {
    const dir = fixture();
    try {
      const tree = buildRepoTree(dir, {
        useDefaultExcludes: false,
        excludePatterns: ['src/**'],
      });
      expect(tree).not.toContain('src/index.ts');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ALWAYS_EXCLUDES and DEFAULT_EXCLUDES do not overlap', () => {
    for (const a of ALWAYS_EXCLUDES) {
      expect(DEFAULT_EXCLUDES).not.toContain(a);
    }
  });
});
