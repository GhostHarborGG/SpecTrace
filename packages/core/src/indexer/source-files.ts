import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExclusionMatcher } from "./exclusions.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const DECLARATION_SUFFIX = ".d.ts";
const CONTENT_SAMPLE_LENGTH = 500;

/**
 * Walks `root`, returning repository-relative (forward-slash, sorted) paths
 * of every `.ts`/`.tsx`/`.js`/`.jsx` source file that survives exclusion.
 * Excluded directories are pruned rather than descended into. `.d.ts` files
 * are skipped: they hold only ambient declarations with no implementation
 * body, which is exactly what the indexer requires for functions and
 * methods (spec §8.1).
 */
export function collectSourceFiles(root: string, matcher: ExclusionMatcher): string[] {
  const results: string[] = [];

  function walk(currentAbsolute: string, currentRelative: string): void {
    const entries = [...readdirSync(currentAbsolute, { withFileTypes: true })].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const entry of entries) {
      const entryRelative = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      const entryAbsolute = join(currentAbsolute, entry.name);

      if (entry.isDirectory()) {
        if (matcher.isExcludedDirectory(entryRelative)) continue;
        walk(entryAbsolute, entryRelative);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      if (entry.name.endsWith(DECLARATION_SUFFIX)) continue;

      const sample = readFileSync(entryAbsolute, "utf8").slice(0, CONTENT_SAMPLE_LENGTH);
      if (matcher.isExcludedFile(entryRelative, sample)) continue;

      results.push(entryRelative);
    }
  }

  walk(root, "");
  return results;
}
