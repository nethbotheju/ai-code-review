import type { ActionInputs } from '../../../config/types';
import { PI_CUSTOM_API_KEY_ENV } from './constants';
import { providerFor } from './provider';

/**
 * Build the pi CLI args for a headless read-only review run.
 * Assumes models.json (for compatible) has already been written to the config dir.
 */
export function buildPiArgs(
  systemPrompt: string,
  userPrompt: string,
  inputs: ActionInputs,
): string[] {
  return [
    '-p', // print mode: process the prompt and exit
    '--no-session', // ephemeral; never persist
    '--mode', 'json', // JSONL event stream on stdout
    '--offline', // no startup network (update checks / telemetry) — does not block the model call
    '--thinking', 'off', // cost control
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-context-files',
    '--no-themes',
    '--tools', 'read,grep,find,ls', // read-only investigation tools (no bash/edit/write)
    '--system-prompt', systemPrompt,
    '--provider', providerFor(inputs),
    '--model', inputs.model,
    userPrompt,
  ];
}

/** Build the child-process env. The API key is injected via env, never argv. */
export function buildPiEnv(inputs: ActionInputs, configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: configDir,
  };
  if (inputs.apiType === 'anthropic') {
    env.ANTHROPIC_API_KEY = inputs.apiKey;
  } else if (inputs.apiType === 'openai') {
    env.OPENAI_API_KEY = inputs.apiKey;
  } else {
    env[PI_CUSTOM_API_KEY_ENV] = inputs.apiKey;
  }
  return env;
}
