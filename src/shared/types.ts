/** Domain data shapes shared across the pipeline. */

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

export interface PullRequestInfo {
  number: number;
  title: string;
  body: string | null;
  headSha: string;
}

export interface FetchResult {
  files: ChangedFile[];
  totalFiles: number;
  reviewedFiles: number;
  truncated: boolean;
  truncatedReason?: string;
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
  recommendations: Recommendation[];
}

/** Result of running a review (standard or agent), before parsing/formatting. */
export interface ReviewResult {
  text: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  steps: number;
}
