# Contributing to SpecTrace

## Code contributions are paused until `v1.0.0`

SpecTrace is the deliverable for a capstone whose evaluation is still running,
and the research design requires a controlled development record — every change
attributable to a named author under a documented methodology. Merging outside
patches during that window would compromise it. **Pull requests will be closed
unlabeled, not because the work isn't good.**

This is a scheduling constraint, not a licensing one. SpecTrace is
[Apache-2.0](LICENSE): fork it, modify it, ship it commercially, today. You just
can't land changes in *this* repository yet.

The window closes at `v1.0.0`, at which point this file gets rewritten and the
paragraph above goes away.

## What is welcome right now

- **Bug reports.** Especially anything that produces a wrong trace link, a
  non-reproducible index, or a `\` in a stored artifact (see rule 4 below).
- **Questions about the specs.** `specs/` is authoritative and public. If a
  requirement is ambiguous, that's a defect in the requirement.
- **Reproduction attempts.** If a documented figure doesn't reproduce on your
  machine, that's the most valuable issue you can file.
- **Security reports** — see [SECURITY.md](SECURITY.md). Please don't file
  those as public issues.

Use the [issue templates](.github/ISSUE_TEMPLATE); they exist to save you from
a round-trip asking for your Node version.

## Conventions (for after the window opens, and for forks)

These are enforced by CI and by `CLAUDE.md`, and they're the parts of this
codebase most likely to surprise you:

1. **Every change maps to a requirement ID.** `specs/` is the source of truth.
   Commit messages and PR titles reference their REQ ID; branches are named
   `req/CORE-020-lexical-retrieval`. A change with no REQ ID needs a spec change
   proposed first.
2. **Requirement bodies live one-per-file** in `specs/requirements/`. The tables
   inside `<!-- spectrace:begin -->` markers in the narrative `*-spec.md`
   documents are **generated** — edit the requirement file and run
   `pnpm spec:index`. `pnpm spec:index:check` is the CI guard.
3. **`packages/core` is the engine and stays clean**: no `console.log`, no
   environment reads, no `process.exit`. Configuration is passed in; progress
   goes through injected callbacks. This is what lets both the CLI and Studio
   consume it, and what keeps the engine vendor-free.
4. **POSIX paths everywhere inside artifacts.** Path separators in
   `.spectrace/index.json`, snapshots, and symbol IDs are forward slashes,
   converted at the filesystem boundary only. A `\` reaching an artifact is a
   bug on Windows *and* a bug in review.
5. **Everything crossing the core API boundary must survive `structuredClone`**
   — Electron IPC carries it.
6. **Line endings are LF**, pinned by `.gitattributes`. Byte-identical index
   rebuilds and the CLI JSON parity snapshots depend on it. Don't override it
   locally to "fix" a diff.
7. **`packages/cli/test/snapshots/` are cross-package contracts** with Studio.
   A change there is a deliberate, called-out decision, never a `-u` reflex.
8. **Definition of done**: implementation, plus vitest tests covering each
   acceptance criterion, plus the requirement's status flipped, plus a line in
   [`docs/ai-assistance.md`](docs/ai-assistance.md) if AI assistance was used.

## Development

```bash
pnpm install
pnpm build      # required before typecheck — @spectrace/cli resolves core through dist/
pnpm typecheck
pnpm test
pnpm spec:index:check
```

`pnpm cli <args>` runs the CLI from source. `pnpm --filter @spectrace/studio dev`
runs Studio; the README's [workstation setup](README.md#setting-up-a-new-workstation)
section covers the Electron binary quirk that bites on a fresh clone.

## AI assistance

This project is built with AI assistance as a **stated methodology**, logged
task by task in [`docs/ai-assistance.md`](docs/ai-assistance.md) with the extent
of the assistance (scaffold, draft, review, pair-design). Negative results are
logged alongside the wins.

If you use AI assistance on a contribution, log it the same way. Undisclosed
assistance is the only thing here treated as a process violation — not the
assistance itself.

One hard wall applies regardless: **ground-truth evaluation labels stay out of
any AI-assisted session** that touches retrieval or ranking code. That's
experimental blinding, not policy, and it's why the labels are withheld from the
repository until the write-up publishes.

## Code of Conduct

Participation is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md).
