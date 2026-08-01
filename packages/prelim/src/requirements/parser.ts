import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { splitSections } from "./sections.js";
import type { RawRequirement, RequirementError } from "./types.js";

export interface RawLoadResult {
  raw: RawRequirement[];
  errors: RequirementError[];
}

/** Reads and structurally parses every `.md` file in `dir`. Does not apply field-level validation (see validator.ts). */
export function loadRawRequirements(dir: string): RawLoadResult {
  const raw: RawRequirement[] = [];
  const errors: RequirementError[] = [];

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  for (const name of files) {
    const filePath = join(dir, name);
    const result = parseRequirementFile(filePath);
    if ("error" in result) {
      errors.push(result.error);
    } else {
      raw.push(result.raw);
    }
  }

  return { raw, errors };
}

export function parseRequirementFile(
  filePath: string
): { raw: RawRequirement } | { error: RequirementError } {
  const content = readFileSync(filePath, "utf8");

  if (content.trim().length === 0) {
    return {
      error: { filePath, code: "empty_file", message: "Requirement file is empty." }
    };
  }

  let data: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    data = parsed.data;
    body = parsed.content;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      error: {
        filePath,
        code: "invalid_frontmatter",
        message: `Unreadable YAML frontmatter: ${reason}`
      }
    };
  }

  const sections = splitSections(body);

  return {
    raw: {
      filePath,
      frontmatter: {
        id: data["id"],
        title: data["title"],
        status: data["status"],
        priority: data["priority"],
        difficulty: data["difficulty"],
        source_documentation: data["source_documentation"],
        acceptance_criteria: data["acceptance_criteria"]
      },
      statement: sections.get("statement") ?? null,
      rationale: sections.get("rationale") ?? null,
      notes: sections.get("notes") ?? null,
      rawBody: body
    }
  };
}
