/**
 * Requirement schema types (REQ-CORE-001, REQ-CORE-002).
 *
 * Field semantics follow specs/requirements/REQ-CORE-001.md as amended
 * 2026-08-02: `id`, `title`, and `status` are mandatory; `priority`,
 * `rationale`, and `links` are optional, and a rationale may live in a
 * `## Rationale` body section instead of frontmatter.
 */

/** Opaque, stable requirement identifier (REQ-CORE-001 AC3). */
export type RequirementId = string;

/** Status vocabulary, per specs/spectrace-core-spec.md §3. */
export const REQUIREMENT_STATUSES = ["proposed", "partial", "implemented"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_PRIORITIES = ["P0", "P1", "P2"] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

/** REQ-CORE-001: priority is optional and resolves to this when omitted. */
export const DEFAULT_REQUIREMENT_PRIORITY: RequirementPriority = "P1";

/**
 * An accepted trace link as stored in requirement frontmatter (REQ-CORE-001
 * AC2). Deliberately four flat string fields so the frontmatter stays legible
 * to a reader — or a tool — without SpecTrace installed.
 */
export interface TraceLinkRecord {
  symbol: string;
  reviewer: string;
  timestamp: string; // ISO 8601
  commit: string; // SHA the decision was made at
}

export interface Requirement {
  id: RequirementId;
  title: string;
  status: RequirementStatus;
  /** Resolved, never absent: omitted frontmatter yields DEFAULT_REQUIREMENT_PRIORITY. */
  priority: RequirementPriority;
  /** From frontmatter `rationale` or a `## Rationale` body section; absent if neither. */
  rationale?: string;
  /** At least one entry is enforced by validation (REQ-CORE-002). */
  acceptanceCriteria: string[];
  traceLinks: TraceLinkRecord[];
  /** Vault-relative POSIX path of the source document (CLAUDE.md rule 4). */
  path: string;
  /**
   * Frontmatter keys outside the schema, preserved verbatim so vault-specific
   * fields survive a parse round-trip — the frozen experiment corpus carries
   * `difficulty` and `source_documentation`, and this vault carries `spec`.
   * Values are normalized to JSON-safe primitives.
   */
  extra: Record<string, unknown>;
}

export type SchemaViolationRule =
  | "malformed-frontmatter"
  | "missing-field"
  | "no-acceptance-criteria"
  | "malformed-links"
  | "duplicate-id";

/** A validation failure. Any violation fails the document set (REQ-CLI-002 exits 3). */
export interface SchemaViolation {
  /** Vault-relative POSIX path of the offending document. */
  path: string;
  requirementId?: RequirementId;
  rule: SchemaViolationRule;
  /** Frontmatter field implicated, when the rule is about one. */
  field?: string;
  message: string;
}

export type SchemaWarningRule = "unknown-status" | "unknown-priority";

/**
 * A non-fatal observation. Warnings never fail validation — the status and
 * priority vocabularies are narrative guidance in the core spec, and
 * REQ-CORE-002 enumerates exactly two rejection rules (duplicate identifiers
 * and missing acceptance criteria), so an unrecognized value is reported
 * rather than rejected.
 */
export interface SchemaWarning {
  path: string;
  requirementId?: RequirementId;
  rule: SchemaWarningRule;
  field: string;
  message: string;
}
