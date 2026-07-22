# AI Code Review — GitHub Action

A reusable GitHub Action that performs **AI-powered code review on pull requests**.
Bring your own key (BYOK) and choose your model — OpenAI, any OpenAI-compatible
endpoint (OpenRouter, Together, Ollama, vLLM, LM Studio…), or Anthropic.

It runs on demand: add the **`ai-review`** label to a PR, or comment **`/ai-review`**.
It reads the PR diff via the GitHub API, asks the model to review it, and posts the
result back as a **PR review with inline line comments** plus a summary — never blocking.

> This repository **is** the action. Other projects consume it with `uses:`.

---

## Quick start (consumer project)

1. Add the workflow below to your repo at `.github/workflows/ai-code-review.yml`
   (also available in [`examples/workflow.yml`](./examples/workflow.yml)).
2. Replace `your-org/ai-code-review` with the real reference and pin it (e.g. `@v1`).
3. Edit config (`api-type`, `model`, `base-url`) directly in the workflow file.
4. Add **one** repository secret for the API key (everything else is plain config, not a secret):

   | Secret | Required | Example |
   | --- | --- | --- |
   | `AI_CODE_REVIEW_LLM_API_KEY` | yes | your provider API key |

```yaml
name: ai-code-review
on:
  pull_request:
    types: [opened, reopened, synchronize, labeled]
  issue_comment:
    types: [created]

concurrency:
  group: ai-review-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: false

jobs:
  review:
    if: |
      (github.event_name == 'pull_request' &&
        (github.event.action != 'labeled' || github.event.label.name == 'ai-review'))
      || (github.event_name == 'issue_comment' &&
        startsWith(github.event.comment.body, '/ai-review') &&
        github.event.issue.pull_request != null)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: nethbotheju/ai-code-review@v1
        with:
          api-type: openai            # openai | openai-compatible | anthropic
          model: gpt-4o               # your model
          # base-url: 'http://opencode.ai/zen/go/v1'   # set ONLY for openai-compatible
          api-key: ${{ secrets.AI_CODE_REVIEW_LLM_API_KEY }}
          # auto-review: 'true'           # review on open/reopen/push automatically
          # extra-instructions: '...'
```

Then add the **`ai-review`** label to a PR, or comment **`/ai-review`**.

> **Forked PRs:** by default the workflow token is read-only on PRs from forks.
> To review those, switch the `pull_request` trigger to `pull_request_target`.

---

## How it works (no cloning required)

- **GitHub access is automatic.** The runner injects `GITHUB_TOKEN`; the action uses
  it to read the PR and post the review. The only required permission is
  `pull-requests: write` (and `contents: read`).
- The action resolves the PR from the event (label, slash command, or open/push when
  `auto-review` is on), fetches the changed files and their diffs through the REST API,
  and **never clones the repo**.
- The diff is annotated with new-file line numbers so the model can cite accurate lines.
- Output is posted as a single PR review: inline comments on the relevant lines plus a
  summary table (critical / warning / suggestion / nit).

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-type` | yes | — | `openai` \| `openai-compatible` \| `anthropic` |
| `api-key` | yes | — | LLM API key (store in a secret) |
| `base-url` | only `openai-compatible` | provider default | API base URL override |
| `model` | yes | — | Model identifier |
| `github-token` | no | `${{ github.token }}` | Token for reading the PR and posting the review |
| `trigger-comment` | no | `/ai-review` | Slash command that triggers a review |
| `trigger-label` | no | `ai-review` | Label that triggers a review |
| `auto-review` | no | `false` | Also review on PR open/reopen/push |
| `max-files` | no | `20` | Max changed files reviewed per run |
| `max-diff-lines` | no | `3000` | Max total added lines reviewed per run |
| `exclude-patterns` | no | — | Extra glob excludes (comma/newline separated) |
| `use-default-excludes` | no | `true` | Apply built-in excludes (lockfiles, minified, dist/build, etc.) |
| `extra-instructions` | no | — | Extra guidance appended to the prompt |

## Outputs

| Output | Description |
| --- | --- |
| `summary` | Plain-text review summary from the model |

## Review format

- **Inline comments** on specific lines: severity badge, the issue, and a brief
  *How to fix* note (guidance, not a full code rewrite).
- **Summary review body**: counts by severity, an overview, and any general findings
  that could not be mapped to a specific diff line.
- The review is always **non-blocking** (`COMMENT` event).

## Development

```bash
npm install
npm run typecheck   # type-check
npm run bundle      # bundle to dist/index.js (committed)
```

`dist/` is committed because GitHub Actions run it directly. The CI workflow verifies
that `dist/` is up to date on every PR.

### Releasing

Tag a release and keep a moving major tag (`v1`) pointing at the latest commit on
that major, so consumers can pin `@v1` while receiving patch updates.

## License

MIT
