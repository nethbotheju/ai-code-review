import * as core from '@actions/core';
import { ActionInputs, ApiType } from './types';

const VALID_API_TYPES: ApiType[] = ['openai', 'openai-compatible', 'anthropic'];

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getInputs(): ActionInputs {
  const apiType = core.getInput('api-type', { required: true }).trim() as ApiType;
  if (!VALID_API_TYPES.includes(apiType)) {
    throw new Error(
      `Invalid api-type '${apiType}'. Must be one of: ${VALID_API_TYPES.join(', ')}`
    );
  }

  const apiKey = core.getInput('api-key', { required: true });
  const baseUrl = core.getInput('base-url').trim() || undefined;

  if (apiType === 'openai-compatible' && !baseUrl) {
    throw new Error("'base-url' is required when api-type is 'openai-compatible'.");
  }

  const model = core.getInput('model', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  const triggerComment = core.getInput('trigger-comment').trim() || '/ai-review';
  const triggerLabel = core.getInput('trigger-label').trim() || 'ai-review';
  const autoReview = core.getBooleanInput('auto-review');
  const maxFiles = Number.parseInt(core.getInput('max-files').trim() || '20', 10);
  const maxDiffLines = Number.parseInt(core.getInput('max-diff-lines').trim() || '3000', 10);
  const excludePatterns = parseList(core.getInput('exclude-patterns'));
  const useDefaultExcludes = core.getBooleanInput('use-default-excludes');
  const extraInstructions = core.getInput('extra-instructions').trim() || undefined;

  return {
    apiType,
    apiKey,
    baseUrl,
    model,
    githubToken,
    triggerComment,
    triggerLabel,
    autoReview,
    maxFiles,
    maxDiffLines,
    excludePatterns,
    useDefaultExcludes,
    extraInstructions,
  };
}
