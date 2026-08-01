import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { ActionInputs } from '../../config/types';

export function createModel(inputs: ActionInputs): LanguageModel {
  switch (inputs.apiType) {
    case 'openai': {
      const factory = createOpenAI({ apiKey: inputs.apiKey });
      return factory(inputs.model);
    }
    case 'openai-chat-compatible': {
      if (!inputs.baseUrl) {
        throw new Error("'base-url' is required when api-type is 'openai-chat-compatible'.");
      }
      const factory = createOpenAI({ apiKey: inputs.apiKey, baseURL: inputs.baseUrl });
      return factory.chat(inputs.model);
    }
    case 'anthropic': {
      const factory = createAnthropic({ apiKey: inputs.apiKey });
      return factory(inputs.model);
    }
    default: {
      const _exhaustive: never = inputs.apiType;
      throw new Error(`Unsupported api-type: ${_exhaustive as string}`);
    }
  }
}
