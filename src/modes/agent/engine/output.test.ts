import { describe, it, expect } from 'vitest';
import { parsePiOutput } from './output';
import type { PiEvent } from './types';
import type { ReviewResult } from '../../../shared/types';

const REVIEW_JSON = '{"background":"b","solution":"s","files":[],"recommendations":[]}';

function ev(type: string, extra: Record<string, unknown> = {}): PiEvent {
  return { type, ...extra };
}

describe('parsePiOutput', () => {
  it('extracts the final assistant text from agent_end and sums usage', () => {
    const events = [
      ev('message_start', { message: { role: 'user' } }),
      ev('turn_end', { message: { role: 'assistant' } }),
      ev('agent_end', {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'review this' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: REVIEW_JSON }],
            usage: { input: 120, output: 40, total: 160 },
            stopReason: 'end_turn',
          },
        ],
      }),
    ];
    const result: ReviewResult = parsePiOutput(events);
    expect(result.text).toBe(REVIEW_JSON);
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(40);
    expect(result.totalTokens).toBe(160);
    expect(result.steps).toBe(1); // one turn_end
  });

  it('sums usage across multiple non-error assistant turns', () => {
    const events = [
      ev('turn_end', { message: { role: 'assistant' } }),
      ev('turn_end', { message: { role: 'assistant' } }),
      ev('agent_end', {
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'thinking...' }],
            usage: { input: 100, output: 10, total: 110 },
            stopReason: 'tool_use',
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: REVIEW_JSON }],
            usage: { input: 50, output: 20, total: 70 },
            stopReason: 'end_turn',
          },
        ],
      }),
    ];
    const result = parsePiOutput(events);
    expect(result.text).toBe(REVIEW_JSON);
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(30);
    expect(result.steps).toBe(2);
  });

  it('ignores error-typed assistant messages when summing usage', () => {
    const events = [
      ev('agent_end', {
        messages: [
          {
            role: 'assistant',
            content: [],
            usage: { input: 5, output: 0, total: 5 },
            stopReason: 'error',
            errorMessage: 'rate limited',
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: REVIEW_JSON }],
            usage: { input: 100, output: 40, total: 140 },
            stopReason: 'end_turn',
          },
        ],
      }),
    ];
    const result = parsePiOutput(events);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(40);
  });

  it('falls back to streamed message_end when agent_end is absent', () => {
    const events = [
      ev('message_end', {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: REVIEW_JSON }],
          usage: { input: 10, output: 5, total: 15 },
          stopReason: 'end_turn',
        },
      }),
      ev('turn_end', { message: { role: 'assistant' } }),
    ];
    const result = parsePiOutput(events);
    expect(result.text).toBe(REVIEW_JSON);
    expect(result.inputTokens).toBe(10);
  });

  it('handles string content (non-array) messages', () => {
    const events = [
      ev('agent_end', {
        messages: [
          {
            role: 'assistant',
            content: REVIEW_JSON,
            usage: { input: 1, output: 1, total: 2 },
            stopReason: 'end_turn',
          },
        ],
      }),
    ];
    const result = parsePiOutput(events);
    expect(result.text).toBe(REVIEW_JSON);
  });

  it('throws with the pi error message when the final turn errored with no text', () => {
    const events = [
      ev('agent_end', {
        messages: [
          { role: 'assistant', content: [], stopReason: 'error', errorMessage: '401 invalid key' },
        ],
      }),
    ];
    expect(() => parsePiOutput(events)).toThrow(/401 invalid key/);
  });

  it('throws when there is no review text at all', () => {
    const events = [ev('turn_end', { message: { role: 'assistant', content: [] } })];
    expect(() => parsePiOutput(events)).toThrow(/no review text/);
  });
});
