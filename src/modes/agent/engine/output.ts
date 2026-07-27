import * as core from '@actions/core';
import type { ReviewResult } from '../../../shared/types';
import type { PiEvent, PiMessage } from './types';

/** Extract the concatenated text content of a pi message. */
export function messageText(m: PiMessage): string {
  const content = m.content;
  if (typeof content === 'string') return content.trim();
  return (content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
}

/** Collect assistant messages, preferring agent_end's full message list. */
function collectAssistantMessages(events: PiEvent[]): PiMessage[] {
  const agentEnd = [...events]
    .reverse()
    .find((e) => e.type === 'agent_end' && Array.isArray(e.messages) && e.messages.length > 0);

  if (agentEnd?.messages) {
    return agentEnd.messages.filter((m) => m.role === 'assistant');
  }
  const messages: PiMessage[] = [];
  for (const e of events) {
    if ((e.type === 'message_end' || e.type === 'turn_end') && e.message?.role === 'assistant') {
      messages.push(e.message);
    }
  }
  return messages;
}

/** Parse the pi JSONL event stream into a ReviewResult. Throws if no text. */
export function parsePiOutput(events: PiEvent[]): ReviewResult {
  const assistantMessages = collectAssistantMessages(events);

  // Final review text = last assistant message that produced text.
  let text = '';
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const t = messageText(assistantMessages[i]);
    if (t) {
      text = t;
      break;
    }
  }

  if (!text) {
    const lastError = assistantMessages[assistantMessages.length - 1]?.errorMessage;
    if (lastError) throw new Error(`pi review failed: ${lastError}`);
    throw new Error('pi produced no review text.');
  }

  // Token totals: sum across non-error assistant turns.
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let counted = false;
  for (const m of assistantMessages) {
    if (m.usage && m.stopReason !== 'error') {
      inputTokens += m.usage.input ?? 0;
      outputTokens += m.usage.output ?? 0;
      totalTokens += m.usage.total ?? 0;
      counted = true;
    }
  }

  const turns = events.filter((e) => e.type === 'turn_end').length;

  core.info(
    `pi review completed: ${turns} turn(s), ${assistantMessages.length} assistant message(s), ` +
      `tokens in=${inputTokens} out=${outputTokens} tot=${totalTokens}`,
  );

  return {
    text,
    inputTokens: counted ? inputTokens : undefined,
    outputTokens: counted ? outputTokens : undefined,
    totalTokens: counted ? totalTokens : undefined,
    steps: turns,
  };
}
