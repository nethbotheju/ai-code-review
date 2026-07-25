import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { generateText, isStepCount } from 'ai';

describe('mock model generates text', () => {
  it('returns text and steps', async () => {
    const mockModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: '{"recommendations":[]}' }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined } as const,
          outputTokens: { total: 2, text: 2, reasoning: undefined } as const,
        },
        warnings: [],
      }),
    });

    const result = await generateText({
      model: mockModel,
      instructions: 'Test',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.text).toContain('recommendations');
    expect(result.steps.length).toBe(1);
    expect(result.usage?.inputTokens).toBe(5);
  });
});

describe('stopWhen behavior', () => {
  it('stops after configured steps', async () => {
    const mockModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: 'done' }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined } as const,
          outputTokens: { total: 2, text: 2, reasoning: undefined } as const,
        },
        warnings: [],
      }),
    });

    const result = await generateText({
      model: mockModel,
      instructions: 'Test',
      messages: [{ role: 'user', content: 'Hello' }],
      stopWhen: isStepCount(2),
    });

    expect(result.text).toBe('done');
    expect(result.steps.length).toBe(1);
  });
});
