/**
 * Experiment-format requirement loading (prelim spec §6.3/§6.4), ported
 * from the retired Phase A harness.
 *
 * INTERIM: this is CLI-internal support for `analyze`/`evaluate` until the
 * real vault schema lands in core (REQ-CORE-001..004, Phase B), at which
 * point this file is deleted and the commands consume `core.vault`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export type Difficulty = "high-overlap" | "partial-overlap" | "domain-vocabulary";

export const ALLOWED_DIFFICULTIES: readonly Difficulty[] = [
  "high-overlap",
  "partial-overlap",
  "domain-vocabulary"
];

export interface ParsedRequirement {
  filePath: string;
  id: string;
  title: string;
  difficulty: Difficulty;
  acceptanceCriteria: string[];
  statement: string;
}

export type RequirementErrorCode =
  | "empty_file"
  | "invalid_frontmatter"
  | "missing_id"
  | "duplicate_id"
  | "missing_title"
  | "missing_statement"
  | "missing_acceptance_criteria"
  | "invalid_difficulty";

export interface RequirementError {
  filePath: string;
  code: RequirementErrorCode;
  message: string;
}

export interface RequirementLoadResult {
  requirements: ParsedRequirement[];
  errors: RequirementError[];
}

/**
 * Query text for retrieval, defined in core so every client builds it
 * identically (REQ-APP-012 AC1). Re-exported here because callers reach for it
 * beside the loader that produces its input.
 */
export { buildRequirementQueryText } from "@spectrace/core";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

/** Splits a requirement body into its `## Heading` sections (case-insensitive; prelim spec §6.3). */
function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      sections.set(currentHeading, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of body.split(/\r?\n/)) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1]!.trim().toLowerCase();
    } else if (currentHeading !== null) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

/** Reads, parses, and validates every `.md` file in `dir` per prelim spec §6.4. */
export function loadRequirements(dir: string): RequirementLoadResult {
  const requirements: ParsedRequirement[] = [];
  const errors: RequirementError[] = [];
  const seenIds = new Map<string, string>();

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  for (const name of files) {
    const filePath = join(dir, name);
    const content = readFileSync(filePath, "utf8");

    if (content.trim().length === 0) {
      errors.push({ filePath, code: "empty_file", message: "Requirement file is empty." });
      continue;
    }

    let data: Record<string, unknown>;
    let body: string;
    try {
      const parsed = matter(content);
      data = parsed.data;
      body = parsed.content;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      errors.push({ filePath, code: "invalid_frontmatter", message: `Unreadable YAML frontmatter: ${reason}` });
      continue;
    }

    const statement = splitSections(body).get("statement") ?? null;
    const fileErrors: RequirementError[] = [];

    if (!isNonEmptyString(data["id"])) {
      fileErrors.push({ filePath, code: "missing_id", message: "Requirement is missing a non-empty `id`." });
    }
    if (!isNonEmptyString(data["title"])) {
      fileErrors.push({ filePath, code: "missing_title", message: "Requirement is missing a non-empty `title`." });
    }
    if (!isNonEmptyString(statement)) {
      fileErrors.push({
        filePath,
        code: "missing_statement",
        message: "Requirement body is missing a non-empty `## Statement` section."
      });
    }
    if (!isNonEmptyStringArray(data["acceptance_criteria"])) {
      fileErrors.push({
        filePath,
        code: "missing_acceptance_criteria",
        message: "Requirement is missing at least one `acceptance_criteria` entry."
      });
    }
    if (!ALLOWED_DIFFICULTIES.includes(data["difficulty"] as Difficulty)) {
      fileErrors.push({
        filePath,
        code: "invalid_difficulty",
        message: `Requirement \`difficulty\` must be one of ${ALLOWED_DIFFICULTIES.join(", ")}; got ${JSON.stringify(
          data["difficulty"]
        )}.`
      });
    }

    if (fileErrors.length > 0) {
      errors.push(...fileErrors);
      continue;
    }

    const id = data["id"] as string;
    const existingFile = seenIds.get(id);
    if (existingFile !== undefined) {
      errors.push({
        filePath,
        code: "duplicate_id",
        message: `Requirement ID "${id}" is already used by ${existingFile}.`
      });
      continue;
    }
    seenIds.set(id, filePath);

    requirements.push({
      filePath,
      id,
      title: (data["title"] as string).trim(),
      difficulty: data["difficulty"] as Difficulty,
      acceptanceCriteria: data["acceptance_criteria"] as string[],
      statement: statement as string
    });
  }

  return { requirements, errors };
}
