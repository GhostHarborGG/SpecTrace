export type Difficulty = "high-overlap" | "partial-overlap" | "domain-vocabulary";

export const ALLOWED_DIFFICULTIES: readonly Difficulty[] = [
  "high-overlap",
  "partial-overlap",
  "domain-vocabulary"
];

export interface RequirementFrontmatter {
  id: unknown;
  title: unknown;
  status?: unknown;
  priority?: unknown;
  difficulty: unknown;
  source_documentation?: unknown;
  acceptance_criteria: unknown;
}

/**
 * Structurally read from a requirement file before field-level validation.
 * Frontmatter values are left as `unknown` because malformed input (wrong
 * type, missing field) is exactly what the validator (§6.4) must catch.
 */
export interface RawRequirement {
  filePath: string;
  frontmatter: RequirementFrontmatter;
  statement: string | null;
  rationale: string | null;
  notes: string | null;
  rawBody: string;
}

export interface ParsedRequirement {
  filePath: string;
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  difficulty: Difficulty;
  sourceDocumentation: string[];
  acceptanceCriteria: string[];
  statement: string;
  rationale: string | null;
  notes: string | null;
  rawBody: string;
}

/**
 * Matches spec §6.4's required rejection reasons one-to-one so validation
 * output can be traced back to the spec section that mandates it.
 */
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
