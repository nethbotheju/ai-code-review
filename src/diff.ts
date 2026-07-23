import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { minimatch } from 'minimatch';
import { ActionInputs, AnnotatedLine, ChangedFile } from './types';

const DEFAULT_EXCLUDES = [
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/npm-shrinkwrap.json',
  '**/composer.lock',
  '**/Gemfile.lock',
  '**/Cargo.lock',
  '**/go.sum',
  '**/poetry.lock',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/node_modules/**',
];

interface PullRequestMeta {
  number: number;
  title: string;
  body: string | null;
  headSha: string;
}

export async function fetchPullRequest(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestMeta> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  return {
    number: data.number,
    title: data.title,
    body: data.body,
    headSha: data.head.sha,
  };
}

export interface FetchResult {
  files: ChangedFile[];
  totalFiles: number;
  reviewedFiles: number;
  truncated: boolean;
  truncatedReason?: string;
}

export async function fetchChangedFiles(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  inputs: ActionInputs
): Promise<FetchResult> {
  const all = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const excludes = [
    ...(inputs.useDefaultExcludes ? DEFAULT_EXCLUDES : []),
    ...inputs.excludePatterns,
  ];

  const isExcluded = (name: string): boolean =>
    excludes.some((pattern) => minimatch(name, pattern, { matchBase: true, dot: true }));

  const candidates = all.filter((f) => {
    if (f.status === 'removed') return false;
    if (!f.patch) return false;
    if (isExcluded(f.filename)) return false;
    return true;
  });

  const selected: typeof all = [];
  let addedLines = 0;
  let truncated = false;
  let truncatedReason: string | undefined;

  for (const file of candidates) {
    if (selected.length >= inputs.maxFiles) {
      truncated = true;
      truncatedReason = `Reached max-files limit (${inputs.maxFiles})`;
      break;
    }
    const nextTotal = addedLines + file.additions;
    if (nextTotal > inputs.maxDiffLines && selected.length > 0) {
      truncated = true;
      truncatedReason = `Reached max-diff-lines limit (${inputs.maxDiffLines})`;
      break;
    }
    addedLines = nextTotal;
    selected.push(file);
  }

  const files: ChangedFile[] = selected.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    lines: annotatePatch(f.patch as string),
  }));

  core.info(
    `Found ${all.length} changed file(s); ${candidates.length} reviewable; reviewing ${files.length}.`
  );

  return {
    files,
    totalFiles: all.length,
    reviewedFiles: files.length,
    truncated,
    truncatedReason,
  };
}

export function annotatePatch(patch: string): AnnotatedLine[] {
  const result: AnnotatedLine[] = [];
  const raw = patch.split('\n');
  let currentNew = 0;
  let inHunk = false;

  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

  for (const line of raw) {
    const hunk = hunkRe.exec(line);
    if (hunk) {
      currentNew = Number.parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith('+')) {
      result.push({ type: 'add', newLine: currentNew, content: line.slice(1) });
      currentNew++;
    } else if (line.startsWith('-')) {
      result.push({ type: 'delete', content: line.slice(1) });
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', newLine: currentNew, content });
      currentNew++;
    }
  }

  return result;
}
