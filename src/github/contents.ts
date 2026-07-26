import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

type OctokitLike = ReturnType<typeof getOctokit>;

export interface TarballResult {
  buffer: Buffer;
  contentLengthMb: number | null;
}

/**
 * Download a repo tarball at a ref via the octokit client (GHE-aware).
 * Returns the raw bytes plus the Content-Length in MB (for size guards).
 */
export async function downloadTarball(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  ref: string,
): Promise<TarballResult> {
  const { data, headers } = await octokit.rest.repos.downloadTarballArchive({ owner, repo, ref });

  let buffer: Buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (typeof data === 'string') {
    buffer = Buffer.from(data, 'binary');
  } else {
    // Stream fallback (should not occur in the Actions Node runtime)
    buffer = await streamToBuffer(data as NodeJS.ReadableStream);
  }

  const clHeader = (headers as Record<string, string | undefined>)['content-length'];
  const contentLengthMb = clHeader ? Number(clHeader) / (1024 * 1024) : null;

  return { buffer, contentLengthMb };
}

/**
 * Fetch one or more text files (e.g. project docs) from the repo at a ref.
 * Uses the Contents API with the raw media type (GHE-aware). Missing files are skipped.
 */
export async function fetchFileContents(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  ref: string,
  paths: string[],
  opts: { maxBytes: number; maxFiles: number },
): Promise<string> {
  if (!paths.length) return '';

  const parts: string[] = [];
  let count = 0;

  for (const rawPath of paths.slice(0, opts.maxFiles)) {
    const name = rawPath.trim();
    if (!name) continue;
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: name,
        ref,
        mediaType: { format: 'raw' },
      });

      const text = typeof data === 'string' ? data : String(data);
      const body = text.length > opts.maxBytes ? `${text.slice(0, opts.maxBytes)}…` : text;
      parts.push(`## ${name}\n\n${body}`);
      count++;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 404) {
        core.debug(`Failed to fetch ${name}: ${(err as Error).message}`);
      }
    }
  }

  return count === 0 ? '' : parts.join('\n\n');
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
