import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { safeResolve, buildRepoTree, RepoTooLargeError } from './repo-snapshot';

function createFixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/utils'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test' }));
  fs.writeFileSync(path.join(dir, 'src/index.ts'), 'console.log("hello");\n');
  fs.writeFileSync(path.join(dir, 'src/utils/auth.ts'), 'export const TOKEN = "abc";\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  try {
    fs.symlinkSync(path.join(dir, 'src'), path.join(dir, 'linked'), 'dir');
  } catch {
    // Symlinks may fail on Windows
  }
  return dir;
}

describe('safeResolve', () => {
  it('resolves a valid relative path', () => {
    const dir = createFixtureDir();
    try {
      const result = safeResolve(dir, 'src/index.ts');
      expect(result).toBe(path.join(dir, 'src/index.ts'));
      expect(fs.existsSync(result!)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects path traversal (../../etc/passwd)', () => {
    const dir = createFixtureDir();
    try {
      const result = safeResolve(dir, '../../etc/passwd');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects same-prefix traversal (../foobar)', () => {
    const dir = createFixtureDir();
    try {
      // dir=/tmp/xxx, ../foobar -> /tmp/foobar which startsWith('/tmp/xxx') is false due to isWithin
      const result = safeResolve(dir, `../${path.basename(dir)}2`);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects absolute paths', () => {
    const result = safeResolve('/tmp', '/etc/passwd');
    expect(result).toBeNull();
  });

  it('rejects symlink escapes', () => {
    const dir = createFixtureDir();
    try {
      const linkedDir = path.join(dir, 'linked');
      if (!fs.existsSync(linkedDir)) return;
      const result = safeResolve(dir, 'linked/../../etc/passwd');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows normal subdirectory access', () => {
    const dir = createFixtureDir();
    try {
      const result = safeResolve(dir, 'src/utils/auth.ts');
      expect(result).toBe(path.join(dir, 'src/utils/auth.ts'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw for non-existent files', () => {
    const dir = createFixtureDir();
    try {
      const result = safeResolve(dir, 'nonexistent.ts');
      expect(result).toBe(path.join(dir, 'nonexistent.ts'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildRepoTree', () => {
  it('excludes default patterns and dotfiles', () => {
    const dir = createFixtureDir();
    try {
      const inputs = { useDefaultExcludes: true, excludePatterns: [] as string[] };
      const tree = buildRepoTree(dir, inputs, 200);
      expect(tree).toContain('src/');
      expect(tree).toContain('src/index.ts');
      expect(tree).toContain('src/utils/');
      expect(tree).toContain('src/utils/auth.ts');
      expect(tree).toContain('package.json');
      expect(tree).toContain('README.md');
      expect(tree).not.toContain('node_modules/');
      expect(tree).not.toContain('.git/');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('truncates when exceeding max entries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-tree-test-'));
    try {
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(path.join(dir, `file${i}.ts`), '');
      }
      const inputs = { useDefaultExcludes: false, excludePatterns: [] as string[] };
      const tree = buildRepoTree(dir, inputs, 10);
      expect(tree).toContain('truncated');
      expect(tree.split('\n').length).toBeLessThan(30);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filters out extra exclude patterns', () => {
    const dir = createFixtureDir();
    try {
      const inputs = { useDefaultExcludes: false, excludePatterns: ['docs/**'] as string[] };
      const tree = buildRepoTree(dir, inputs);
      expect(tree).not.toContain('docs/');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes dotfiles when not excluded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotfile-test-'));
    try {
      fs.writeFileSync(path.join(dir, '.github'), '');
      const inputs = { useDefaultExcludes: false, excludePatterns: [] as string[] };
      const tree = buildRepoTree(dir, inputs, 200);
      expect(tree).toContain('.github');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('RepoTooLargeError', () => {
  it('creates error with correct message', () => {
    const err = new RepoTooLargeError(150, 100);
    expect(err.name).toBe('RepoTooLargeError');
    expect(err.message).toContain('150MB');
    expect(err.message).toContain('100MB');
  });
});
