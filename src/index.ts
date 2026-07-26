import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { getInputs } from './config/inputs';
import { resolveTrigger } from './github/trigger';
import { fetchPullRequest, fetchChangedFiles } from './github/pull-request';
import { fetchFileContents } from './github/contents';
import { postReview, reactToComment } from './github/posting';
import { buildSystemPrompt, buildUserPrompt } from './review/prompt';
import { parseReview } from './review/parse';
import { formatNoChanges, formatReview } from './review/format';
import { runStandardReview } from './review/run';
import { createModel } from './llm/models';
import { runPiReview } from './agent/pi';
import { prepareRepoSnapshot, buildRepoTree, cleanupRepoSnapshot, RepoTooLargeError } from './agent/repo-snapshot';
import type { ActionInputs, RepoRoot } from './config/types';

async function run(): Promise<void> {
  let repoRoot: RepoRoot | undefined;

  try {
    const inputs = getInputs();
    core.setSecret(inputs.apiKey);

    const trigger = resolveTrigger(inputs);
    if (!trigger.run || !trigger.review) {
      core.info(`Skipping: ${trigger.reason}`);
      return;
    }

    const { owner, repo, pullNumber, commentId } = trigger.review;
    const octokit = getOctokit(inputs.githubToken);

    if (commentId) await reactToComment(octokit, owner, repo, commentId, 'eyes');

    const pr = await fetchPullRequest(octokit, owner, repo, pullNumber);
    core.info(`Reviewing PR #${pullNumber}: ${pr.title}`);

    const fetchResult = await fetchChangedFiles(octokit, owner, repo, pullNumber, inputs);
    if (fetchResult.files.length === 0) {
      await postReview(octokit, owner, repo, pullNumber, pr.headSha, formatNoChanges(), []);
      core.info('No reviewable changes; posted a skip notice.');
      if (commentId) await reactToComment(octokit, owner, repo, commentId, 'rocket');
      return;
    }

    const contextDocs = await fetchFileContents(octokit, owner, repo, pr.headSha, inputs.contextDocs, {
      maxBytes: 10000,
      maxFiles: 3,
    });

    // Whether we actually run agent mode (may degrade if tarball is too large)
    let useAgent = inputs.reviewMode === 'agent';

    if (useAgent) {
      try {
        repoRoot = await prepareRepoSnapshot(octokit, owner, repo, pr.headSha, inputs.agentTarballMaxMb);
      } catch (err) {
        if (err instanceof RepoTooLargeError) {
          core.warning(err.message);
          useAgent = false;
        } else {
          throw err;
        }
      }
    }

    // Build prompts
    const tree = useAgent && repoRoot ? buildRepoTree(repoRoot.path, inputs) : undefined;
    const promptInputs: ActionInputs = useAgent ? inputs : { ...inputs, reviewMode: 'standard' };
    const systemPrompt = buildSystemPrompt(promptInputs);
    const userPrompt = buildUserPrompt(pr, fetchResult.files, { docs: contextDocs, tree });

    // Run review
    const reviewResult = useAgent && repoRoot
      ? await runPiReview(systemPrompt, userPrompt, repoRoot, inputs)
      : await runStandardReview(createModel(inputs), systemPrompt, userPrompt);

    core.info(
      `Review done. tokens in=${reviewResult.inputTokens} out=${reviewResult.outputTokens} tot=${reviewResult.totalTokens} steps=${reviewResult.steps}`,
    );

    // Parse, format, post
    const doc = parseReview(reviewResult.text);
    const body = formatReview(doc, fetchResult.files);
    await postReview(octokit, owner, repo, pullNumber, pr.headSha, body, []);
    core.setOutput('summary', doc.solution || doc.background);

    core.info('Posted review.');
    if (commentId) await reactToComment(octokit, owner, repo, commentId, '+1');
  } catch (err) {
    core.setFailed(`AI code review failed: ${(err as Error).message}`);
  } finally {
    if (repoRoot) {
      try {
        cleanupRepoSnapshot(repoRoot);
      } catch {
        /* best-effort */
      }
    }
  }
}

run();
