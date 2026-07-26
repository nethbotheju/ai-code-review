import type { ActionInputs } from '../config/types';
import type { AgentEngine } from '../config/types';
import type { ChangedFile } from '../shared/types';
import { truncate } from '../shared/util';

interface PullRequestLike {
  number: number;
  title: string;
  body: string | null;
}

export function buildSystemPrompt(inputs: ActionInputs): string {
  const isAgent = inputs.reviewMode === 'agent';

  const base = `You are a senior software engineer reviewing a GitHub pull request.
Produce a clear, professional, high-level review.

Your ENTIRE response must be a single valid JSON object and nothing else — no markdown, no code fences, no commentary before or after. Respond with ONLY this JSON object, using exactly this schema:

{
  "background": "1-3 sentences: what this change addresses and why it is needed (your understanding of the PR's intent).",
  "solution": "1-3 sentences: assessment of the implementation approach taken.",
  "files": [
    { "path": "<exact path from the diff>", "description": "concise description of what changed in this file" }
  ],
  "recommendations": [
    { "category": "Security | Edge Case | Performance | Refactoring Tip", "note": "a substantive, high-level suggestion" }
  ]
}

Rules:
- Be concise and high-level. Do not restate the diff.
- "recommendations" must contain ONLY substantive, actionable, high-level items: real security risks, meaningful edge cases, performance issues, critical-path test coverage gaps, or genuine refactoring opportunities.
- EXCLUDE trivial noise: never mention missing or extra comments, code-style preferences, or obvious restatements. If there is nothing substantive, return an empty "recommendations" array.
- "files" should cover the key changed files with concise descriptions and exact paths.
- Output the JSON object and nothing else.`;

  const extras: string[] = [];

  if (isAgent) {
    extras.push(agentModeAddendum(inputs.agentEngine));
  }

  if (inputs.extraInstructions) {
    extras.push(`Additional review instructions from the project:\n${inputs.extraInstructions}`);
  }

  if (extras.length === 0) return base;
  return `${base}\n\n${extras.join('\n\n')}`;
}

function agentModeAddendum(engine: AgentEngine): string {
  const tools =
    engine === 'pi'
      ? 'You have read-only tools to inspect the repository: `read` (read a file), `grep` (search file contents), `find` (find files by name), and `ls` (list a directory).'
      : 'You have access to the tools `read_file` and `search_files` to inspect the repository.';
  return `IMPORTANT — AGENT MODE:
- ${tools}
- **Before asserting any problem**, verify it by reading the relevant files. If you suspect a fix already exists (e.g. in middleware, utility functions, or another part of the codebase), use the tools to confirm.
- Only make a recommendation if you have verified the issue exists in the code you read.
- If you need more context, use the tools — do not guess.
- The repository layout, project guidance, and project documentation are provided in the prompt.
- Your final response must still be ONLY the JSON review object above — no additional text.`;
}

export interface PromptContext {
  docs?: string;
  tree?: string;
}

export function buildUserPrompt(
  pr: PullRequestLike,
  files: ChangedFile[],
  ctx?: PromptContext,
): string {
  const parts: string[] = [];
  parts.push(`# Pull Request #${pr.number}: ${pr.title}`);
  if (pr.body && pr.body.trim()) {
    parts.push('');
    parts.push('## Description');
    parts.push(truncate(pr.body.trim(), 2000));
  }

  if (ctx?.tree) {
    parts.push('');
    parts.push('## Repository Layout');
    parts.push('Below is the file tree of the repository (key files and directories):');
    parts.push('```');
    parts.push(ctx.tree);
    parts.push('```');
  }

  if (ctx?.docs) {
    parts.push('');
    parts.push('## Project Guidance');
    parts.push('The following project documentation files provide context and conventions:');
    parts.push(ctx.docs);
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
