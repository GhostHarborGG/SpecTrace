/**
 * Vault analysis for the main process: schema validation via
 * `@spectrace/core`, plus the `[[wiki-link]]` graph (REQ-APP-003/004).
 *
 * Studio never reimplements engine behavior (SPEC-APP-000 §2), so every
 * schema judgement here — what a requirement is, what counts as a duplicate
 * ID, what a violation reads like — comes from core. What is genuinely
 * Studio's own is the wiki-link syntax, which is an editor affordance rather
 * than an engine concept and appears nowhere in SPEC-CORE-000.
 *
 * Electron-free on purpose, like `./vault.ts`, so it unit-tests in plain Node.
 *
 * The `overrides` parameter is the load-bearing part of REQ-APP-004 AC2: a
 * duplicate ID must be flagged while it is being typed, which means analysis
 * has to see the unsaved buffer rather than the last saved bytes.
 */

import { validateRequirements, type RequirementDocument } from "@spectrace/core";
import type {
  BufferOverride,
  VaultAnalysis,
  VaultDirectory,
  VaultLink,
  VaultRequirement,
  VaultSummary
} from "../shared/ipc.js";
import { readVault, readVaultFile } from "./vault.js";

/**
 * `[[target]]` or `[[target|alias]]`, excluding image embeds (`![[…]]`).
 * Targets containing a newline are not links — an unclosed bracket pair
 * should not swallow the rest of the document.
 */
const WIKI_LINK = /(!?)\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;

export function parseWikiLinks(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(WIKI_LINK)) {
    if (match[1] === "!") continue; // an embed, not a navigable link
    const target = match[2]!.trim();
    if (target.length > 0) targets.push(target);
  }
  return targets;
}

function flattenFiles(directory: VaultDirectory, into: string[] = []): string[] {
  for (const file of directory.files) into.push(file.path);
  for (const child of directory.directories) flattenFiles(child, into);
  return into;
}

/**
 * Resolves a wiki-link target to a vault-relative path.
 *
 * Tried in order: an exact path, a path missing its `.md`, a bare file name
 * (Obsidian's usual shorthand), and finally a requirement ID — which is the
 * form that matters most here, since `[[REQ-CORE-001]]` is how one
 * requirement cites another and the ID need not match the file name
 * (REQ-CORE-001 AC3 makes IDs independent of file names).
 */
export function resolveWikiLink(
  target: string,
  filePaths: readonly string[],
  requirementPathsById: ReadonlyMap<string, string>
): string | null {
  const normalized = target.replace(/\\/g, "/").replace(/^\.\//, "");
  const withExtension = normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;

  const exact = filePaths.find((p) => p === normalized || p === withExtension);
  if (exact !== undefined) return exact;

  const byName = filePaths.find((p) => {
    const name = p.split("/").pop()!;
    return name === normalized || name === withExtension;
  });
  if (byName !== undefined) return byName;

  return requirementPathsById.get(normalized) ?? null;
}

export interface AnalyzeOptions {
  root: string;
  overrides?: readonly BufferOverride[];
  /** Injected for tests; defaults to reading the real vault. */
  summary?: VaultSummary;
  readFile?: (root: string, relativePath: string) => string;
}

/**
 * Reads every markdown file in the vault, validates it through core, and
 * resolves its links.
 *
 * A file that cannot be read becomes a warning rather than an exception: one
 * unreadable document must not blank the whole panel, and the user needs to
 * be told which one it was.
 */
export function analyzeVault(options: AnalyzeOptions): VaultAnalysis {
  const summary = options.summary ?? readVault(options.root);
  const read = options.readFile ?? readVaultFile;
  const overrides = new Map((options.overrides ?? []).map((o) => [o.path, o.content]));

  const filePaths = flattenFiles(summary.tree);
  const documents: RequirementDocument[] = [];
  const unreadable: { rule: string; path: string; message: string }[] = [];
  const contents = new Map<string, string>();

  for (const path of filePaths) {
    const override = overrides.get(path);
    if (override !== undefined) {
      contents.set(path, override);
      documents.push({ path, content: override });
      continue;
    }
    try {
      const content = read(options.root, path);
      contents.set(path, content);
      documents.push({ path, content });
    } catch (cause) {
      unreadable.push({
        rule: "unreadable-file",
        path,
        message: `Could not read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`
      });
    }
  }

  // Every schema judgement is core's, including which documents are
  // requirements at all and which IDs collide.
  const report = validateRequirements(documents);

  const requirements: VaultRequirement[] = report.requirements.map((requirement) => ({
    id: requirement.id,
    path: requirement.path,
    title: requirement.title,
    status: requirement.status,
    priority: requirement.priority
  }));

  const requirementPathsById = new Map<string, string>();
  for (const requirement of requirements) {
    // On a duplicate ID, the first occurrence wins for link resolution; the
    // duplicate itself is already reported as a violation by core.
    if (!requirementPathsById.has(requirement.id)) {
      requirementPathsById.set(requirement.id, requirement.path);
    }
  }

  const links: VaultLink[] = [];
  for (const [path, content] of contents) {
    for (const target of parseWikiLinks(content)) {
      links.push({ from: path, target, to: resolveWikiLink(target, filePaths, requirementPathsById) });
    }
  }

  return {
    requirements,
    violations: report.violations.map((violation) => ({
      rule: violation.rule,
      path: violation.path,
      message: violation.message,
      ...(violation.requirementId ? { requirementId: violation.requirementId } : {})
    })),
    warnings: [
      ...report.warnings.map((warning) => ({
        rule: warning.rule,
        path: warning.path,
        message: warning.message
      })),
      ...unreadable
    ],
    links,
    documentCount: documents.length
  };
}

/** Documents linking *to* `path` — the backlinks panel's data (REQ-APP-003 AC3). */
export function backlinksFor(analysis: VaultAnalysis, path: string): VaultLink[] {
  return analysis.links.filter((link) => link.to === path && link.from !== path);
}
