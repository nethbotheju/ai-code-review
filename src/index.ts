import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { getInputs } from './inputs';
import { resolveTrigger } from './context';
import { fetchChangedFiles, fetchPullRequest } from './diff';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { createProvider } from './llm/factory';
import { parseReview } from './parse';
import { mapFindings } from './review';
import { formatNoChanges, formatSummary } from './format';
import { postReview, reactToComment } from './github';

async function run(): Promise<void> {
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

    if (commentId) {
      await reactToComment(octokit, owner, repo, commentId, 'eyes');
    }

    const pr = await fetchPullRequest(octokit, owner, repo, pullNumber);
    core.info(`Reviewing PR #${pullNumber}: ${pr.title}`);

    const fetchResult = await fetchChangedFiles(octokit, owner, repo, pullNumber, inputs);
    if (fetchResult.files.length === 0) {
      await postReview(octokit, owner, repo, pullNumber, pr.headSha, formatNoChanges(), []);
      core.info('No reviewable changes; posted a skip notice.');
      if (commentId) await reactToComment(octokit, owner, repo, commentId, 'rocket');
      return;
    }

    const systemPrompt = buildSystemPrompt(inputs);
    const userPrompt = buildUserPrompt(pr, fetchResult.files);
    core.info(
      `Requesting review from ${inputs.apiType}/${inputs.model} for ${fetchResult.files.length} file(s)...`
    );

    const provider = createProvider(inputs);
    const raw = await provider.complete(systemPrompt, userPrompt);
    core.info('Received model response; parsing findings...');

    const result = parseReview(raw);
    const mapped = mapFindings(result.findings, fetchResult.files);

    const body = formatSummary({
      summary: result.summary,
      findings: result.findings,
      reviewedFiles: fetchResult.reviewedFiles,
      totalFiles: fetchResult.totalFiles,
      truncated: fetchResult.truncated,
      truncatedReason: fetchResult.truncatedReason,
      unmapped: mapped.unmapped,
      model: inputs.model,
      apiType: inputs.apiType,
    });

    await postReview(octokit, owner, repo, pullNumber, pr.headSha, body, mapped.comments);

    core.setOutput('summary', result.summary);
    core.info(
      `Posted review with ${mapped.comments.length} inline comment(s) and ${mapped.unmapped.length} general finding(s).`
    );

    if (commentId) await reactToComment(octokit, owner, repo, commentId, '+1');
  } catch (err) {
    core.setFailed(`AI code review failed: ${(err as Error).message}`);
  }
}

run();
