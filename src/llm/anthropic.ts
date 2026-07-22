import { Provider } from '../types';
import { joinUrl, safeText } from '../util';

interface Options {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  content?: ContentBlock[];
  error?: { message?: string };
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';

  constructor(private readonly options: Options) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = joinUrl(this.options.baseUrl, 'v1/messages');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 4096,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await safeText(res)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    if (data.error) {
      throw new Error(`Anthropic API error: ${data.error.message ?? 'unknown'}`);
    }

    const text = (data.content ?? [])
      .map((block) => (block.type === 'text' ? block.text ?? '' : ''))
      .join('');
    if (!text) {
      throw new Error('Anthropic API returned no text content');
    }
    return text;
  }
}
