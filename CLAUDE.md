# SpecTrace — Claude Code Instructions

Requirements traceability for Markdown specs ↔ TypeScript code.
**`specs/` is authoritative.** Every task maps to a requirement ID.
Requirement bodies live one-per-file in `specs/requirements/`
(REQ-CORE-xxx, REQ-CLI-xxx, REQ-APP-xxx); the narrative documents that
index them are specs/spectrace-core-spec.md (the engine),
specs/spectrace-cli-spec.md (the command surface), and
specs/spectrace-product-spec.md (Studio). If a task has no REQ ID,
ask for one or propose a spec change first.

## Commands
- `pnpm install` · `pnpm build` · `pnpm test` · `pnpm typecheck`
- `pnpm cli <args>` runs the CLI from source (e.g. `pnpm cli --help`)
- `pnpm --filter @spectrace/studio dev` runs Studio (Electron).
  If it fails with `Error: Electron uninstall`, the runtime binary is
  missing — pnpm records the postinstall as done, so neither `install`
  nor `rebuild` will retry it. Force it:
  `cd node_modules/.pnpm/electron@*/node_modules/electron && node install.js`
- `pnpm spec:index` regenerates the requirement tables in the narrative
  `*-spec.md` documents from `specs/requirements/` frontmatter;
  `pnpm spec:index:check` is the CI guard. Never hand-edit a table between
  `<!-- spectrace:begin -->` markers — edit the requirement file.

## Hard rules
1. **NEVER read or open anything under `fixtures/ground-truth/`.**
   Passing a ground-truth file path as a CLI argument (e.g. to
   `spectrace evaluate`) is allowed; consuming label contents is not —
   neither directly nor via per-requirement/per-link evaluation output.
   Only aggregate metrics (overall and per-stratum Recall/Hit/MRR) may
   be read back. Amended 2026-08-02 by BP; this is an
   experimental-blinding wall (build plan §0.2), not housekeeping.
2. `packages/core` has no `console.log`, reads no environment variables,
   and calls `process.exit` nowhere. Config is passed in explicitly.
   Progress goes through injected callbacks.
3. Every value returned from `packages/core` public APIs must survive
   `structuredClone` (Electron IPC constraint).
4. All file paths inside stored artifacts and symbol IDs are
   POSIX-normalized (forward slashes). Convert at the filesystem
   boundary only. Never let `\\` into `.spectrace/index.json`,
   snapshots, or symbol identifiers.
5. Files under `packages/cli/test/snapshots/` are cross-package
   contracts (Studio parity). Update only when explicitly instructed.
6. Every commit message and PR references its REQ ID.
   Branch naming: `req/CORE-020-lexical-retrieval`.
7. Definition of done: implementation + vitest tests covering each
   acceptance criterion + spec status flip + line in docs/ai-assistance.md.
8. Line endings are LF everywhere (.gitattributes enforces; don't fight it).

## Layout
- `packages/core` — @spectrace/core: the engine (schema, index, retrieval,
  ranking, links, drift). Owns all contracts.
- `packages/cli` — @spectrace/cli: thin command surface over core.
- `packages/providers` — @spectrace/providers: the OpenAI adapters (embedding,
  ranking) satisfying core's provider interfaces. CLI and Studio both depend on
  it; core never does, so the engine stays vendor-free.
- `apps/studio` — Electron app (added later; consumes core, never bypasses it).
- `specs/` — the spec vault (also the dogfood target). `specs/requirements/`
  holds one file per requirement; the `*-spec.md` documents are narrative.
- `fixtures/` — evaluation repositories. ground-truth/ is off-limits (rule 1).
  todo-example/ is harness example data (its ground-truth.json is also
  off-limits); experiment/ holds the frozen feasibility-experiment inputs.
