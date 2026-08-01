import { loadRawRequirements } from "./parser.js";
import { validateRequirements } from "./validator.js";
import type { RequirementLoadResult } from "./types.js";

export * from "./types.js";
export { splitSections } from "./sections.js";
export { loadRawRequirements, parseRequirementFile } from "./parser.js";
export { validateRequirements } from "./validator.js";

/** Loads every requirement file in `dir` and validates the set as a whole. */
export function loadRequirements(dir: string): RequirementLoadResult {
  const { raw, errors: parseErrors } = loadRawRequirements(dir);
  const { requirements, errors: validationErrors } = validateRequirements(raw);
  return { requirements, errors: [...parseErrors, ...validationErrors] };
}
