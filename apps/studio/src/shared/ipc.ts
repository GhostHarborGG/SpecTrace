/**
 * The main↔renderer contract, imported by main, preload, and renderer alike
 * (setup plan §3.2). One typed object, so a handler and its caller cannot
 * drift apart silently.
 *
 * Every type here crosses an Electron IPC boundary, so every type here must
 * survive `structuredClone` — the same constraint `@spectrace/core` is built
 * under (CLAUDE.md rule 3). Keep these shapes to plain data.
 */

/** A markdown file in the vault. Paths are POSIX, vault-relative. */
export interface VaultFile {
  /** Vault-relative POSIX path, e.g. `requirements/REQ-CORE-001.md`. */
  path: string;
  /** Final path segment, e.g. `REQ-CORE-001.md`. */
  name: string;
}

/** A directory in the vault tree. */
export interface VaultDirectory {
  path: string;
  name: string;
  directories: VaultDirectory[];
  files: VaultFile[];
}

export interface VaultSummary {
  /** Absolute POSIX path of the opened directory. */
  root: string;
  /** Recursive tree of markdown files, directories first, both sorted by name. */
  tree: VaultDirectory;
  /** Total markdown files found, at any depth. */
  fileCount: number;
}

/** A schema violation as core reports it, narrowed to what crosses IPC (REQ-CORE-002). */
export interface VaultViolation {
  rule: string;
  path: string;
  message: string;
  requirementId?: string;
}

export interface VaultWarning {
  rule: string;
  path: string;
  message: string;
}

/** One requirement found in the vault, as the properties panel and link resolver need it. */
export interface VaultRequirement {
  id: string;
  path: string;
  title: string;
  status: string;
  priority: string;
}

/** A resolved `[[wiki-link]]` occurrence (REQ-APP-003). */
export interface VaultLink {
  /** Vault-relative path of the document containing the link. */
  from: string;
  /** The text inside the brackets, before any `|alias`. */
  target: string;
  /** Vault-relative path the target resolves to, or null when it resolves to nothing. */
  to: string | null;
}

/**
 * Everything Studio needs to render schema state and the link graph, computed
 * in one pass so the renderer never issues N reads to answer one question.
 */
export interface VaultAnalysis {
  requirements: VaultRequirement[];
  violations: VaultViolation[];
  warnings: VaultWarning[];
  links: VaultLink[];
  /** Files analyzed, for the "nothing was skipped" claim in the UI. */
  documentCount: number;
}

/**
 * An unsaved buffer, substituted for the file's on-disk content during
 * analysis. Without this, validation would describe the last save rather than
 * what is on screen — and REQ-APP-004 AC2 is explicitly about live flagging.
 */
export interface BufferOverride {
  path: string;
  content: string;
}

/**
 * A coverage report as core builds it (REQ-APP-020 AC1). Re-exported through
 * the IPC contract rather than redefined: the dashboard consumes exactly what
 * `spectrace coverage --json` emits, and a second declaration here would be a
 * place for the two to drift (NFR-APP-007).
 */
export type { CoverageReport } from "@spectrace/core";

// ---------- Analysis runs (REQ-APP-012) ----------

/** The pipeline's stages, in order. `estimate` is where AC2's projection lands. */
export type AnalysisStage = "index" | "retrieve" | "estimate" | "rank";

export interface RunProgress {
  stage: AnalysisStage;
  completed: number;
  total: number;
  /** Human-readable detail for the current stage, e.g. "412 symbol(s)". */
  detail?: string;
}

/**
 * A run's outcome. Cancellation is a normal result rather than an error: AC3
 * is that the last completed stage's artifacts survive, so the caller needs a
 * value it can read, not an exception it is tempted to discard.
 */
export interface RunResult {
  cancelled: boolean;
  /** The stage the run was in when it stopped. Present only when cancelled. */
  cancelledDuring?: AnalysisStage;
  repositoryCommit: string;
  configurationId?: string;
  symbolCount?: number;
  requirementCount?: number;
  /** Projected before ranking (AC2, first half). Absent if the run stopped earlier. */
  projection?: import("@spectrace/core").CostProjection;
  proposalCount?: number;
  bandCounts?: import("@spectrace/core").BandCounts;
  failureCount?: number;
  /** Measured after ranking (AC2, second half) — the provider's numbers, not the estimate. */
  usage?: import("@spectrace/core").UsageReport;
  promptVersion?: string;
  modelId?: string;
  /** POSIX paths of every artifact this run checkpointed, in write order. */
  artifactsWritten: string[];
}

// ---------- Review queue (REQ-APP-013) ----------

/** One queued proposal, with the band that put it there and any staleness flag. */
export interface QueueEntry {
  proposal: import("@spectrace/core").Proposal;
  band: import("@spectrace/core").ConfidenceBand;
  /** True when the symbol is no longer in the index (REQ-CORE-011 AC2). */
  stale: boolean;
  staleReason?: "excluded" | "missing";
}

export interface QueueSnapshot {
  /** `suggest` first, then `review`. `discard` is withheld, never queued. */
  entries: QueueEntry[];
  /** Proposals in the artifact, including withheld and already-decided ones. */
  total: number;
  decided: number;
  /** Proposals in the `discard` band, kept inspectable but not queued. */
  withheld: number;
  /** Non-null when staleness could not be checked, and why. */
  stalenessUnchecked: string | null;
  proposalsPath: string | null;
}

