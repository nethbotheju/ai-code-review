import { ActionInputs, Provider } from '../types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { joinUrl, safeText } from '../util';

export { joinUrl, safeText };

export function createProvider(inputs: ActionInputs): Provider {
  switch (inputs.apiType) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: inputs.apiKey,
        baseUrl: inputs.baseUrl ?? 'https://api.openai.com/v1',
        model: inputs.model,
      });
    case 'openai-compatible':
      return new OpenAIProvider({
        apiKey: inputs.apiKey,
        baseUrl: inputs.baseUrl!,
        model: inputs.model,
      });
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: inputs.apiKey,
        baseUrl: inputs.baseUrl ?? 'https://api.anthropic.com',
        model: inputs.model,
      });
    default:
      throw new Error(`Unsupported api-type: ${inputs.apiType as string}`);
  }
}
