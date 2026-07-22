import { ActionInputs, ChangedFile } from './types';
import { truncate } from './util';

interface PullRequestLike {
  number: number;
  title: string;
  body: string | null;
}

export function buildSystemPrompt(inputs: ActionInputs): string {
  const base = `You are a meticulous senior software engineer reviewing a GitHub pull request.
Your job is to find real problems and help the author improve the code.

Severity levels:
- "critical": bugs, security issues, data loss, or anything that will break production.
- "warning": likely bugs, fragile logic, missing error handling, or important maintainability issues.
- "suggestion": meaningful improvements to clarity, performance, or design.
- "nit": minor style or readability points (use sparingly).

Respond with ONLY a single JSON object (no markdown fences, no prose) using exactly this schema:

{
  "summary": "2-4 sentences: overall assessment of the change.",
  "findings": [
    {
      "file": "<exact path as shown in the diff>",
      "line": <new-file line number shown in the diff>,
      "severity": "critical" | "warning" | "suggestion" | "nit",
      "comment": "what is wrong and why it matters",
      "suggestion": "a BRIEF description of how to fix it (do NOT write full code)"
    }
  ]
}

Rules:
- "line" MUST be a line number that appears in the provided diff for that file.
- Focus on real, actionable issues. Do not invent problems or restate the obvious.
- "suggestion" must be short guidance, never a full code rewrite.
- Only include a finding if it genuinely helps. If the code is good, return an empty "findings" array and say so in "summary".
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
  parts.push(
    `## Changed files (${files.length})\nReview the diffs below. The number in front of each line is its NEW-file line number. Reference those numbers in your findings.`
  );
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
