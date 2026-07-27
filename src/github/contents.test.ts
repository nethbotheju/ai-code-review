import { describe, it, expect, vi, type Mock } from 'vitest';
import { fetchFileContents } from './contents';
import type { OctokitLike } from './types';

function makeOctokit(respond: (path: string) => Promise<string> | string) {
  return {
    request: vi.fn().mockImplementation(async (route: string, opts: { path: string }) => {
      if (!route.includes('/contents/')) throw new Error(`unexpected route ${route}`);
      return { data: await respond(opts.path) };
    }),
  } as unknown as OctokitLike;
}

function asRequestMock(octokit: OctokitLike): Mock {
  return octokit.request as unknown as Mock;
}

describe('fetchFileContents', () => {
  it('returns empty string when paths is empty', async () => {
    const octokit = makeOctokit(async () => 'x');
    const out = await fetchFileContents(octokit, 'o', 'r', 'main', [], {
      maxBytes: 100,
      maxFiles: 3,
    });
    expect(out).toBe('');
    expect(asRequestMock(octokit)).not.toHaveBeenCalled();
  });

  it('fetches and concatenates each path with a header', async () => {
    const octokit = makeOctokit(async (p) => `body of ${p}`);
    const out = await fetchFileContents(octokit, 'o', 'r', 'main', ['AGENTS.md', 'README.md'], {
      maxBytes: 1000,
      maxFiles: 3,
    });
    expect(out).toContain('## AGENTS.md');
    expect(out).toContain('body of AGENTS.md');
    expect(out).toContain('## README.md');
    expect(out).toContain('body of README.md');
  });

  it('truncates each file to maxBytes', async () => {
    const octokit = makeOctokit(async () => 'a'.repeat(100));
    const out = await fetchFileContents(octokit, 'o', 'r', 'main', ['A.md'], {
      maxBytes: 10,
      maxFiles: 3,
    });
    expect(out).toContain('a'.repeat(10) + '…');
  });

  it('skips 404s and continues with the remaining paths', async () => {
    const octokit = {
      request: vi.fn().mockImplementation(async (_route: string, opts: { path: string }) => {
        if (opts.path === 'missing.md') {
          const err = new Error('Not Found') as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: `body of ${opts.path}` };
      }),
    } as never;
    const out = await fetchFileContents(octokit, 'o', 'r', 'main', ['missing.md', 'AGENTS.md'], {
      maxBytes: 1000,
      maxFiles: 3,
    });
    expect(out).not.toContain('missing.md');
    expect(out).toContain('body of AGENTS.md');
  });

  it('returns empty string when every path 404s', async () => {
    const octokit = {
      request: vi.fn().mockImplementation(async () => {
        const err = new Error('Not Found') as Error & { status: number };
        err.status = 404;
        throw err;
      }),
    } as never;
    const out = await fetchFileContents(octokit, 'o', 'r', 'main', ['a.md', 'b.md'], {
      maxBytes: 1000,
      maxFiles: 3,
    });
    expect(out).toBe('');
  });

  it('caps the number of files fetched at maxFiles', async () => {
    const octokit = makeOctokit(async (p) => `body of ${p}`);
    await fetchFileContents(octokit, 'o', 'r', 'main', ['a.md', 'b.md', 'c.md', 'd.md'], {
      maxBytes: 1000,
      maxFiles: 2,
    });
    expect(asRequestMock(octokit)).toHaveBeenCalledTimes(2);
  });
});
