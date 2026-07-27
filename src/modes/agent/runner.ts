import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as core from '@actions/core';
import type { ActionInputs, RepoRoot } from '../../config/types';
import type { ReviewResult } from '../../shared/types';
import { buildModelsJson, buildPiArgs, buildPiEnv, providerFor } from './pi-args';
import { ensurePiInstalled, invokePi } from './pi-process';
import { parsePiOutput } from './pi-output';

/**
 * Run the agent-mode review: install the pi subprocess, write an ephemeral
 * config dir (models.json for openai-compatible), spawn the CLI against the
 * repo snapshot, and parse its JSONL event stream into a ReviewResult.
 */
export async function runAgentReview(
  systemPrompt: string,
  userPrompt: string,
  repoRoot: RepoRoot,
  inputs: ActionInputs,
): Promise<ReviewResult> {
  const cliEntry = await ensurePiInstalled(inputs.piVersion);

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-config-'));
  try {
    if (inputs.apiType === 'openai-compatible') {
      fs.writeFileSync(
        path.join(configDir, 'models.json'),
        JSON.stringify(buildModelsJson(inputs), null, 2),
      );
    }

    const args = buildPiArgs(systemPrompt, userPrompt, inputs);
    const env = buildPiEnv(inputs, configDir);

    core.info(
      `pi engine: provider=${providerFor(inputs)} model=${inputs.model} ` +
        `timeout=${inputs.piTimeoutMs}ms`,
    );

    const { events, stderr } = await invokePi(
      cliEntry,
      args,
      repoRoot.path,
      env,
      inputs.piTimeoutMs,
    );

    if (stderr.trim()) {
      core.warning(`pi stderr (truncated):\n${stderr.trim().slice(0, 2000)}`);
    }

    return parsePiOutput(events);
  } finally {
    try {
      fs.rmSync(configDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
