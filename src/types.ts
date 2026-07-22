export type ApiType = 'openai' | 'openai-compatible' | 'anthropic';

export type Severity = 'critical' | 'warning' | 'suggestion' | 'nit';

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
}

export interface Provider {
  readonly name: string;
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface AnnotatedLine {
  type: 'context' | 'add' | 'delete';
  newLine?: number;
  oldLine?: number;
  content: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  lines: AnnotatedLine[];
  validNewLines: Set<number>;
}

export interface Finding {
  file: string;
  line: number;
  severity: Severity;
  comment: string;
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  findings: Finding[];
}

export interface ReviewComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}
