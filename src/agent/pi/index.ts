import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as core from '@actions/core';
import type { ActionInputs, RepoRoot } from '../../config/types';
import type { ReviewResult } from '../../shared/types';
import { buildPiArgs, buildPiEnv } from './args';
import { buildModelsJson, providerFor } from './provider';
import { ensurePiInstalled } from './install';
import { invokePi } from './spawn';
import { parsePiOutput } from './output';

/**
 * Run the pi coding agent in headless print mode against the repo snapshot.
 * Installs pi (cached), writes an ephemeral config dir (models.json for
 * openai-compatible), spawns the CLI, and parses its JSONL event stream.
 */
export async function runPiReview(
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

// Public surface re-exports
export { providerFor, buildModelsJson } from './provider';
export { buildPiArgs, buildPiEnv } from './args';
export { parsePiOutput, messageText } from './output';
export { ensurePiInstalled, installDir, cliEntryPath } from './install';
export { PI_PACKAGE, PI_CUSTOM_PROVIDER, PI_CUSTOM_API_KEY_ENV } from './constants';
export type { PiEvent, PiMessage, PiUsage, PiContentPart } from './types';
