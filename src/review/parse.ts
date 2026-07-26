import type { FileDescription, Recommendation, ReviewDocument } from '../shared/types';

export function parseReview(raw: string): ReviewDocument {
  const text = extractJson(raw);
  const parsed = parseLenient(text);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  return {
    background: asString(obj.background),
    solution: asString(obj.solution),
    files: asFileDescriptions(obj.files),
    recommendations: asRecommendations(obj.recommendations),
  };
}

function extractJson(raw: string): string {
  let text = raw.trim();

  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  return text;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function normalizeQuotes(text: string): string {
  return text.replace(/"/g, '\\"').replace(/'/g, '"');
}

function parseLenient(text: string): unknown {
  const cleaned = stripComments(stripTrailingCommas(text));
  const candidates = [text, cleaned];
  if (cleaned.includes("'")) candidates.push(normalizeQuotes(cleaned));
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  throw new Error(
    `Could not parse model response as JSON (${(lastError as Error).message}). Model response was:\n${preview}`
  );
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asFileDescriptions(value: unknown): FileDescription[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const f = item as Record<string, unknown>;
      const path = typeof f.path === 'string' ? f.path.trim() : '';
      const description = typeof f.description === 'string' ? f.description.trim() : '';
      if (!path) return null;
      return { path, description };
    })
    .filter((x): x is FileDescription => x !== null);
}

function asRecommendations(value: unknown): Recommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const note = typeof r.note === 'string' ? r.note.trim() : '';
      if (!note) return null;
      const category = typeof r.category === 'string' && r.category.trim() ? r.category.trim() : 'Suggestion';
      return { category, note };
    })
    .filter((x): x is Recommendation => x !== null);
}
