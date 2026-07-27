import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { x as tarExtract } from 'tar';
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { downloadTarball } from '../../github/contents';
import { isExcluded, isWithin, resolveExcludes } from '../../shared/util';
import type { ActionInputs, RepoRoot } from '../../config/types';

const MAX_TREE_ENTRIES = 200;

/** Error thrown when the repo tarball exceeds the configured max size. */
export class RepoTooLargeError extends Error {
  constructor(sizeMb: number, maxMb: number) {
    super(`Repo tarball is ${sizeMb}MB, exceeding the ${maxMb}MB limit. Agent mode degraded to standard.`);
    this.name = 'RepoTooLargeError';
  }
}

type OctokitLike = ReturnType<typeof getOctokit>;

/**
 * Download and extract a tarball of the repo at a ref (via octokit, so GHE-aware).
 * Returns a RepoRoot pointing to the extracted directory.
 */
export async function prepareRepoSnapshot(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  ref: string,
  maxMb: number,
): Promise<RepoRoot> {
  core.info(`Downloading repo snapshot at ${ref}...`);

  const { buffer, contentLengthMb } = await downloadTarball(octokit, owner, repo, ref);

  if (contentLengthMb != null && contentLengthMb > maxMb) {
    throw new RepoTooLargeError(Math.round(contentLengthMb * 10) / 10, maxMb);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-'));
  try {
    const tarballPath = path.join(workDir, 'repo.tar.gz');
    fs.writeFileSync(tarballPath, buffer);

    const extractDir = path.join(workDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    await tarExtract({ file: tarballPath, C: extractDir });

    // GitHub tarballs extract to a single top-level directory like "owner-repo-sha/".
    const entries = fs.readdirSync(extractDir).filter((e) => !e.startsWith('.'));
    const topDir = entries.length === 1 ? path.join(extractDir, entries[0]) : extractDir;

    core.info(`Repo snapshot extracted to ${topDir}`);
    return { path: topDir, workDir };
  } catch (err) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** Remove the repo snapshot temp directory. */
export function cleanupRepoSnapshot(root: RepoRoot): void {
  try {
    fs.rmSync(root.workDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/** Build a compact file-tree representation of the repo for the prompt. */
export function buildRepoTree(
  root: string,
  inputs: Pick<ActionInputs, 'useDefaultExcludes' | 'excludePatterns'>,
  maxEntries: number = MAX_TREE_ENTRIES,
): string {
  const excludes = resolveExcludes(inputs);
  const entries: string[] = [];
  let count = 0;

  function walk(dir: string, prefix: string): void {
    if (count >= maxEntries) return;
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }

    names.sort();
    for (const name of names) {
      if (count >= maxEntries) break;

      const fullPath = path.join(dir, name);
      const relPath = prefix ? `${prefix}/${name}` : name;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      // Check excludes; test trailing slash for directories so `**/node_modules/**` matches the dir itself.
      if (isExcluded(relPath, excludes)) continue;

      if (stat.isDirectory()) {
        entries.push(`  ${relPath}/`);
        count++;
        walk(fullPath, relPath);
      } else {
        entries.push(`  ${relPath}`);
        count++;
      }
    }
  }

  entries.push('  .');
  walk(root, '');

  if (count >= maxEntries) {
    entries.push(`  … (truncated at ${maxEntries} entries)`);
  }

  return entries.join('\n');
}

/**
 * Safely resolve a relative path against the repo root.
 * Returns null for absolute paths, traversal escapes, or symlink escapes.
 */
export function safeResolve(root: string, rel: string): string | null {
  const normalized = path.normalize(rel).replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return null;

  const resolved = path.resolve(root, normalized);
  if (!isWithin(resolved, root)) return null;

  // Resolve symlinks and confirm the real path stays within the real root.
  try {
    const realRoot = fs.realpathSync(root);
    const realResolved = fs.realpathSync(resolved);
    if (!isWithin(realResolved, realRoot)) return null;
  } catch {
    // Non-existent or broken path — still allow (caller handles missing files).
  }
  return resolved;
}
