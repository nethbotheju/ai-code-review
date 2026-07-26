import * as core from '@actions/core';
import { generateText, isStepCount } from 'ai';
import type { LanguageModel } from 'ai';
import { createReadFileTool, createSearchFilesTool } from './tools';
import type { ActionInputs, Budget, RepoRoot } from '../config/types';
import type { ReviewResult } from '../shared/types';

/**
 * Run the agent-mode review.
 *
 * The model is given tools (read_file, search_files) backed by a local repo
 * snapshot. `generateText` automatically loops: model calls tools → results
 * are fed back → model responds → repeats until `stopWhen` fires.
 */
export async function runAgentReview(
  model: LanguageModel,
  instructions: string,
  userMessage: string,
  repoRoot: RepoRoot,
  inputs: ActionInputs,
): Promise<ReviewResult> {
  const budget: Budget = {
    bytesUsed: 0,
    filesRead: new Set(),
    maxBytes: inputs.agentMaxContextBytes,
    exhausted: false,
  };

  const readFileTool = createReadFileTool(repoRoot.path, budget, inputs);
  const searchFilesTool = createSearchFilesTool(repoRoot.path, budget, inputs);

  core.info(
    `Agent mode: max ${inputs.agentMaxSteps} tool-call rounds, budget ${budget.maxBytes} bytes`,
  );

  const result = await generateText({
    model,
    instructions,
    messages: [{ role: 'user', content: userMessage }],
    tools: { read_file: readFileTool, search_files: searchFilesTool },
    stopWhen: isStepCount(inputs.agentMaxSteps),
    maxRetries: 1,
  });

  const text = result.text ?? '';
  const usage = result.usage;
  const steps = result.steps?.length ?? 0;
  const toolCalls = result.toolCalls ?? [];

  core.info(
    `Agent completed: ${steps} step(s), ${toolCalls.length} tool call(s), ` +
      `files read: ${budget.filesRead.size}, context bytes used: ${budget.bytesUsed}` +
      (usage ? `, tokens in=${usage.inputTokens} out=${usage.outputTokens} tot=${usage.totalTokens}` : ''),
  );

  return {
    text,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    steps,
  };
}
