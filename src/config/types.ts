/** Action configuration types + agent runtime types. */

export type ApiType = 'openai' | 'openai-compatible' | 'anthropic';
export type ReviewMode = 'standard' | 'agent';

export interface ActionInputs {
  apiType: ApiType;
  apiKey: string;
  baseUrl?: string;
  model: string;
  githubToken: string;
  triggerComment: string;
  triggerLabel: string;
  autoReview: boolean;
  maxFiles: number;
  maxDiffLines: number;
  excludePatterns: string[];
  useDefaultExcludes: boolean;
  extraInstructions?: string;
  // Agent mode
  reviewMode: ReviewMode;
  agentMaxSteps: number;
  agentMaxContextBytes: number;
  agentTarballMaxMb: number;
  contextDocs: string[];
  allowAgentOnCompatible: boolean;
}

export interface RepoRoot {
  /** Extracted repo root directory. */
  path: string;
  /** Temp working directory to remove on cleanup. */
  workDir: string;
}

export interface Budget {
  bytesUsed: number;
  filesRead: Set<string>;
  maxBytes: number;
  exhausted: boolean;
}
