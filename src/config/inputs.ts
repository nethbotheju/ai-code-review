import * as core from '@actions/core';
import type { ActionInputs, AgentEngine, ApiType, ReviewMode } from './types';

const VALID_API_TYPES: ApiType[] = ['openai', 'openai-compatible', 'anthropic'];
const VALID_REVIEW_MODES: ReviewMode[] = ['standard', 'agent'];
const VALID_AGENT_ENGINES: AgentEngine[] = ['builtin', 'pi'];
const DEFAULT_PI_VERSION = '0.82.1';
// Injection-safe version spec (semver, prerelease, dist-tag). No spaces/shell metachars.
const VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._+\-]*$/;

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getInputs(): ActionInputs {
  const apiType = core.getInput('api-type', { required: true }).trim() as ApiType;
  if (!VALID_API_TYPES.includes(apiType)) {
    throw new Error(`Invalid api-type '${apiType}'. Must be one of: ${VALID_API_TYPES.join(', ')}`);
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

  const reviewModeRaw = core.getInput('review-mode').trim().toLowerCase() || 'standard';
  if (!VALID_REVIEW_MODES.includes(reviewModeRaw as ReviewMode)) {
    throw new Error(`Invalid review-mode '${reviewModeRaw}'. Must be one of: ${VALID_REVIEW_MODES.join(', ')}`);
  }
  const reviewMode = reviewModeRaw as ReviewMode;

  const agentMaxSteps = Number.parseInt(core.getInput('agent-max-steps').trim() || '8', 10);
  const agentMaxContextBytes = Number.parseInt(core.getInput('agent-max-context-bytes').trim() || '120000', 10);
  const agentTarballMaxMb = Number.parseInt(core.getInput('agent-tarball-max-mb').trim() || '200', 10);
  const contextDocs = parseList(core.getInput('context-docs'));
  const allowAgentOnCompatible = core.getBooleanInput('allow-agent-on-compatible');

  const agentEngineRaw = core.getInput('agent-engine').trim().toLowerCase() || 'builtin';
  if (!VALID_AGENT_ENGINES.includes(agentEngineRaw as AgentEngine)) {
    throw new Error(
      `Invalid agent-engine '${agentEngineRaw}'. Must be one of: ${VALID_AGENT_ENGINES.join(', ')}`,
    );
  }
  const agentEngine = agentEngineRaw as AgentEngine;

  const piVersion = core.getInput('pi-version').trim() || DEFAULT_PI_VERSION;
  if (!VERSION_PATTERN.test(piVersion)) {
    throw new Error(
      `Invalid pi-version '${piVersion}'. Must be a plain version or dist-tag (e.g. 0.82.1, latest).`,
    );
  }

  const piTimeoutMs = Number.parseInt(core.getInput('pi-timeout-ms').trim() || '600000', 10);

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
    reviewMode,
    agentMaxSteps,
    agentMaxContextBytes,
    agentTarballMaxMb,
    contextDocs: contextDocs.length > 0 ? contextDocs : ['AGENTS.md', '.ai-review.md', 'CONTRIBUTING.md'],
    allowAgentOnCompatible,
    agentEngine,
    piVersion,
    piTimeoutMs,
  };
}
