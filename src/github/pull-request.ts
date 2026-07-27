import * as core from '@actions/core';
import type { ActionInputs } from '../config/types';
import type { AnnotatedLine, ChangedFile, FetchResult, PullRequestInfo } from '../shared/types';
import { isExcluded, resolveExcludes } from '../shared/util';
import type { OctokitLike } from './types';

export async function fetchPullRequest(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestInfo> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  return {
    number: data.number,
    title: data.title,
    body: data.body,
    headSha: data.head.sha,
  };
}

export async function fetchChangedFiles(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pullNumber: number,
  inputs: ActionInputs,
): Promise<FetchResult> {
  const all = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const excludes = resolveExcludes(inputs);

  const candidates = all.filter((f) => {
    if (f.status === 'removed') return false;
    if (!f.patch) return false;
    if (isExcluded(f.filename, excludes)) return false;
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
    `Found ${all.length} changed file(s); ${candidates.length} reviewable; reviewing ${files.length}.`,
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
    if (hunk && hunk[1] !== undefined) {
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
