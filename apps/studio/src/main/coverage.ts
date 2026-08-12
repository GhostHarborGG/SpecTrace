/**
 * Coverage and trace-link queries for the main process (REQ-APP-012,
 * REQ-APP-020, NFR-APP-007).
 *
 * Studio never reimplements engine behavior (SPEC-APP-000 §2), and this module
 * is where that principle is doing the most work: the report envelope comes
 * from `buildCoverageReport` in core — the same function `spectrace coverage`
 * calls — so Studio's dashboard and the CLI cannot drift apart. Parity is a
 * property of there being one implementation, not of two implementations being
 * tested against each other.
 *
 * Electron-free like `./vault.ts` and `./analysis.ts`, so it unit-tests in
 * plain Node and the parity suite runs without booting a window.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CORE_VERSION,
  buildCoverageReport,
  buildLinkIndex,
  loadConfig,
  parseSymbolIndex,
  readRequirementDocuments,
  requirementsForSymbol,
  resolveLinks,
  symbolsForRequirement,
  unlinkedRequirements,
  validateRequirements,
  type CodeSymbol,
  type CoverageReport,
  type LinkIndex,
  type Requirement
} from "@spectrace/core";

export interface RepositoryState {
  /** Absolute path of the vault: requirements, configuration, and `.spectrace/`. */
  root: string;
  /** Linked code repository; absent, the vault serves (REQ-APP-015 AC3). Read-only. */
  repositoryRoot?: string;
  /** Optional symbol index; supplied, links are resolved and staleness reported. */
  indexPath?: string;
}

export interface VaultLinkState {
  requirements: Requirement[];
  index: LinkIndex;
  repositoryCommit: string;
}

/** HEAD, or `unknown` outside a repository — a commit is provenance, not a precondition. */
export function headCommit(root: string): string {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Reads the vault named by configuration and builds the link index from
 * frontmatter (REQ-CORE-050).
 *
 * Identical inputs to the CLI's path, and deliberately so: the index is a pure
 * function of the requirement documents, so both clients reading the same
 * vault at the same commit get the same index by construction.
 */
export function readVaultLinkState(state: RepositoryState): VaultLinkState {
  const root = resolve(state.root);
  const { config } = loadConfig(root);

  const documents: Array<{ path: string; content: string }> = [];
  for (const specPath of config.specPaths) {
    const absolute = resolve(root, specPath);
    if (!existsSync(absolute)) continue;
    for (const document of readRequirementDocuments(absolute)) {
      documents.push({ path: `${specPath}/${document.path}`, content: document.content });
    }
  }

  const report = validateRequirements(documents);
  // The commit is the code's, not the vault's: a trace link asserts something
  // about the repository at a commit, and with a linked repository the vault's
  // own history is the wrong one to stamp (REQ-APP-015 AC1).
  const repositoryCommit = headCommit(resolve(state.repositoryRoot ?? root));

  return {
    requirements: report.requirements,
    index: buildLinkIndex(report.requirements, repositoryCommit),
    repositoryCommit
  };
}

function readSymbols(indexPath: string): CodeSymbol[] {
  const parsed = parseSymbolIndex(readFileSync(indexPath, "utf8"));
  return parsed.symbols;
}

/**
 * The coverage report Studio's dashboard renders (REQ-APP-020 AC1).
 *
 * Byte-identical to `spectrace coverage --json` at the same commit against the
 * same vault, because the envelope is core's.
 */
export function coverageReport(state: RepositoryState): CoverageReport {
  const { requirements, index, repositoryCommit } = readVaultLinkState(state);

  const resolution =
    state.indexPath === undefined
      ? undefined
      : resolveLinks({
          index,
          knownSymbolIds: new Set(readSymbols(state.indexPath).map((s) => s.symbolId)),
          repositoryCommit
        });

  return buildCoverageReport({
    index,
    requirementIds: requirements.map((r) => r.id),
    engineVersion: CORE_VERSION,
    repositoryCommit,
    ...(resolution ? { resolution } : {})
  });
}

/** Bidirectional navigation for the link panes (REQ-APP-014, REQ-CORE-051). */
export function linkQueries(state: RepositoryState): {
  symbolsFor(requirementId: string): string[];
  requirementsFor(symbolId: string): string[];
  unlinked(): string[];
} {
  const { requirements, index } = readVaultLinkState(state);
  return {
    symbolsFor: (requirementId) => symbolsForRequirement(index, requirementId),
    requirementsFor: (symbolId) => requirementsForSymbol(index, symbolId),
    unlinked: () => unlinkedRequirements(index, requirements.map((r) => r.id))
  };
}

/** Default location of the symbol index written by `spectrace index`. */
export function defaultSymbolIndexPath(root: string): string {
  return join(root, ".spectrace", "index.jsonl");
}
