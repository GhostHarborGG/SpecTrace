<!--
Outside pull requests are paused until v1.0.0 — see CONTRIBUTING.md. The
license is Apache-2.0 either way; fork freely. This template is the
maintainer's definition-of-done checklist (CLAUDE.md rules 6 and 7).
-->

## REQ ID

<!-- e.g. REQ-CORE-020. Required. No REQ ID means a spec change gets proposed
     first — see CONTRIBUTING.md. Repo-polish changes with no requirement say
     so explicitly and why. -->

## What changed

<!-- What the reader needs to review the diff, not a restatement of it.
     Design decisions and the reasoning behind them belong here. -->

## Acceptance criteria

<!-- One row per AC in the requirement. Every AC gets a test; if one can't be
     tested yet, say which and why rather than dropping the row. -->

| AC | Covered by | Notes |
|---|---|---|
| AC1 | | |

## Definition of done

- [ ] Implementation complete
- [ ] vitest tests covering **each** acceptance criterion
- [ ] Requirement `status` flipped in `specs/requirements/` (and `pnpm spec:index` run if frontmatter changed)
- [ ] Line added to `docs/ai-assistance.md` if AI assistance was used, with its extent
- [ ] `pnpm build && pnpm typecheck && pnpm test && pnpm spec:index:check` all green

## Boundaries touched

<!-- Tick only what applies; each of these is a rule that CI won't always
     catch, so call it out deliberately. -->

- [ ] `packages/cli/test/snapshots/` changed — **cross-package contract with Studio**, explicitly authorized by:
- [ ] New value crosses a `packages/core` public API — confirmed `structuredClone`-safe
- [ ] Paths written into an artifact or symbol ID — confirmed POSIX-normalized, no `\`
- [ ] `packages/core` touched — still no `console.log`, no env reads, no `process.exit`
- [ ] Changes what leaves the machine — bounded-payload accounting (REQ-CORE-023) re-checked
- [ ] Evaluation run involved — aggregate metrics only; ground-truth labels not read
