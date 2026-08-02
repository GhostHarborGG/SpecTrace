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

export interface Api {
  /** Opens a folder picker and returns the chosen vault, or null if cancelled. */
  chooseVault(): Promise<VaultSummary | null>;
  /** Opens a known directory as a vault, without a picker. */
  openVault(directory: string): Promise<VaultSummary>;
  /** Reads a vault-relative file as UTF-8 text. */
  readFile(root: string, relativePath: string): Promise<string>;
}

/** Channel names, kept beside the contract so they cannot drift from it. */
export const IPC_CHANNELS = {
  chooseVault: "spectrace:chooseVault",
  openVault: "spectrace:openVault",
  readFile: "spectrace:readFile"
} as const satisfies Record<keyof Api, string>;
