import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { safeResolve } from './repo-snapshot';
import { isExcluded, resolveExcludes } from '../shared/util';
import type { ActionInputs, Budget } from '../config/types';

const SECRETS_DENYLIST = [
  '**/.env*',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
  '**/credentials*',
  '**/.ssh/**',
  '**/*.secret*',
  '**/*password*',
  '**/*token*',
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.o', '.so', '.dylib', '.exe', '.dll',
  '.pyc', '.class', '.db', '.sqlite',
]);

const BYTE_READ_CAP = 50000;
const SEARCH_RESULT_CAP = 30;

export function createReadFileTool(repoRoot: string, budget: Budget, inputs: ActionInputs) {
  const excludes = resolveExcludes(inputs);
  return tool({
    description:
      'Read the contents of a file in the repository. Provide a path relative to the repo root. Optionally specify line ranges (1-indexed) to limit the read. Use this to inspect the full implementation of functions, classes, or modules referenced in the diff.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file, relative to the repo root (e.g. src/utils/auth.ts)'),
      startLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('First line to read (1-indexed). Omit to start from the beginning.'),
      endLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Last line to read (inclusive). Omit to read to end of file (capped).'),
    }),
    execute: async ({ path: filePath, startLine, endLine }) => {
      if (budget.exhausted) {
        return '[Context budget exhausted — please finalize your review.]';
      }

      const resolved = safeResolve(repoRoot, filePath);
      if (!resolved) {
        return `[ERROR: Invalid path "${filePath}" — path traversal is not allowed.]`;
      }

      if (isExcluded(filePath, [...SECRETS_DENYLIST, ...excludes])) {
        return `[SKIPPED: "${filePath}" is excluded from inspection.]`;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(resolved);
      } catch {
        return `[ERROR: File "${filePath}" does not exist.]`;
      }
      if (!stat.isFile()) {
        return `[ERROR: "${filePath}" is not a file.]`;
      }
      if (looksBinary(filePath, resolved)) {
        return `[SKIPPED: "${filePath}" appears to be a binary file.]`;
      }

      let content: string;
      try {
        content = fs.readFileSync(resolved, 'utf-8');
      } catch {
        return `[ERROR: Could not read "${filePath}".]`;
      }

      const lines = content.split('\n');
      const totalLines = lines.length;
      const fromLine = startLine ?? 1;
      const toLine = endLine ?? totalLines;

      if (fromLine > totalLines) {
        return `[WARNING: Start line ${fromLine} exceeds file length (${totalLines} lines).]`;
      }

      const selectedLines = lines.slice(fromLine - 1, toLine);
      const selectedText = selectedLines.join('\n');

      if (selectedText.length > BYTE_READ_CAP) {
        const approxLines = Math.floor((BYTE_READ_CAP / selectedText.length) * selectedLines.length);
        const truncated = selectedLines.slice(0, Math.max(1, approxLines)).join('\n');
        updateBudget(budget, truncated);
        budget.filesRead.add(filePath);
        return `${truncated}\n\n[File truncated at ~${BYTE_READ_CAP} bytes. Use line ranges to read specific sections.]`;
      }

      updateBudget(budget, selectedText);
      budget.filesRead.add(filePath);

      const formatted = selectedLines.map((line, i) => `${fromLine + i}:${line}`).join('\n');
      return `\`\`\`\n${formatted}\n\`\`\``;
    },
  });
}

export function createSearchFilesTool(repoRoot: string, budget: Budget, inputs: ActionInputs) {
  const excludes = resolveExcludes(inputs);
  return tool({
    description:
      'Search the repository for files or code matching a pattern. Returns matching file paths with line snippets. Use this to find related code, existing implementations, or to verify whether something already exists before making a recommendation.',
    inputSchema: z.object({
      pattern: z
        .string()
        .describe('A regular expression pattern to search for (case-insensitive). Example: "validateToken" or "rate.?limit"'),
      glob: z
        .string()
        .optional()
        .describe('Optional glob to restrict which files to search (e.g. "src/**/*.ts").'),
      maxResults: z
        .number()
        .int()
        .positive()
        .max(30)
        .optional()
        .describe('Maximum number of results to return (default 30, max 30).'),
    }),
    execute: async ({ pattern, glob, maxResults }) => {
      if (budget.exhausted) {
        return '[Context budget exhausted — please finalize your review.]';
      }

      const limit = Math.min(maxResults ?? SEARCH_RESULT_CAP, SEARCH_RESULT_CAP);
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch (err) {
        return `[ERROR: Invalid regex "${pattern}": ${(err as Error).message}]`;
      }

      const results: Array<{ file: string; line: number; snippet: string }> = [];
      const denyAndExcludes = [...SECRETS_DENYLIST, ...excludes];

      try {
        searchInDir(repoRoot, repoRoot, regex, glob, denyAndExcludes, results, limit);
      } catch (err) {
        return `[ERROR during search: ${(err as Error).message}]`;
      }

      if (results.length === 0) {
        return `No matches found for pattern "${pattern}".`;
      }

      const output = results.map((r) => `${r.file}:${r.line}: ${r.snippet}`).join('\n');
      updateBudget(budget, output);
      return `Found ${results.length} match(es) for "${pattern}":\n\`\`\`\n${output}\n\`\`\``;
    },
  });
}

function searchInDir(
  root: string,
  dir: string,
  regex: RegExp,
  glob: string | undefined,
  excludes: string[],
  results: Array<{ file: string; line: number; snippet: string }>,
  limit: number,
): void {
  if (results.length >= limit) return;

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    if (results.length >= limit) break;

    const fullPath = path.join(dir, name);
    const relPath = path.relative(root, fullPath);

    if (isExcluded(relPath, excludes)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      searchInDir(root, fullPath, regex, glob, excludes, results, limit);
    } else if (stat.isFile()) {
      if (looksBinary(relPath, fullPath)) continue;
      if (glob && !matchGlob(relPath, glob)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && results.length < limit; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            regex.lastIndex = 0;
            results.push({ file: relPath, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
          }
        }
      } catch {
        /* skip unreadable files */
      }
    }
  }
}

// Inline glob matching (delegates to the shared minimatch-based isExcluded)
function matchGlob(file: string, pattern: string): boolean {
  return isExcluded(file, [pattern]);
}

function looksBinary(relPath: string, fullPath: string): boolean {
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const fd = fs.openSync(fullPath, 'r');
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
  } catch {
    return true;
  }
  return false;
}

function updateBudget(budget: Budget, text: string): void {
  budget.bytesUsed += Buffer.byteLength(text, 'utf-8');
  if (budget.bytesUsed >= budget.maxBytes) {
    budget.exhausted = true;
  }
}
