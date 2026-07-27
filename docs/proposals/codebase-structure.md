# Proposal: Reorganize `src/` around the two review modes

Status: **proposal — not implemented**
Date: 2025-07-27
Scope: `src/` directory layout only. No behavior changes. No dependency changes.

## TL;DR

Treat `standard` and `agent` as first-class **modes** with their own directories. Move everything that is mode-specific under `modes/<mode>/`. Keep truly shared concerns (config, github, types, prompt, parse, format) at the top level. Rename `agent/pi/` → `modes/agent/engine/` to make clear that "pi" is one engine implementation, not the abstract concept of agent mode.

## Why — the current pain points

The current layout is by **technical concern** (github, llm, review, agent), not by **feature**. This causes three concrete problems:

1. **No clean mode boundary.** A reader trying to understand "what is standard mode?" has to mentally aggregate `llm/models.ts` + `review/run.ts` + `review/prompt.ts` (the `isAgent` branch). Same for agent mode across `agent/repo-snapshot.ts` + `agent/pi/*`.
2. **`review/` is overloaded.** It contains both shared stuff (prompt/parse/format, used by both modes) and standard-mode-only stuff (`run.ts`). A new contributor cannot tell at a glance which files belong to which mode.
3. **`agent/pi/` is a code smell.** "pi" is one specific subprocess engine. The directory name leaks the implementation into the abstraction. A future engine swap (aider, claude-code, custom) would need a sibling `agent/<other>/` which would be inconsistent with `agent/pi/` sitting next to `agent/repo-snapshot.ts` at the same level.

## Proposed layout

```
src/
  index.ts                        # entry: inputs → trigger → mode dispatch → post

  config/
    inputs.ts                     # (unchanged) parse action inputs
    types.ts                      # (unchanged) ActionInputs, ApiType, ReviewMode, RepoRoot

  github/
    trigger.ts                    # (unchanged) event/trigger resolution
    pull-request.ts               # (unchanged) fetch PR + files + annotate patch
    posting.ts                    # (unchanged) post review + react to comment
    contents.ts                   # (unchanged) fetch files + tarball

  shared/
    types.ts                      # (unchanged) AnnotatedLine, ChangedFile, ReviewResult, …
    util.ts                       # (unchanged) truncate, isWithin, isExcluded, resolveExcludes
    prompt.ts                     # ← moved from review/prompt.ts (used by BOTH modes)
    parse.ts                      # ← moved from review/parse.ts  (mode-agnostic)
    format.ts                     # ← moved from review/format.ts (mode-agnostic)

  modes/
    standard/
      index.ts                    # public surface: runStandardReview
      runner.ts                   # ← from review/run.ts
      models.ts                   # ← from llm/models.ts
    agent/
      index.ts                    # public surface: runAgentReview (orchestrates snapshot + engine)
      runner.ts                   # ← from agent/pi/index.ts (renamed, no logic change)
      snapshot.ts                 # ← from agent/repo-snapshot.ts
      engine/                     # ← from agent/pi/*  (the pi subprocess implementation)
        index.ts                  #   (deleted — its re-exports collapse into runner.ts)
        constants.ts
        types.ts
        provider.ts
        install.ts
        args.ts
        spawn.ts
        output.ts
```

## Migration mapping (old → new)

| Old path | New path | Notes |
|---|---|---|
| `src/index.ts` | `src/index.ts` | Only the mode-dispatch block changes; see below |
| `src/config/inputs.ts` | `src/config/inputs.ts` | unchanged |
| `src/config/types.ts` | `src/config/types.ts` | unchanged |
| `src/github/*.ts` | `src/github/*.ts` | unchanged |
| `src/shared/types.ts` | `src/shared/types.ts` | unchanged |
| `src/shared/util.ts` | `src/shared/util.ts` | unchanged |
| `src/llm/models.ts` | `src/modes/standard/models.ts` | used only by standard mode |
| `src/review/run.ts` | `src/modes/standard/runner.ts` | used only by standard mode |
| `src/review/prompt.ts` | `src/shared/prompt.ts` | already mode-aware via `isAgent` flag; shared by both |
| `src/review/parse.ts` | `src/shared/parse.ts` | mode-agnostic |
| `src/review/format.ts` | `src/shared/format.ts` | mode-agnostic |
| `src/agent/repo-snapshot.ts` | `src/modes/agent/snapshot.ts` | only used by agent mode |
| `src/agent/pi/index.ts` | `src/modes/agent/runner.ts` | the orchestrator; absorbs the public re-exports |
| `src/agent/pi/constants.ts` | `src/modes/agent/engine/constants.ts` | |
| `src/agent/pi/types.ts` | `src/modes/agent/engine/types.ts` | |
| `src/agent/pi/provider.ts` | `src/modes/agent/engine/provider.ts` | |
| `src/agent/pi/install.ts` | `src/modes/agent/engine/install.ts` | |
| `src/agent/pi/args.ts` | `src/modes/agent/engine/args.ts` | |
| `src/agent/pi/spawn.ts` | `src/modes/agent/engine/spawn.ts` | |
| `src/agent/pi/output.ts` | `src/modes/agent/engine/output.ts` | |
| `src/agent/pi/*.test.ts` | `src/modes/agent/engine/*.test.ts` | tests move with the file they test |
| `src/review/prompt.test.ts` | `src/shared/prompt.test.ts` | moves with `prompt.ts` |
| `src/agent/repo-snapshot.test.ts` | `src/modes/agent/snapshot.test.ts` | moves with `snapshot.ts` |

