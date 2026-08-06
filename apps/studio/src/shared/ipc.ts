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

export interface Api {
  /** Opens a folder picker and returns the chosen vault, or null if cancelled. */
  chooseVault(): Promise<VaultSummary | null>;
  /** Opens a known directory as a vault, without a picker. */
  openVault(directory: string): Promise<VaultSummary>;
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
  coverage(root: string, symbolIndexPath?: string): Promise<import("@spectrace/core").CoverageReport>;
}

/** Channel names, kept beside the contract so they cannot drift from it. */
export const IPC_CHANNELS = {
  chooseVault: "spectrace:chooseVault",
  openVault: "spectrace:openVault",
  readFile: "spectrace:readFile",
  writeFile: "spectrace:writeFile",
  analyzeVault: "spectrace:analyzeVault",
  coverage: "spectrace:coverage"
} as const satisfies Record<keyof Api, string>;
