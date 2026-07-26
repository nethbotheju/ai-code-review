import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createReadFileTool, createSearchFilesTool } from './tools';
import type { Budget, ActionInputs, ApiType, ReviewMode } from '../config/types';

function makeInputs(overrides?: Partial<ActionInputs>): ActionInputs {
  return {
    apiType: 'openai' as ApiType,
    apiKey: 'test',
    model: 'gpt-4o',
    githubToken: 'test',
    triggerComment: '/ai-review',
    triggerLabel: 'ai-review',
    autoReview: true,
    maxFiles: 20,
    maxDiffLines: 3000,
    excludePatterns: [],
    useDefaultExcludes: false,
    reviewMode: 'agent' as ReviewMode,
    agentMaxSteps: 8,
    agentMaxContextBytes: 50000,
    agentTarballMaxMb: 200,
    contextDocs: ['AGENTS.md'],
    allowAgentOnCompatible: false,
    agentEngine: 'builtin',
    piVersion: '0.82.1',
    piTimeoutMs: 600000,
    ...overrides,
  };
}

function createFixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-test-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src', 'greet.ts'),
    [
      'export function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'export function farewell(name: string): string {',
      '  return `Goodbye, ${name}!`;',
      '}',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'auth.ts'),
    [
      'export function validateToken(token: string): boolean {',
      '  return token.length > 0;',
      '}',
      '',
      'export const DEFAULT_ROLE = "user";',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(dir, 'secret.key'), 'should-not-be-readable');
  return dir;
}

function makeBudget(maxBytes = 50000): Budget {
  return { bytesUsed: 0, filesRead: new Set(), maxBytes, exhausted: false };
}

describe('createReadFileTool', () => {
  it('reads a file by relative path', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createReadFileTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ path: 'src/greet.ts' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('Hello');
      expect(budget.filesRead.has('src/greet.ts')).toBe(true);
      expect(budget.bytesUsed).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a specific line range', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createReadFileTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ path: 'src/greet.ts', startLine: 1, endLine: 2 }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('1:export function greet');
      expect(result).not.toContain('farewell');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects path traversal', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createReadFileTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ path: '../../etc/passwd' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('[ERROR');
      expect(result).toContain('path traversal');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips denylisted files', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createReadFileTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ path: 'secret.key' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('[SKIPPED');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns early when budget exhausted', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget(100);
      budget.exhausted = true;
      const tool = createReadFileTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ path: 'src/greet.ts' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('Context budget exhausted');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSearchFilesTool', () => {
  it('finds matching text in files', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createSearchFilesTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ pattern: 'validateToken' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toContain('validateToken');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns zero results for non-matching pattern', async () => {
    const dir = createFixtureDir();
    try {
      const budget = makeBudget();
      const tool = createSearchFilesTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ pattern: 'NonExistentSymbol' }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      expect(result).toMatch(/No matches/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps results', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-test-'));
    try {
      fs.writeFileSync(path.join(dir, 'big.ts'), Array.from({ length: 100 }, (_, i) => `line ${i}: x`).join('\n'));
      const budget = makeBudget();
      const tool = createSearchFilesTool(dir, budget, makeInputs());
      const raw = await tool.execute!({ pattern: 'x', maxResults: 10 }, {} as any);
      const result = typeof raw === 'string' ? raw : '';
      const lines = result.split('\n');
      expect(lines.filter((l) => l.includes(': ')).length).toBeLessThanOrEqual(12);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
