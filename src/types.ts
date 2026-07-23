export type ApiType = 'openai' | 'openai-compatible' | 'anthropic';

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
}

export interface ReviewComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

export interface FileDescription {
  path: string;
  description: string;
}

export interface Recommendation {
  category: string;
  note: string;
}

export interface ReviewDocument {
  background: string;
  solution: string;
  files: FileDescription[];
  tests: string;
  recommendations: Recommendation[];
}
