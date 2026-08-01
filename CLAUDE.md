# SpecTrace — Claude Code Instructions

Requirements traceability for Markdown specs ↔ TypeScript code.
**`specs/` is authoritative.** Every task maps to a requirement ID
(REQ-CORE-xxx / REQ-CLI-xxx in specs/spectrace-cli-spec.md;
REQ-APP-xxx in specs/spectrace-product-spec.md). If a task has no
REQ ID, ask for one or propose a spec change first.

## Commands
- `pnpm install` · `pnpm build` · `pnpm test` · `pnpm typecheck`
- `pnpm cli <args>` runs the CLI from source (e.g. `pnpm cli --help`)

## Hard rules
1. **NEVER read, open, or reference anything under `fixtures/ground-truth/`.**
   This is an experimental-blinding wall (build plan §0.2), not housekeeping.
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
- `packages/prelim` — @spectrace/prelim: Phase A feasibility harness
  (specs/spectrace-prelim-spec.md). Experiment tooling, not product code —
  rules 2–5 do not bind it, and core/cli must never import from it. It
  consumes @spectrace/core for indexing/retrieval (REQ-CORE-010/011/020
  live in core), so the experiment measures the product engine.
- `apps/studio` — Electron app (added later; consumes core, never bypasses it).
- `specs/` — the spec vault (also the dogfood target).
- `fixtures/` — evaluation repositories. ground-truth/ is off-limits (rule 1).
  todo-example/ is harness example data (its ground-truth.json is also
  off-limits); experiment/ holds the frozen feasibility-experiment inputs.
