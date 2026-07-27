import * as core from '@actions/core';
import type { ReviewComment } from '../shared/types';
import type { OctokitLike } from './types';

export async function postReview(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
  body: string,
  comments: ReviewComment[],
): Promise<void> {
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    commit_id: headSha,
    event: 'COMMENT',
    body,
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
    })),
  });
}

export async function reactToComment(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  commentId: number,
  content: 'eyes' | '+1' | 'rocket',
): Promise<void> {
  try {
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      content,
    });
  } catch (err) {
    core.warning(`Could not add reaction to comment: ${(err as Error).message}`);
  }
}
