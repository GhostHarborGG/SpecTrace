/**
 * Set-level validation (REQ-CORE-002): duplicate identifiers across the
 * specification set, plus every per-document violation, all reported in a
 * single pass rather than failing on the first.
 */
import { parseRequirementDocument, type RequirementDocument } from "./parse.js";
import type { Requirement, SchemaViolation, SchemaWarning } from "./types.js";

export interface ValidationReport {
  /** Well-formed requirements, in input order. Excludes documents that failed to parse. */
  requirements: Requirement[];
  violations: SchemaViolation[];
  warnings: SchemaWarning[];
  /** True when there are no violations; warnings do not affect it. */
  valid: boolean;
}

/**
 * Validates a set of requirement documents. Pure: no filesystem access, no
 * console output — see ./load.ts for the filesystem boundary.
 */
export function validateRequirements(documents: readonly RequirementDocument[]): ValidationReport {
  const requirements: Requirement[] = [];
  const violations: SchemaViolation[] = [];
  const warnings: SchemaWarning[] = [];

  for (const document of documents) {
    const parsed = parseRequirementDocument(document);
    violations.push(...parsed.violations);
    warnings.push(...parsed.warnings);
    if (parsed.requirement) requirements.push(parsed.requirement);
  }

  // Duplicate identifiers. Every file in a colliding group is reported, and
  // each message names the others (REQ-CORE-002 AC1).
  const byId = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    const group = byId.get(requirement.id);
    if (group) group.push(requirement);
    else byId.set(requirement.id, [requirement]);
  }

  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    for (const requirement of group) {
      const others = group.filter((r) => r !== requirement).map((r) => r.path);
      violations.push({
        path: requirement.path,
        requirementId: id,
        rule: "duplicate-id",
        field: "id",
        message: `${requirement.path}: requirement ID "${id}" is also used by ${others.join(", ")}.`
      });
    }
  }

  return { requirements, violations, warnings, valid: violations.length === 0 };
}
