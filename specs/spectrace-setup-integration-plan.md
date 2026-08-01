# SpecTrace — Integration & Setup Plan

**Companion to:** `spectrace-product-spec.md` (SPEC-APP-000)
**Goal:** stand up the monorepo, extract `@spectrace/core` as the single engine, and get an Electron walking skeleton talking to it — proof-of-concept grade, ordered so every phase ends with something runnable.

---

## Phase 0 — Environment (half a day)

**Install / verify:**

```bash
node --version        # >= 20 LTS
corepack enable       # ships with Node; activates pnpm
pnpm --version        # >= 9
git --version
```

**Secrets (never in the repo):**
- Anthropic API key → environment variable `ANTHROPIC_API_KEY` for CLI/dev; Studio later moves it to OS keychain.
- GitHub fine-grained PAT, **read-only Contents** on the target repo → `GITHUB_TOKEN` for dev.

**Exit criteria:** `pnpm -v` works; both tokens exercised once with a curl/octokit smoke call.

---

## Phase 1 — Monorepo scaffold (half a day)

```
spectrace/
├─ pnpm-workspace.yaml
├─ package.json                 # private root: scripts, shared devDeps
├─ tsconfig.base.json           # strict, shared compiler options
├─ packages/
│  ├─ core/                     # @spectrace/core — THE engine
│  └─ cli/                      # @spectrace/cli — capstone deliverable
├─ apps/
│  └─ studio/                   # Electron app (added Phase 3)
├─ specs/                       # your own vault — dogfood target
│  └─ spectrace-product-spec.md
└─ fixtures/
   └─ controlled-repo/          # the labeled evaluation repository
```

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

Root scripts worth having on day one:

```jsonc
// package.json (root)
{
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "cli": "pnpm --filter @spectrace/cli start --",
    "studio": "pnpm --filter studio dev"
  }
}
```

Shared devDeps at root: `typescript`, `vitest`, `eslint`, `prettier`, `tsx`.

**Exit criteria:** `pnpm install` succeeds; `pnpm -r build` runs (trivially) across empty packages.

---

## Phase 2 — Core + CLI (this is capstone work, not extra work)

### 2.1 `@spectrace/core` public API

The core owns every contract in the product spec (§2.1). Design the surface as a plain TypeScript API from day one — the CLI and Studio are both thin clients of it:

```ts
// packages/core/src/index.ts — target surface, grow into it
export interface Vault      { loadRequirements(dir: string): Requirement[]; validate(reqs: Requirement[]): SchemaViolation[]; }
export interface Indexer    { buildIndex(repoDir: string, cfg: IndexConfig): SymbolIndex; }
export interface Retrieval  { candidates(req: Requirement, idx: SymbolIndex, cfg: RetrievalConfig): Candidate[]; }
export interface Ranking    { propose(req: Requirement, cands: Candidate[], cfg: LlmConfig): Promise<Proposal[]>; }
export interface Links      { accept(p: Proposal, reviewer: string): void; reject(p: Proposal, reviewer: string): void;
                              redirect(p: Proposal, target: SymbolId, reviewer: string): void;
                              coverage(vault: string): CoverageReport; }
export interface Drift      { analyze(fromSha: string, toSha: string): DriftWarning[]; }
```

Design rules that make Studio integration free later:
- **No `console.log` in core.** Core returns data; clients render it. Emit progress via an injected `onProgress` callback (Studio wires it to the UI, CLI to a spinner).
- **No `process.exit`, no reading env vars inside core.** All config passed in explicitly (`LlmConfig` carries the key).
- **Everything serializable.** Every return type must survive `structuredClone` — this is exactly what Electron IPC requires, so designing for it now means zero adapter code in Phase 4.
- **Filesystem paths in, artifacts on disk out:** frontmatter writes and `.spectrace/index.json` are written by `Links`, matching the CLI storage format byte-for-byte (this *is* NFR-APP-007).

### 2.2 `@spectrace/cli`

Thin wrapper: `commander` (or `yargs`) for argument parsing → call core → print human-readable or `--json`. Suggested first commands, mirroring the proposal:

```
spectrace init          # scaffold .spectrace/ config + templates
spectrace index         # build symbol index
spectrace analyze       # retrieve + (optionally) rank; writes proposals
spectrace review        # terminal accept/reject/redirect loop
spectrace coverage      # coverage report (--json)
spectrace drift <shaA> <shaB>
```

**Exit criteria (Phase 2 / capstone milestone overlap):** CLI runs `index → analyze → review → coverage` end-to-end on `fixtures/controlled-repo`; `--json` output is snapshot-tested in vitest. These snapshots become the Studio parity suite later — write them as fixtures, not throwaway assertions.

---

## Phase 3 — Electron walking skeleton (2–4 evenings)

### 3.1 Scaffold

```bash
cd apps
pnpm create @quick-start/electron studio   # choose: React, TypeScript
cd studio && pnpm install
pnpm dev                                   # window opens with HMR
```

You get three directories; here's the mental mapping:

