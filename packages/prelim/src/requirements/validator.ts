import {
  ALLOWED_DIFFICULTIES,
  type Difficulty,
  type ParsedRequirement,
  type RawRequirement,
  type RequirementError,
  type RequirementLoadResult
} from "./types.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return isStringArray(value) && value.length > 0;
}

/**
 * Applies spec §6.4's rejection rules across the whole requirement set
 * (duplicate-ID detection requires seeing every file at once, so this runs
 * after all files are structurally parsed by parser.ts).
 */
export function validateRequirements(raw: RawRequirement[]): RequirementLoadResult {
  const errors: RequirementError[] = [];
  const requirements: ParsedRequirement[] = [];
  const seenIds = new Map<string, string>();

  for (const item of raw) {
    const fileErrors = validateOne(item);
    if (fileErrors.length > 0) {
      errors.push(...fileErrors);
      continue;
    }

    const id = item.frontmatter.id as string;
    const existingFile = seenIds.get(id);
    if (existingFile !== undefined) {
      errors.push({
        filePath: item.filePath,
        code: "duplicate_id",
        message: `Requirement ID "${id}" is already used by ${existingFile}.`
      });
      continue;
    }
    seenIds.set(id, item.filePath);

    requirements.push({
      filePath: item.filePath,
      id,
      title: (item.frontmatter.title as string).trim(),
      status: isNonEmptyString(item.frontmatter.status) ? item.frontmatter.status.trim() : null,
      priority: isNonEmptyString(item.frontmatter.priority) ? item.frontmatter.priority.trim() : null,
      difficulty: item.frontmatter.difficulty as Difficulty,
      sourceDocumentation: isStringArray(item.frontmatter.source_documentation)
        ? item.frontmatter.source_documentation
        : [],
      acceptanceCriteria: item.frontmatter.acceptance_criteria as string[],
      statement: item.statement as string,
      rationale: isNonEmptyString(item.rationale) ? item.rationale : null,
      notes: isNonEmptyString(item.notes) ? item.notes : null,
      rawBody: item.rawBody
    });
  }

  return { requirements, errors };
}

function validateOne(item: RawRequirement): RequirementError[] {
  const errors: RequirementError[] = [];
  const { filePath, frontmatter } = item;

  if (!isNonEmptyString(frontmatter.id)) {
    errors.push({ filePath, code: "missing_id", message: "Requirement is missing a non-empty `id`." });
  }

  if (!isNonEmptyString(frontmatter.title)) {
    errors.push({ filePath, code: "missing_title", message: "Requirement is missing a non-empty `title`." });
  }

  if (!isNonEmptyString(item.statement)) {
    errors.push({
      filePath,
      code: "missing_statement",
      message: "Requirement body is missing a non-empty `## Statement` section."
    });
  }

  if (!isNonEmptyStringArray(frontmatter.acceptance_criteria)) {
    errors.push({
      filePath,
      code: "missing_acceptance_criteria",
      message: "Requirement is missing at least one `acceptance_criteria` entry."
    });
  }

  if (!ALLOWED_DIFFICULTIES.includes(frontmatter.difficulty as Difficulty)) {
    errors.push({
      filePath,
      code: "invalid_difficulty",
      message: `Requirement \`difficulty\` must be one of ${ALLOWED_DIFFICULTIES.join(", ")}; got ${JSON.stringify(
        frontmatter.difficulty
      )}.`
    });
  }

  return errors;
}
