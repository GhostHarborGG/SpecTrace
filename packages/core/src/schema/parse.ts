/**
 * Parses a single requirement document into a {@link Requirement}
 * (REQ-CORE-001). Set-level rules — duplicate identifiers — live in
 * ./validate.ts, because they need the whole document set.
 */
import { parse as parseYaml } from "yaml";
import {
  DEFAULT_REQUIREMENT_PRIORITY,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  type Requirement,
  type RequirementPriority,
  type RequirementStatus,
  type SchemaViolation,
  type SchemaWarning,
  type TraceLinkRecord
} from "./types.js";

/** A document as read from disk, before any schema interpretation. */
export interface RequirementDocument {
  /** Vault-relative POSIX path; used verbatim in violations and on the Requirement. */
  path: string;
  content: string;
}

export interface ParsedRequirement {
  /** Null when the document could not be parsed into a well-formed requirement. */
  requirement: Requirement | null;
  violations: SchemaViolation[];
  warnings: SchemaWarning[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;
/** Frontmatter keys the schema owns; everything else is preserved in `extra`. */
const SCHEMA_KEYS = new Set(["id", "title", "status", "priority", "rationale", "links", "acceptance_criteria"]);

/**
 * Coerces YAML output to values that survive `structuredClone` (CLAUDE.md
 * rule 3). The default YAML schema already yields plain JS, but tagged
 * timestamps and explicit maps can slip through, so normalize rather than
 * trust.
 */
function toPlainValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), toPlainValue(v)]));
  if (value instanceof Set) return [...value].map(toPlainValue);
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlainValue(v)]));
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return String(value);
  return value;
}

/**
 * Text of a `## <heading>` section, up to the next heading of any level.
 * The trailing alternative is an end-of-input assertion — JavaScript has no
 * `\z`, and `$` under the `m` flag would stop at the first line break.
 */
function bodySection(body: string, heading: string): string | undefined {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|(?![\\s\\S]))`, "im");
  const text = pattern.exec(body)?.[1]?.trim();
  return text && text.length > 0 ? text : undefined;
}

/** Top-level `- ` list items of a body section, if that section exists. */
function bodyListItems(body: string, heading: string): string[] {
  const section = bodySection(body, heading);
  if (!section) return [];
  return section
    .split(/\r?\n/)
    .map((line) => /^[-*]\s+(.*)$/.exec(line.trim())?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Trace links must be an array of four-string records to satisfy REQ-CORE-001 AC2. */
function readTraceLinks(
  raw: unknown,
  path: string,
  violations: SchemaViolation[],
  requirementId?: string
): TraceLinkRecord[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    violations.push({
      path,
      ...(requirementId ? { requirementId } : {}),
      rule: "malformed-links",
      field: "links",
      message: `${path}: \`links\` must be an array of {symbol, reviewer, timestamp, commit} entries.`
    });
    return [];
  }

  const links: TraceLinkRecord[] = [];
  raw.forEach((entry, index) => {
    const record = entry as Record<string, unknown> | null;
    const symbol = nonEmptyString(record?.["symbol"]);
    const reviewer = nonEmptyString(record?.["reviewer"]);
    const timestamp = nonEmptyString(record?.["timestamp"]);
    const commit = nonEmptyString(record?.["commit"]);
    if (symbol && reviewer && timestamp && commit) {
      links.push({ symbol, reviewer, timestamp, commit });
      return;
    }
    const missing = [
      ["symbol", symbol],
      ["reviewer", reviewer],
      ["timestamp", timestamp],
      ["commit", commit]
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(", ");
    violations.push({
      path,
      ...(requirementId ? { requirementId } : {}),
      rule: "malformed-links",
      field: "links",
      message: `${path}: link entry ${index} is missing ${missing}.`
    });
  });
  return links;
}

/**
 * Parses one document. Every problem found is reported — parsing does not
 * stop at the first (REQ-CORE-002: all violations in a single pass).
 */
