import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { ReviewResult } from '../shared/types';

/**
 * Run a single-turn standard review (no tools, no snapshot).
 * Shared between standard mode and agent-mode fallback.
 */
export async function runStandardReview(
  model: LanguageModel,
  instructions: string,
  userMessage: string,
): Promise<ReviewResult> {
  const result = await generateText({
    model,
    instructions,
    messages: [{ role: 'user', content: userMessage }]
  });

  const usage = result.usage;

  return {
    text: result.text ?? '',
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    steps: result.steps?.length ?? 0,
  };
}
