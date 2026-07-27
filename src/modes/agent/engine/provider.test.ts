import { describe, it, expect } from 'vitest';
import type { ActionInputs, ApiType, ReviewMode } from '../../../config/types';
import { PI_CUSTOM_PROVIDER } from './constants';
import { buildModelsJson, providerFor } from './provider';

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    apiType: 'anthropic' as ApiType,
    apiKey: 'sk-test',
    model: 'claude-sonnet-4-5',
    githubToken: 'token',
    triggerComment: '/ai-review',
    triggerLabel: 'ai-review',
    autoReview: true,
    maxFiles: 20,
    maxDiffLines: 3000,
    excludePatterns: [],
    useDefaultExcludes: true,
    reviewMode: 'agent' as ReviewMode,
    agentTarballMaxMb: 200,
    contextDocs: ['AGENTS.md'],
    piVersion: '0.82.1',
    piTimeoutMs: 600000,
    ...overrides,
  };
}

describe('providerFor', () => {
  it('maps native api types to their pi provider ids', () => {
    expect(providerFor(makeInputs({ apiType: 'anthropic' }))).toBe('anthropic');
    expect(providerFor(makeInputs({ apiType: 'openai' }))).toBe('openai');
  });

  it('maps openai-compatible to the custom provider id', () => {
    expect(providerFor(makeInputs({ apiType: 'openai-compatible', baseUrl: 'https://x/v1' }))).toBe(
      PI_CUSTOM_PROVIDER,
    );
  });
});

describe('buildModelsJson', () => {
  it('builds an openai-completions provider referencing the env key', () => {
    const json = buildModelsJson(
      makeInputs({
        apiType: 'openai-compatible',
        apiKey: 'sk-x',
        baseUrl: 'https://gw.example.com/v1',
        model: 'my-model',
      }),
    ) as { providers: Record<string, Record<string, unknown>> };
    const provider = json.providers[PI_CUSTOM_PROVIDER];
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://gw.example.com/v1');
    expect(provider.api).toBe('openai-completions');
    expect(provider.apiKey).toBe('$CUSTOM_API_KEY');
    // the plaintext secret must never appear in the generated config
    expect(JSON.stringify(json)).not.toContain('sk-x');
    const models = provider.models as Array<{ id: string }>;
    expect(models[0].id).toBe('my-model');
  });

  it('opts out of developer role and reasoning knobs for max compatibility', () => {
    const json = buildModelsJson(
      makeInputs({ apiType: 'openai-compatible', baseUrl: 'https://x/v1' }),
    ) as { providers: Record<string, { compat: Record<string, unknown> }> };
    const compat = json.providers[PI_CUSTOM_PROVIDER].compat;
    expect(compat.supportsDeveloperRole).toBe(false);
    expect(compat.supportsReasoningEffort).toBe(false);
  });

  it('throws for non-compatible api types', () => {
    expect(() => buildModelsJson(makeInputs({ apiType: 'anthropic' }))).toThrow();
  });
});
