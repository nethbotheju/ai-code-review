import { Provider } from '../types';
import { joinUrl, safeText } from '../util';

interface Options {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ChatChoice {
  message?: { content?: unknown };
}

interface ChatCompletionResponse {
  choices?: ChatChoice[];
  error?: { message?: string };
}

export class OpenAIProvider implements Provider {
  readonly name = 'openai';

  constructor(private readonly options: Options) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = joinUrl(this.options.baseUrl, 'chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI-compatible API error ${res.status}: ${await safeText(res)}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    if (data.error) {
      throw new Error(`OpenAI-compatible API error: ${data.error.message ?? 'unknown'}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error('OpenAI-compatible API returned no message content');
    }
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
