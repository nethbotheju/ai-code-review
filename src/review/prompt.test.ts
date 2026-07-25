import { describe, it, expect } from 'vitest';
import type { ActionInputs, ApiType, ReviewMode } from '../config/types';
import type { PromptContext } from './prompt';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { ChangedFile } from '../shared/types';

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    apiType: 'openai' as ApiType,
    apiKey: 'sk-test',
    model: 'gpt-4o',
    githubToken: 'token',
    triggerComment: '/ai-review',
    triggerLabel: 'ai-review',
    autoReview: true,
    maxFiles: 20,
    maxDiffLines: 3000,
    excludePatterns: [],
    useDefaultExcludes: true,
    reviewMode: 'standard' as ReviewMode,
    agentMaxSteps: 8,
    agentMaxContextBytes: 120000,
    agentTarballMaxMb: 200,
    contextDocs: ['AGENTS.md'],
    allowAgentOnCompatible: false,
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('produces standard prompt by default', () => {
    const inputs = makeInputs();
    const prompt = buildSystemPrompt(inputs);
    expect(prompt).toContain('You are a senior software engineer');
    expect(prompt).not.toContain('AGENT MODE');
    expect(prompt).toContain('recommendations');
    expect(prompt).toContain('background');
  });

  it('includes extra instructions when provided', () => {
    const inputs = makeInputs({ extraInstructions: 'Use functional style.' });
    const prompt = buildSystemPrompt(inputs);
    expect(prompt).toContain('Use functional style');
  });

  it('includes agent-mode instructions when reviewMode is agent', () => {
    const inputs = makeInputs({ reviewMode: 'agent' });
    const prompt = buildSystemPrompt(inputs);
    expect(prompt).toContain('AGENT MODE');
    expect(prompt).toContain('read_file');
    expect(prompt).toContain('search_files');
    expect(prompt).toContain('verify it by reading');
  });

  it('includes both agent mode and extra instructions', () => {
    const inputs = makeInputs({ reviewMode: 'agent', extraInstructions: 'Focus on security.' });
    const prompt = buildSystemPrompt(inputs);
    expect(prompt).toContain('AGENT MODE');
    expect(prompt).toContain('Focus on security');
  });
});

describe('buildUserPrompt', () => {
  const mockPr = { number: 42, title: 'Add feature X', body: 'This PR adds feature X.' };
  const mockFiles: ChangedFile[] = [
    {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 10,
      deletions: 2,
      lines: [
        { type: 'context', newLine: 1, content: '// old code' },
        { type: 'add', newLine: 2, content: '// new feature' },
        { type: 'delete', content: '// removed line' },
      ],
    },
  ];

  it('includes PR title and description', () => {
    const result = buildUserPrompt(mockPr, mockFiles);
    expect(result).toContain('# Pull Request #42: Add feature X');
    expect(result).toContain('This PR adds feature X');
    expect(result).toContain('src/index.ts');
  });

  it('includes diff content', () => {
    const result = buildUserPrompt(mockPr, mockFiles);
    expect(result).toContain('+');
    expect(result).toContain('-');
    expect(result).toContain('// old code');
    expect(result).toContain('// new feature');
  });

  it('includes repository tree when provided', () => {
    const ctx: PromptContext = { tree: '  src/\n  src/index.ts\n  README.md' };
    const result = buildUserPrompt(mockPr, mockFiles, ctx);
    expect(result).toContain('Repository Layout');
    expect(result).toContain('src/index.ts');
  });

  it('includes project guidance when provided', () => {
    const ctx: PromptContext = { docs: '## AGENTS.md\n\nUse TypeScript.' };
    const result = buildUserPrompt(mockPr, mockFiles, ctx);
    expect(result).toContain('Project Guidance');
    expect(result).toContain('Use TypeScript');
  });

  it('handles missing description', () => {
    const result = buildUserPrompt({ number: 1, title: 'Fix', body: null }, mockFiles);
    expect(result).not.toContain('Description');
    expect(result).toContain('Fix');
  });
});
