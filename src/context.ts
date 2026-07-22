import { context } from '@actions/github';
import { ActionInputs } from './types';

export interface ReviewContext {
  owner: string;
  repo: string;
  pullNumber: number;
  commentId?: number;
}

export interface ResolveResult {
  run: boolean;
  reason: string;
  review?: ReviewContext;
}

export function resolveTrigger(inputs: ActionInputs): ResolveResult {
  const eventName = context.eventName;
  const payload = context.payload as Record<string, unknown>;
  const repo = context.repo;

  if (eventName === 'pull_request') {
    const pr = payload.pull_request as { number: number } | undefined;
    if (!pr) {
      return { run: false, reason: 'pull_request event has no pull_request payload' };
    }

    const action = (payload.action as string) ?? '';
    const isLabelTrigger = action === 'labeled';

    if (isLabelTrigger) {
      const labelName = (payload.label as { name?: string })?.name;
      if (labelName !== inputs.triggerLabel) {
        return {
          run: false,
          reason: `Label '${labelName}' is not the trigger label '${inputs.triggerLabel}'`,
        };
      }
    } else if (!inputs.autoReview) {
      return {
        run: false,
        reason: `PR action '${action}' ignored (auto-review is disabled; use the '${inputs.triggerLabel}' label or '${inputs.triggerComment}' command)`,
      };
    }

    return {
      run: true,
      reason: `Triggered by pull_request (${action})`,
      review: { owner: repo.owner, repo: repo.repo, pullNumber: pr.number },
    };
  }

  if (eventName === 'issue_comment') {
    const issue = payload.issue as
      | { number: number; pull_request?: unknown }
      | undefined;
    const comment = payload.comment as { body?: string; id?: number } | undefined;

    if (!issue?.pull_request) {
      return { run: false, reason: 'Comment is not on a pull request' };
    }

    const body = (comment?.body ?? '').trim();
    if (!body.toLowerCase().startsWith(inputs.triggerComment.toLowerCase())) {
      return {
        run: false,
        reason: `Comment does not start with '${inputs.triggerComment}'`,
      };
    }

    return {
      run: true,
      reason: `Triggered by issue_comment ('${inputs.triggerComment}')`,
      review: {
        owner: repo.owner,
        repo: repo.repo,
        pullNumber: issue.number,
        commentId: comment?.id,
      },
    };
  }

  return { run: false, reason: `Unsupported event: ${eventName}` };
}
