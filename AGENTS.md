# AGENTS.md

## Project Overview

AI-powered pull request code review GitHub Action. Users bring their own LLM key (OpenAI, Anthropic, or OpenAI-compatible). The action reads PR diffs via the GitHub API, sends them to a configured LLM for review, and posts the result as a structured PR review comment.

Two review modes:
- **standard** — single-pass LLM call with the diff + PR description
- **agent** — spawns `@earendil-works/pi-coding-agent` headless with read-only tools (`read`, `grep`, `find`, `ls`) backed by a local repo snapshot

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
- No e2e tests — unit tests cover: path containment, tree building, pi arg/env/models.json generation, JSONL parsing, prompts, mock LLM interaction
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
    types.ts                 # ActionInputs, ApiType, ReviewMode, RepoRoot
  github/
    trigger.ts               # event/trigger resolution (PR label, comment, auto)
    pull-request.ts          # fetch PR + changed files + annotate patch diff
    posting.ts               # post review + react to comment (octokit)
    contents.ts              # fetch file contents + tarball (octokit, GHE-aware)
  llm/
    models.ts                # createModel factory (OpenAI, OpenAI-compatible, Anthropic)
  agent/
    repo-snapshot.ts         # tarball download + extraction + tree builder + safeResolve
    pi/                      # pi engine — spawn @earendil-works/pi-coding-agent headless
      index.ts               # runPiReview orchestrator + public re-exports
      constants.ts           # PI_PACKAGE, PI_CUSTOM_PROVIDER, PI_CUSTOM_API_KEY_ENV
      types.ts               # PiEvent / PiMessage (JSONL event shapes)
      provider.ts            # providerFor + buildModelsJson (openai-compatible → models.json)
      install.ts             # ensurePiInstalled + runNpm (cached npm install)
      args.ts                # buildPiArgs + buildPiEnv (CLI args + env, key via env)
      spawn.ts               # invokePi (subprocess + JSONL streaming + timeout)
      output.ts              # parsePiOutput + messageText (events → ReviewResult)
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
| `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` | LLM provider abstraction (generateText for standard mode) |
| `@actions/core` + `@actions/github` | GitHub Actions runtime + octokit client |
| `minimatch` | Glob matching for file exclusion |
| `tar` | Tarball extraction for repo snapshot (agent mode) |
| `vitest` | Test runner |

## Agent Mode Details

- Agent mode downloads the full repo as a tarball via octokit (`github/contents.ts`)
- Extracts to a temp dir and spawns `@earendil-works/pi-coding-agent` headless against it
- pi runs with read-only tools (`read`, `grep`, `find`, `ls`) — no shell, no write, no network exfiltration
- The API key is injected via environment variable (never argv); `openai-compatible` endpoints are configured via an ephemeral `models.json` (`agent/pi/provider.ts`)
- pi is installed on first use into `~/.cache/ai-code-review-pi/<version>` (cacheable); `pi-version` controls the version, `pi-timeout-ms` is the hard kill timeout (pi has no built-in step cap)
- pi emits a JSONL event stream (`--mode json`) which `agent/pi/output.ts` parses into a `ReviewResult`
- Tarball too large → auto-degrades to standard mode

## Build and Release

- Build: `npm run build` → outputs `dist/index.js` (single-file bundle)
- Release: tag a commit (`git tag v1.0.x`) and push. Maintain a moving major tag (`v1`).
- The action is consumed by other projects via `uses: nethbotheju/ai-code-review@v1`
- Consumers configure it in their `.github/workflows/` with their own LLM API key

## Common Gotchas

- Test files import `../config/types` and `../shared/types` separately — ActionInputs are in config, domain types in shared.
- The `buildProviderOpts` helper in `llm/models.ts` conditionally includes `baseURL` only when provided — do NOT pass it unconditionally for `openai`/`anthropic` types (SDK auto-injects the default).
- `dist/` MUST be committed — GitHub Actions runs the compiled bundle, not TypeScript source.
- The pi engine is NOT bundled — it's installed at runtime via `npm install` on the runner (`agent/pi/install.ts`). The `dist/index.js` bundle stays small (~4MB); pi's ~170MB of deps live in the install cache dir.