| Directory | What it is | You'll write |
|---|---|---|
| `src/main/` | Node backend (full fs access, imports core) | IPC handlers |
| `src/preload/` | Security bridge; exposes a typed `window.api` | One file, mostly boilerplate |
| `src/renderer/` | Ordinary React + Vite app | All UI |

### 3.2 The one IPC pattern you need

Define the whole contract as a typed object — one pattern, repeated:

```ts
// src/shared/ipc.ts  (imported by main, preload, and renderer)
export interface Api {
  openVault(dir: string): Promise<VaultSummary>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  runAnalysis(vaultDir: string): Promise<AnalysisResult>;   // Phase 4
  reviewDecision(d: Decision): Promise<CoverageReport>;      // Phase 4
}
```

```ts
// src/main/handlers.ts
import { ipcMain, dialog } from "electron";
ipcMain.handle("openVault", async (_e, dir) => vaultSummary(dir));
ipcMain.handle("readFile",  async (_e, p)   => fs.readFile(p, "utf8"));
```

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("api", {
  openVault: (dir) => ipcRenderer.invoke("openVault", dir),
  readFile:  (p)   => ipcRenderer.invoke("readFile", p),
});
```

```tsx
// renderer — just React
const summary = await window.api.openVault(dir);
```

### 3.3 Walking-skeleton deliverable

One flow, end to end: **pick folder → file tree renders → click file → markdown renders.**

- Folder picker: `dialog.showOpenDialog` in main.
- Tree: recursive read in main, render with plain nested components (no library yet).
- Preview: `react-markdown` + `remark-gfm` in the renderer.

**Exit criteria:** you can open `specs/` and read the product spec inside your own app. This forces you through main/preload/renderer/IPC once — the entire Electron learning curve in one artifact.

---

## Phase 4 — Integration: Studio ⇄ core (the actual point)

Wire core into the main process in this order; each step maps to a P0 requirement and ends demoable.

| Step | Wire up | Spec ref | Demo moment |
|---|---|---|---|
| 4.1 | `Vault.loadRequirements` + `validate` on vault open; violations to a panel | REQ-APP-004 | Duplicate-ID flagged live |
| 4.2 | Editor upgrade: CodeMirror 6 source pane + preview toggle; `gray-matter` properties panel | REQ-APP-002/004 | Frontmatter as form fields |
| 4.3 | GitHub sync: `octokit` fetch → SHA-keyed cache dir → `Indexer.buildIndex` against cache | REQ-APP-010/011 | "Synced @ abc1234" in status bar |
| 4.4 | `runAnalysis` IPC: retrieval (+LLM if key present), progress events streamed to renderer via `webContents.send` | REQ-APP-012 | Progress bar + token cost |
| 4.5 | Review queue UI: proposals grouped by confidence band; accept/reject/redirect → `Links.*` | REQ-APP-013 | Keyboard triage, frontmatter updates on accept |
| 4.6 | Coverage panel from `Links.coverage`; drift inbox from `Drift.analyze(lastSha, newSha)` on sync | REQ-APP-020/021 | Badge flips after accepting a link |

**Parity harness (do at 4.4, not later):** a vitest suite in `apps/studio` that calls the same core functions the IPC handlers call, against `fixtures/controlled-repo`, and diffs results against the CLI's JSON snapshots from Phase 2. Green = NFR-APP-007 holds by construction.

**Exit criteria:** the D1 drift scenario (rename a linked function in the fixture repo, commit, sync) produces a drift warning in the Studio inbox.

---

## Phase 5 — Dogfood switch-over

- Move day-to-day SpecTrace spec editing into Studio itself, vault = `specs/`.
- Connect Studio to the SpecTrace GitHub repo (read-only PAT) and let it trace its own product spec → its own code.
- Per the proposal's own rule: dogfooding observations are recorded but reported separately from the controlled evaluation.

---

## Deliberate PoC shortcuts (fine now, noted for later)

- `simple-git` shelling out to system git; error handling is "show the message."
- JSON files for all state — no SQLite until `.spectrace/index.json` reads become measurably slow.
- No packaging/installer, no auto-update, no code signing: `pnpm dev` is the distribution method.
- Tokens via env vars in dev; keychain (`keytar`/Electron `safeStorage`) before anyone else runs it.
- Split source/preview editor; Milkdown-style live preview deferred to R1.1.
- No telemetry, no crash reporting, no CI beyond `pnpm test` in a GitHub Action.

## Sequencing note

Phases 0–2 are on the capstone critical path anyway — Studio adds only Phases 3–5, and Phase 3 is deliberately sized to fit around the Month 1–2 capstone work (literature review, schema, feasibility experiment). A sane calendar: skeleton (Phase 3) during capstone Month 2, integration steps 4.1–4.3 during Months 3–4 as the indexer/retrieval land in core, 4.4–4.6 during Months 4–6 as ranking/review/drift land. Studio then trails core by a few weeks all the way down, which is exactly the dependency direction the product spec demands.
