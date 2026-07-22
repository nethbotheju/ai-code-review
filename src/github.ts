import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { ReviewComment } from './types';

type Octokit = ReturnType<typeof getOctokit>;

export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
  body: string,
  comments: ReviewComment[]
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
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  content: 'eyes' | '+1' | 'rocket'
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