export function parseRequirementDocument(document: RequirementDocument): ParsedRequirement {
  const path = document.path.replaceAll("\\", "/");
  const violations: SchemaViolation[] = [];
  const warnings: SchemaWarning[] = [];

  const match = FRONTMATTER.exec(document.content);
  if (!match) {
    violations.push({
      path,
      rule: "malformed-frontmatter",
      message: `${path}: no YAML frontmatter block (expected the file to open with \`---\`).`
    });
    return { requirement: null, violations, warnings };
  }

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = toPlainValue(parseYaml(match[1] ?? ""));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("frontmatter is not a mapping");
    }
    frontmatter = parsed as Record<string, unknown>;
  } catch (error) {
    violations.push({
      path,
      rule: "malformed-frontmatter",
      message: `${path}: frontmatter is not valid YAML — ${error instanceof Error ? error.message : String(error)}`
    });
    return { requirement: null, violations, warnings };
  }

  const body = match[2] ?? "";
  const id = nonEmptyString(frontmatter["id"]);
  const title = nonEmptyString(frontmatter["title"]);
  const status = nonEmptyString(frontmatter["status"]);

  // Mandatory fields, each reported by name (REQ-CORE-001 AC1).
  for (const [field, value] of [
    ["id", id],
    ["title", title],
    ["status", status]
  ] as const) {
    if (!value) {
      violations.push({
        path,
        ...(id ? { requirementId: id } : {}),
        rule: "missing-field",
        field,
        message: `${path}: missing mandatory field \`${field}\`.`
      });
    }
  }

  const criteriaRaw = frontmatter["acceptance_criteria"];
  const acceptanceCriteria = (
    Array.isArray(criteriaRaw)
      ? criteriaRaw.map((c) => nonEmptyString(c)).filter((c): c is string => Boolean(c))
      : bodyListItems(body, "Acceptance criteria")
  ).slice();

  if (acceptanceCriteria.length === 0) {
    violations.push({
      path,
      ...(id ? { requirementId: id } : {}),
      rule: "no-acceptance-criteria",
      message: `${path}: needs at least one acceptance criterion, in frontmatter \`acceptance_criteria\` or an \`## Acceptance criteria\` body section.`
    });
  }

  const traceLinks = readTraceLinks(frontmatter["links"], path, violations, id);

  // Vocabulary checks are warnings, not violations — see SchemaWarning.
  if (status && !REQUIREMENT_STATUSES.includes(status as RequirementStatus)) {
    warnings.push({
      path,
      ...(id ? { requirementId: id } : {}),
      rule: "unknown-status",
      field: "status",
      message: `${path}: status "${status}" is outside the vocabulary (${REQUIREMENT_STATUSES.join(", ")}).`
    });
  }

  const priorityRaw = nonEmptyString(frontmatter["priority"]);
  if (priorityRaw && !REQUIREMENT_PRIORITIES.includes(priorityRaw as RequirementPriority)) {
    warnings.push({
      path,
      ...(id ? { requirementId: id } : {}),
      rule: "unknown-priority",
      field: "priority",
      message: `${path}: priority "${priorityRaw}" is outside the vocabulary (${REQUIREMENT_PRIORITIES.join(", ")}).`
    });
  }

  if (!id || !title || !status) return { requirement: null, violations, warnings };

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!SCHEMA_KEYS.has(key)) extra[key] = value;
  }

  const rationale = nonEmptyString(frontmatter["rationale"]) ?? bodySection(body, "Rationale");

  const requirement: Requirement = {
    id,
    title,
    status: status as RequirementStatus,
    priority: (priorityRaw as RequirementPriority | undefined) ?? DEFAULT_REQUIREMENT_PRIORITY,
    ...(rationale ? { rationale } : {}),
    acceptanceCriteria,
    traceLinks,
    path,
    extra
  };

  return { requirement, violations, warnings };
}
