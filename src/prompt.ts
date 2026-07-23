import { ActionInputs, ChangedFile } from './types';
import { truncate } from './util';

interface PullRequestLike {
  number: number;
  title: string;
  body: string | null;
}

export function buildSystemPrompt(inputs: ActionInputs): string {
  const base = `You are a senior software engineer reviewing a GitHub pull request.
Produce a clear, professional, high-level review.

Respond with ONLY a JSON object (no markdown fences, no prose) using exactly this schema:

{
  "background": "1-3 sentences: what this change addresses and why it is needed (your understanding of the PR's intent).",
  "solution": "1-3 sentences: assessment of the implementation approach taken.",
  "files": [
    { "path": "<exact path from the diff>", "description": "concise description of what changed in this file" }
  ],
  "tests": "brief, factual note on test changes present in the diff (tests added or updated). Return an empty string if there are no test changes. Do NOT complain about missing tests; concerns about insufficient coverage belong in \"recommendations\".",
  "recommendations": [
    { "category": "Security | Edge Case | Performance | Refactoring Tip", "note": "a substantive, high-level suggestion" }
  ]
}

Rules:
- Be concise and high-level. Do not restate the diff.
- "recommendations" must contain ONLY substantive, actionable, high-level items: real security risks, meaningful edge cases, performance issues, or genuine refactoring opportunities.
- EXCLUDE trivial noise: never mention missing or extra comments, missing tests as a complaint, code-style preferences, or obvious restatements. If there is nothing substantive, return an empty "recommendations" array.
- "files" should cover the key changed files with concise descriptions and exact paths.
- "tests" must be factual and brief; never lecture.
- Output the JSON object and nothing else.`;

  if (inputs.extraInstructions) {
    return `${base}\n\nAdditional review instructions from the project:\n${inputs.extraInstructions}`;
  }
  return base;
}

export function buildUserPrompt(pr: PullRequestLike, files: ChangedFile[]): string {
  const parts: string[] = [];
  parts.push(`# Pull Request #${pr.number}: ${pr.title}`);
  if (pr.body && pr.body.trim()) {
    parts.push('');
    parts.push('## Description');
    parts.push(truncate(pr.body.trim(), 2000));
  }
  parts.push('');
  parts.push(`## Changed files (${files.length})`);
  parts.push('Below are the changed files and their diffs.');
  parts.push('');
  for (const file of files) {
    parts.push(renderFile(file));
    parts.push('');
  }
  return parts.join('\n');
}

function renderFile(file: ChangedFile): string {
  const out: string[] = [];
  out.push(`### ${file.filename}  (+${file.additions} -${file.deletions}, ${file.status})`);
  out.push('```diff');
  for (const line of file.lines) {
    if (line.type === 'add') {
      out.push(`+${pad(line.newLine)} ${line.content}`);
    } else if (line.type === 'delete') {
      out.push(`-${pad()} ${line.content}`);
    } else {
      out.push(` ${pad(line.newLine)} ${line.content}`);
    }
  }
  out.push('```');
  return out.join('\n');
}

function pad(n?: number): string {
  return (n ?? '').toString().padStart(5, ' ');
}
