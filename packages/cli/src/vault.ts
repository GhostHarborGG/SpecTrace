/**
 * Vault loading and link-storage writes for the review, links, and coverage
 * commands (REQ-CLI-005…007).
 *
 * These commands operate on the *real* vault — `specs/requirements/` per
 * configuration, parsed by core's schema (REQ-CORE-001) — not on the interim
 * experiment format in `requirements.ts`, which exists only to keep `analyze`
 * and `evaluate` running against the frozen feasibility corpus.
 *
 * Writing lives here rather than in core because core writes no files
 * (CLAUDE.md rule 2). The ordering REQ-CORE-050 requires — frontmatter first,
 * then the index — is enforced by {@link writeAcceptedLinks}, which is the
 * only function in the CLI that touches either.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import {
  LINK_INDEX_RELATIVE_PATH,
  buildLinkIndex,
  readRequirementDocuments,
  serializeLinkIndex,
  toPosixPath,
  toTraceLinkRecords,
  validateRequirements,
  type AcceptedLink,
  type LinkIndex,
  type Requirement,
  type SchemaViolation,
  type SpectraceConfig
} from "@spectrace/core";

export interface LoadedVault {
  requirements: Requirement[];
  violations: SchemaViolation[];
  /** Absolute path of each requirement's source document, by requirement ID. */
  filePaths: Map<string, string>;
  /** Configured spec paths that do not exist. */
  missingPaths: string[];
}

/**
 * Loads every requirement document named by configuration.
 *
 * Returns violations rather than throwing: a vault with one malformed document
 * should still answer a coverage query about the other forty, and the caller
 * decides whether a violation is fatal for its command.
 */
export function loadVault(repo: string, config: SpectraceConfig): LoadedVault {
  const documents: Array<{ path: string; content: string; absolute: string }> = [];
  const missingPaths: string[] = [];

  for (const specPath of config.specPaths) {
    const absolute = resolve(repo, specPath);
    if (!existsSync(absolute)) {
      missingPaths.push(specPath);
      continue;
    }
    for (const document of readRequirementDocuments(absolute)) {
      documents.push({
        path: `${specPath}/${document.path}`,
        content: document.content,
        absolute: join(absolute, document.path)
      });
    }
  }

  const report = validateRequirements(documents.map(({ path, content }) => ({ path, content })));
  const filePaths = new Map<string, string>();
  for (const requirement of report.requirements) {
    const source = documents.find((d) => d.path === requirement.path);
    if (source !== undefined) filePaths.set(requirement.id, source.absolute);
  }

  return { requirements: report.requirements, violations: report.violations, filePaths, missingPaths };
}

/** HEAD, or `unknown` outside a repository — a commit is provenance, not a precondition. */
export function headCommit(repo: string): string {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Reviewer identity: `--reviewer`, else git config `user.name`
 * (REQ-CLI-005 AC2). Returns undefined when neither is available, which the
 * command turns into exit 2 — an audit trail whose identities are guessed is
 * not an audit trail.
 */
export function resolveReviewer(repo: string, explicit: string | undefined): string | undefined {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit.trim();
  try {
    const name = execFileSync("git", ["-C", repo, "config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

export interface LinkWriteResult {
  /** Requirement documents whose frontmatter changed. */
  updatedDocuments: string[];
  indexPath: string;
  index: LinkIndex;
}

/**
 * Writes accepted links to frontmatter and then rebuilds the index
 * (REQ-CORE-050).
 *
 * **Frontmatter first, index second**, and not as a stylistic preference:
 * frontmatter is the source of truth, so a crash between the two leaves a
 * stale index that `reconcileLinkIndex` detects and a rebuild repairs. The
 * reverse order could leave an index asserting a link no document records,
 * with nothing authoritative left to rebuild from.
 *
 * Documents are rewritten only when their link list actually changes, so a
 * re-run touches no mtimes and produces no diff.
 */
export function writeAcceptedLinks(
  repo: string,
  vault: LoadedVault,
  links: readonly AcceptedLink[],
  repositoryCommit: string
): LinkWriteResult {
  const byRequirement = new Map<string, AcceptedLink[]>();
  for (const link of links) {
    const bucket = byRequirement.get(link.requirementId);
    if (bucket === undefined) byRequirement.set(link.requirementId, [link]);
    else bucket.push(link);
  }

  const updatedDocuments: string[] = [];

  for (const requirement of vault.requirements) {
    const filePath = vault.filePaths.get(requirement.id);
    if (filePath === undefined) continue;

    const records = toTraceLinkRecords(byRequirement.get(requirement.id) ?? []);
    const existing = JSON.stringify(requirement.traceLinks);
    if (JSON.stringify(records) === existing) continue;

    const raw = readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    // gray-matter round-trips the body verbatim; only `links` is replaced, so
    // every other key — including vault-specific ones like `spec` — survives.
    const data = { ...parsed.data, links: records };
    writeFileSync(filePath, matter.stringify(parsed.content, data), "utf8");
    updatedDocuments.push(toPosixPath(filePath));
  }

  // Built from the same records just written to frontmatter, which is what is
  // now on disk — so the index describes the documents rather than the
  // intention that produced them. `reconcileLinkIndex` is what proves that
  // afterwards; nothing here is asked to be trusted.
  const index = buildLinkIndex(
    vault.requirements.map((requirement) => ({
      id: requirement.id,
      traceLinks: toTraceLinkRecords(byRequirement.get(requirement.id) ?? [])
    })),
    repositoryCommit
  );

  const indexPath = resolve(repo, LINK_INDEX_RELATIVE_PATH);
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, serializeLinkIndex(index), "utf8");

  return { updatedDocuments, indexPath, index };
}