export interface DecisionRequest {
  root: string;
  /** Linked code repository; its HEAD stamps the decisions (REQ-APP-015). */
  repositoryRoot?: string;
  reviewer: string;
  decisions: Array<{
    requirementId: string;
    symbolId: string;
    kind: import("@spectrace/core").DecisionKind | "skip";
    /** Symbol ID to redirect to; required when `kind` is "redirect". */
    redirectTo?: string;
    /** ISO 8601; defaults to now. Supplied, a batch replays deterministically. */
    timestamp?: string;
  }>;
}

export interface ReviewOutcome {
  applied: number;
  skipped: Array<{ requirementId: string; symbolId: string; reason: string }>;
  links: number;
  statistics: import("@spectrace/core").ReviewStatistics;
  updatedDocuments: string[];
  decisionsPath: string;
  indexPath: string;
}

// ---------- Bidirectional navigation (REQ-APP-014) ----------

export interface TraceNeighbours {
  /** Symbol IDs linked to the given requirement. */
  symbols: string[];
  /** Requirement IDs linked to the given symbol. */
  requirements: string[];
  /** Requirements with no accepted link at all. */
  unlinked: string[];
}

export interface RunAnalysisRequest {
  root: string;
  /**
   * The linked code repository to index (REQ-APP-015). Absent, `root` is the
   * repository too — the single-root run every pre-workspace vault gets.
   */
  repositoryRoot?: string;
  /** Overrides `retrieval.mode` from configuration. */
  mode?: import("@spectrace/core").RetrievalMode;
  /** Per-million-token pricing; absent, the run is reported unpriced rather than free. */
  pricing?: import("@spectrace/core").ModelPricing;
}

export interface Api {
  /** Opens a folder picker and returns the chosen vault, or null if cancelled. */
  chooseVault(): Promise<VaultSummary | null>;
  /** Opens a known directory as a vault, without a picker. */
  openVault(directory: string): Promise<VaultSummary>;
  /**
   * Opens a folder picker and links the choice as the vault's code repository
   * (REQ-APP-015). Persisted per machine, so reopening the vault restores it.
   * Returns the linked POSIX path, or null if cancelled.
   */
  chooseRepository(vaultRoot: string): Promise<string | null>;
  /** The repository linked to this vault, or null when there is none (or it is gone). */
  linkedRepository(vaultRoot: string): Promise<string | null>;
  /** Removes the vault's repository link (REQ-APP-015 AC4). */
  unlinkRepository(vaultRoot: string): Promise<void>;
  /** Reads a vault-relative file as UTF-8 text. */
  readFile(root: string, relativePath: string): Promise<string>;
  /** Writes a vault-relative file as UTF-8 — an ordinary filesystem write (REQ-APP-001 AC2). */
  writeFile(root: string, relativePath: string, content: string): Promise<void>;
  /** Validates the vault through `@spectrace/core` and builds its link graph. */
  analyzeVault(root: string, overrides?: BufferOverride[]): Promise<VaultAnalysis>;
  /**
   * Coverage summary and per-requirement link states (REQ-APP-020).
   * Byte-identical to `spectrace coverage --json` at the same commit — both
   * call the same core builder (NFR-APP-007).
   */
  coverage(
    root: string,
    symbolIndexPath?: string,
    repositoryRoot?: string
  ): Promise<import("@spectrace/core").CoverageReport>;
  /**
   * Runs the core pipeline, checkpointing each stage (REQ-APP-012).
   * Resolves with the run's outcome, including a cancelled one.
   */
  runAnalysis(request: RunAnalysisRequest): Promise<RunResult>;
  /**
   * Requests cancellation of the run in flight (AC3). Returns whether there
   * was one to cancel, so a UI can tell "stopped it" from "nothing running"
   * instead of reporting success either way.
   */
  cancelAnalysis(): Promise<boolean>;
  /**
   * Subscribes to per-stage progress. Returns an unsubscribe function.
   *
   * A stream rather than a polled getter: AC2 wants cost and progress visible
   * *during* the run, and a renderer that has to ask cannot show a stage it
   * did not think to ask about.
   */
  onRunProgress(listener: (progress: RunProgress) => void): () => void;
  /** The review queue as core bands it (REQ-APP-013). */
  reviewQueue(root: string, repositoryRoot?: string): Promise<QueueSnapshot>;
  /** Applies decisions through core and writes the trail, frontmatter, then index. */
  applyDecisions(request: DecisionRequest): Promise<ReviewOutcome>;
  /** Trace-link neighbours in both directions (REQ-APP-014, REQ-CORE-051). */
  traceNeighbours(
    root: string,
    requirementId?: string,
    symbolId?: string,
    repositoryRoot?: string
  ): Promise<TraceNeighbours>;
  /** Git `user.name`, so the reviewer field is never guessed (REQ-CLI-005 AC2's rule). */
  defaultReviewer(root: string): Promise<string | null>;
}

/** Channel names, kept beside the contract so they cannot drift from it. */
export const IPC_CHANNELS = {
  chooseVault: "spectrace:chooseVault",
  openVault: "spectrace:openVault",
  chooseRepository: "spectrace:chooseRepository",
  linkedRepository: "spectrace:linkedRepository",
  unlinkRepository: "spectrace:unlinkRepository",
  readFile: "spectrace:readFile",
  writeFile: "spectrace:writeFile",
  analyzeVault: "spectrace:analyzeVault",
  coverage: "spectrace:coverage",
  runAnalysis: "spectrace:runAnalysis",
  cancelAnalysis: "spectrace:cancelAnalysis",
  onRunProgress: "spectrace:runProgress",
  reviewQueue: "spectrace:reviewQueue",
  applyDecisions: "spectrace:applyDecisions",
  traceNeighbours: "spectrace:traceNeighbours",
  defaultReviewer: "spectrace:defaultReviewer"
} as const satisfies Record<keyof Api, string>;
