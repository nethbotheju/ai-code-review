import { describe, it, expect } from 'vitest';
import type { ActionInputs, ApiType, ReviewMode } from '../../config/types';
import { buildPiArgs, buildPiEnv } from './args';
import { PI_CUSTOM_PROVIDER, PI_CUSTOM_API_KEY_ENV } from './constants';

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

const SYSTEM = 'SYSTEM';
const USER = 'USER';

describe('buildPiArgs', () => {
  it('always uses headless, ephemeral, read-only settings', () => {
    const args = buildPiArgs(SYSTEM, USER, makeInputs());
    expect(args).toContain('-p');
    expect(args).toContain('--no-session');
    expect(args[args.indexOf('--mode') + 1]).toBe('json');
    expect(args).toContain('--offline');
    expect(args[args.indexOf('--thinking') + 1]).toBe('off');
    expect(args[args.indexOf('--tools') + 1]).toBe('read,grep,find,ls');
    // read-only: never expose destructive tools
    expect(args.join(' ')).not.toMatch(/\bbash\b|\bedit\b|\bwrite\b/);
  });

  it('passes provider + model + prompts', () => {
    const args = buildPiArgs(SYSTEM, USER, makeInputs({ apiType: 'anthropic', model: 'claude-x' }));
    expect(args[args.indexOf('--provider') + 1]).toBe('anthropic');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-x');
    expect(args[args.indexOf('--system-prompt') + 1]).toBe(SYSTEM);
    expect(args[args.length - 1]).toBe(USER);
  });

  it('uses the compatible provider id for openai-compatible', () => {
    const args = buildPiArgs(
      SYSTEM,
      USER,
      makeInputs({ apiType: 'openai-compatible', baseUrl: 'https://x/v1' }),
    );
    expect(args[args.indexOf('--provider') + 1]).toBe(PI_CUSTOM_PROVIDER);
  });
});

describe('buildPiEnv', () => {
  it('injects the key via env and relocates the config dir', () => {
    const env = buildPiEnv(makeInputs({ apiType: 'anthropic', apiKey: 'sk-secret' }), '/tmp/cfg');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-secret');
    expect(env.PI_CODING_AGENT_DIR).toBe('/tmp/cfg');
  });

  it('uses OPENAI_API_KEY for openai', () => {
    const env = buildPiEnv(makeInputs({ apiType: 'openai', apiKey: 'sk-openai' }), '/tmp/cfg');
    expect(env.OPENAI_API_KEY).toBe('sk-openai');
  });

  it('uses the compatible env var for openai-compatible', () => {
    const env = buildPiEnv(
      makeInputs({ apiType: 'openai-compatible', apiKey: 'sk-comp', baseUrl: 'https://x/v1' }),
      '/tmp/cfg',
    );
    expect(env[PI_CUSTOM_API_KEY_ENV]).toBe('sk-comp');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });
});