The `src/agent/pi/index.ts` re-exports are absorbed into `src/modes/agent/runner.ts` (or `index.ts`) — no need for a separate public-surface file now that the engine is internal to agent mode.

## Updated `index.ts` shape

The orchestrator's mode-dispatch becomes a two-line branch on a stable interface:

```ts
// src/index.ts (sketch)
import { runStandardReview } from './modes/standard';
import { runAgentReview } from './modes/agent';

// ... after gathering PR + files + context docs + (optional) snapshot ...

const reviewResult =
  useAgent && repoRoot
    ? await runAgentReview(systemPrompt, userPrompt, repoRoot, inputs)
    : await runStandardReview(inputs, systemPrompt, userPrompt);
```

Each `modes/<mode>/index.ts` exports a single function with a uniform signature, so `index.ts` does not need to know about engines, providers, models, or snapshots.

## Decisions and rationale

1. **Modes, not "strategies" or "plugins".** We're not building a runtime pluggable system — just naming the two current paths. The cost of a `modes/` directory is one level of nesting for a much clearer mental model.
2. **`modes/agent/engine/`, not `modes/agent/pi/`.** "engine" describes the role (the subprocess that runs the coding agent); "pi" is one implementation. If we later add `modes/agent/engine-claude/`, the sibling structure is honest.
3. **`llm/` is removed.** It was a single 28-line file only used by standard mode. Inlining it as `modes/standard/models.ts` is clearer than keeping a top-level directory for one file.
4. **`review/` is removed.** It conflated "the review document" with "the standard mode runner". Its shared contents move to `shared/`; its standard-only contents move to `modes/standard/`.
5. **`shared/prompt.ts` stays mode-aware (not split).** The current `buildSystemPrompt` already takes `ActionInputs` and branches on `isAgent` to add an addendum. Splitting into `shared/prompt/base.ts` + per-mode overrides would add a seam without value — both modes want the same base prompt and the addendum is one short paragraph.
6. **`RepoRoot` stays in `config/types.ts`.** It's not a mode-specific type; it's a generic "temp directory handle" returned by the snapshot step.

## What this proposal does NOT change

- No runtime behavior. The user-visible review output is byte-identical.
- No public API. The action is consumed via `action.yml`; nothing imports from `src/` externally.
- No new dependencies, no TypeScript config changes.
- No changes to `dist/`, `examples/`, `action.yml`, `README.md`, or `AGENTS.md` (the AGENTS.md project-structure diagram will need a one-paragraph update after the move — see "Follow-up" below).
- No test changes beyond moving test files with their corresponding source files.

## Alternatives considered

- **Option B — pipeline / stage layout (`pipeline/context/`, `pipeline/run/`, `pipeline/output/`).** Conceptually clean (the action *is* a pipeline), but each stage has mode-specific branches inside it, so it would scatter mode logic again. Rejected.
- **Keep `agent/` as a top-level concept, just rename `pi/` → `engine/`.** Smaller diff, but leaves `review/` and `llm/` overloaded and still doesn't put the modes at the top level. Half-measure.
- **Flat layout with mode prefixes (`standard-runner.ts`, `agent-runner.ts`).** Avoids directories but is hostile to file grouping (e.g., `agent/` would need ~9 flat files). Rejected.

## Follow-up (not part of this proposal)

- Update the "Project Structure" section of `AGENTS.md` to reflect the new tree.
- After landing, run `npm run typecheck && npm test && npm run build` to confirm zero regressions, then `npm run bundle` to refresh `dist/`.

## Open questions for review

1. **`modes/` vs `engines/` vs `backends/`** — naming preference? (`modes/` matches the existing input name `review-mode` and feels less overloaded than "engine".)
2. **`modes/agent/engine/` vs `modes/agent/runtime/` vs `modes/agent/subprocess/`** — best word for the pi subprocess layer?
3. **Should we collapse `modes/<mode>/index.ts` + `runner.ts` into a single `runner.ts`?** (saves one file per mode; minor indirection loss)
