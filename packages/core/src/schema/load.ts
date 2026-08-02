/**
 * The filesystem boundary for requirement documents (REQ-CORE-001). Paths are
 * converted to vault-relative POSIX form here and nowhere else
 * (CLAUDE.md rule 4).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { RequirementDocument } from "./parse.js";

export interface LoadOptions {
  /** Recurse into subdirectories. Default true. */
  recursive?: boolean;
}

function walk(directory: string, recursive: boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) found.push(...walk(full, recursive));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Reads every `.md` file under `vaultDir`, sorted by path so callers get a
 * deterministic order. Throws if the directory cannot be read; malformed
 * *contents* are a validation concern, not a load failure.
 */
export function readRequirementDocuments(vaultDir: string, options: LoadOptions = {}): RequirementDocument[] {
  const recursive = options.recursive ?? true;
  return walk(vaultDir, recursive)
    .map((full) => ({
      path: relative(vaultDir, full).replaceAll("\\", "/"),
      content: readFileSync(full, "utf8")
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
