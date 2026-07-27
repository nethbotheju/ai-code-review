import { describe, it, expect, vi, type Mock } from 'vitest';
import { postReview, reactToComment } from './posting';
import type { ReviewComment } from '../shared/types';
import type { OctokitLike } from './types';

interface OctokitMocks {
  createReview: Mock;
  createReaction: Mock;
}

function makeOctokit(overrides: Partial<OctokitMocks> = {}): OctokitLike {
  const mocks: OctokitMocks = {
    createReview: overrides.createReview ?? vi.fn().mockResolvedValue({ data: { id: 1 } }),
    createReaction: overrides.createReaction ?? vi.fn().mockResolvedValue({ data: { id: 1 } }),
  };
  return {
    rest: {
      pulls: { createReview: mocks.createReview },
      reactions: { createForIssueComment: mocks.createReaction },
    },
  } as unknown as OctokitLike;
}

describe('postReview', () => {
  it('maps ReviewComment to the octokit shape and sends the review', async () => {
    const octokit = makeOctokit();
    const comments: ReviewComment[] = [
      { path: 'src/a.ts', line: 10, side: 'RIGHT', body: 'Fix this' },
    ];
    await postReview(octokit, 'o', 'r', 1, 'sha', 'body', comments);
    expect(octokit.rest.pulls.createReview as unknown as Mock).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      commit_id: 'sha',
      event: 'COMMENT',
      body: 'body',
      comments: [{ path: 'src/a.ts', line: 10, side: 'RIGHT', body: 'Fix this' }],
    });
  });

  it('sends an empty comments array when none provided', async () => {
    const octokit = makeOctokit();
    await postReview(octokit, 'o', 'r', 1, 'sha', 'body', []);
    expect(octokit.rest.pulls.createReview as unknown as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ comments: [] }),
    );
  });
});

describe('reactToComment', () => {
  it('sends a reaction with the given content', async () => {
    const octokit = makeOctokit();
    await reactToComment(octokit, 'o', 'r', 42, 'eyes');
    expect(octokit.rest.reactions.createForIssueComment as unknown as Mock).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      comment_id: 42,
      content: 'eyes',
    });
  });

  it('swallows errors instead of throwing', async () => {
    const octokit = makeOctokit({
      createReaction: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await expect(reactToComment(octokit, 'o', 'r', 42, '+1')).resolves.toBeUndefined();
  });
});
