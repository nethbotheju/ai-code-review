import type { getOctokit } from '@actions/github';

export type OctokitLike = ReturnType<typeof getOctokit>;
