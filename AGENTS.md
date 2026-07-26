# AGENTS.md

## Project Overview

AI-powered pull request code review GitHub Action. Users bring their own LLM key (OpenAI, Anthropic, or OpenAI-compatible). The action reads PR diffs via the GitHub API, sends them to a configured LLM for review, and posts the result as a structured PR review comment.

Two review modes:
- **standard** — single-pass LLM call with the diff + PR description
- **agent** — multi-step tool-enabled loop with `read_file` and `search_files` tools backed by a local repo snapshot

## Setup Commands

- Install dependencies: `npm install`
- Type-check: `npm run typecheck`
- Build (typecheck + ncc bundle): `npm run build`
- Bundle only (skip typecheck): `npm run bundle`
- Test: `npm test` (vitest)
- Watch tests: `npm run test:watch`

## Development Workflow

- All source code is in `src/`. The bundled output goes to `dist/`.
- `dist/` is committed (GitHub Actions runs the compiled bundle from `dist/index.js`).
- Use `npm run bundle` after making source changes, then commit both `src/` and updated `dist/`.
- For quick iteration, edit source files and run `npm run build` to verify everything compiles.
- The action.yml references `dist/index.js` — make sure it's up to date before tagging a release.

## Testing Instructions

- Run all tests: `npm test`
- Tests are co-located with source files (`src/**/*.test.ts`)
- No e2e tests — unit tests cover: path containment, tree building, tool execution, prompts, mock LLM interaction
- The `.github/workflows/self-test.yml` runs the action against itself on PRs (dogfooding)
- When changing prompt logic, update the corresponding `prompt.test.ts`

## Code Style

- TypeScript with strict mode (`strict: true` in tsconfig.json)
- Uses `@vercel/ncc` for bundling (CJS output)
- No ESLint config — rely on TypeScript compiler checks (`tsc --noEmit`)
- Import ordering: Node built-ins → external deps → internal modules (relative paths)
- Use `import type` for type-only imports
- Async functions use `async/await` over raw promises
- Error handling: use `core.setFailed()` for action-level failures, `core.warning()` for recoverable issues

## Project Structure

```
src/
  index.ts                   # lightweight orchestrator
  config/
    inputs.ts                # action input parsing
    types.ts                 # ActionInputs, ApiType, ReviewMode, RepoRoot, Budget
  github/
    trigger.ts               # event/trigger resolution (PR label, comment, auto)
    pull-request.ts          # fetch PR + changed files + annotate patch diff
    posting.ts               # post review + react to comment (octokit)
    contents.ts              # fetch file contents + tarball (octokit, GHE-aware)
  llm/
    models.ts                # createModel factory (OpenAI, OpenAI-compatible, Anthropic)
  agent/
    tools.ts                 # read_file + search_files tools (minimatch-based excludes)
    runner.ts                # runAgentReview — generateText with tools + step loop
    repo-snapshot.ts         # tarball download + extraction + tree builder + safeResolve
  review/
    run.ts                   # runStandardReview — single-turn generateText
    prompt.ts                # buildSystemPrompt + buildUserPrompt (both modes)
    parse.ts                 # parseReview — lenient JSON parser for LLM output
    format.ts                # formatReview + formatNoChanges — markdown review body
  shared/
    util.ts                  # truncate, isWithin, isExcluded, resolveExcludes
    types.ts                 # AnnotatedLine, ChangedFile, ReviewDocument, ReviewResult
```

## Key Dependencies

| Package | Purpose |
|---|---|
| `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` | LLM provider abstraction (generateText + tools) |
| `@actions/core` + `@actions/github` | GitHub Actions runtime + octokit client |
| `minimatch` | Glob matching for file exclusion |
| `tar` | Tarball extraction for repo snapshot (agent mode) |
| `zod` | Tool input schema validation |
| `vitest` | Test runner |

## Agent Mode Details

- Agent mode downloads the full repo as a tarball via octokit (`github/contents.ts`)
- Extracts to a temp dir and provides `read_file` + `search_files` tools
- Budget guards: `agent-max-context-bytes` (default 120KB) caps total file reads
- Per-call caps: 50KB per `read_file`, 30 results per `search_files` (hardcoded in `agent/tools.ts`)
- The step loop runs up to `agent-max-steps` (default 8) LLM calls — `isStepCount()` controls this
- If the step limit fires while the model is still calling tools (not finalizing), the action errors with a parse failure
- Tarball too large → auto-degrades to standard mode
- `openai-compatible` requires explicit `allow-agent-on-compatible: true` to use agent mode

## Build and Release

- Build: `npm run build` → outputs `dist/index.js` (single-file bundle)
- Release: tag a commit (`git tag v1.0.x`) and push. Maintain a moving major tag (`v1`).
- The action is consumed by other projects via `uses: nethbotheju/ai-code-review@v1`
- Consumers configure it in their `.github/workflows/` with their own LLM API key

## Common Gotchas

- Test files import `../config/types` and `../shared/types` separately — ActionInputs are in config, domain types in shared.
- The `buildProviderOpts` helper in `llm/models.ts` conditionally includes `baseURL` only when provided — do NOT pass it unconditionally for `openai`/`anthropic` types (SDK auto-injects the default).
- `dist/` MUST be committed — GitHub Actions runs the compiled bundle, not TypeScript source.
- When testing the agent loop with `MockLanguageModelV4`, the SDK does NOT auto-execute tools from mock responses — tool execution integration is tested separately in `agent/tools.test.ts`.
