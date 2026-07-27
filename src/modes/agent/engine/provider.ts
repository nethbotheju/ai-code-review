import type { ActionInputs } from '../../../config/types';
import { PI_CUSTOM_API_KEY_ENV, PI_CUSTOM_PROVIDER } from './constants';

/** Map the action's api-type to a pi provider id. */
export function providerFor(inputs: ActionInputs): string {
  switch (inputs.apiType) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'openai-compatible':
      return PI_CUSTOM_PROVIDER;
    default: {
      const _exhaustive: never = inputs.apiType;
      throw new Error(`Unsupported api-type: ${_exhaustive as string}`);
    }
  }
}

/**
 * Build the models.json content for an openai-compatible endpoint. The key is
 * referenced via env interpolation ($CUSTOM_API_KEY) so it never
 * appears in argv or on disk in plaintext beyond the process env.
 */
export function buildModelsJson(inputs: ActionInputs): Record<string, unknown> {
  if (inputs.apiType !== 'openai-compatible') {
    throw new Error('buildModelsJson is only for openai-compatible.');
  }
  return {
    providers: {
      [PI_CUSTOM_PROVIDER]: {
        name: 'AI Review Compatible',
        baseUrl: inputs.baseUrl,
        api: 'openai-completions',
        apiKey: `$${PI_CUSTOM_API_KEY_ENV}`,
        // Maximise compatibility with arbitrary OpenAI-compatible servers:
        // send the system prompt as a `system` message and skip reasoning knobs.
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: [{ id: inputs.model }],
      },
    },
  };
}
