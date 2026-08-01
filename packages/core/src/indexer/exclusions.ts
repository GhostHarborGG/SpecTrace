import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// The `ignore` package is CommonJS-only with a dual-style .d.ts that TypeScript's
// NodeNext resolution mis-resolves to the module namespace rather than the callable
// default export. Loading it via createRequire and typing it locally sidesteps that
// interop mismatch instead of fighting the ambient types.
const require = createRequire(import.meta.url);
const ignoreFactory: (options?: { ignorecase?: boolean }) => Ignore = require("ignore");

interface Ignore {
  add(patterns: string | readonly string[]): Ignore;
  ignores(pathname: string): boolean;
}

/** Directory names excluded regardless of .gitignore contents (REQ-CORE-011; prelim spec §8.4). */
const DEFAULT_EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".nyc_output",
  "vendor",
  "third_party",
  "generated"
]);

const MINIFIED_FILE_PATTERN = /\.min\.[cm]?[jt]sx?$/i;
const GENERATED_MARKER_PATTERN = /@generated|do not edit|automatically generated|auto-generated/i;

export interface ExclusionConfig {
  repositoryRoot: string;
  /** Extra gitignore-style patterns from configuration (REQ-CORE-011). */
  additionalPatterns?: readonly string[];
}

/**
 * Decides whether a directory or file is excluded from indexing
 * (REQ-CORE-011). Directory exclusion is checked separately from file exclusion so
 * callers can prune whole subtrees (e.g. `node_modules`) without descending
 * into them.
 */
export class ExclusionMatcher {
  private readonly gitignoreMatcher: Ignore | null;
  private readonly additionalMatcher: Ignore | null;

  constructor(config: ExclusionConfig) {
    const gitignorePath = join(config.repositoryRoot, ".gitignore");
    this.gitignoreMatcher = existsSync(gitignorePath)
      ? ignoreFactory().add(readFileSync(gitignorePath, "utf8"))
      : null;

    this.additionalMatcher =
      config.additionalPatterns && config.additionalPatterns.length > 0
        ? ignoreFactory().add([...config.additionalPatterns])
        : null;
  }

  /** `relativePath` must be repository-relative and use forward slashes. */
  isExcludedDirectory(relativePath: string): boolean {
    const name = relativePath.split("/").pop() ?? relativePath;
    if (DEFAULT_EXCLUDED_DIRECTORY_NAMES.has(name)) return true;
    const withSlash = relativePath.endsWith("/") ? relativePath : `${relativePath}/`;
    if (this.gitignoreMatcher?.ignores(withSlash)) return true;
    if (this.additionalMatcher?.ignores(withSlash)) return true;
    return false;
  }

  /**
   * `contentSample` (a short prefix of the file's text, if available) is used
   * only to detect a "generated file" marker comment — a heuristic, not a
   * semantic build-tool check.
   */
  isExcludedFile(relativePath: string, contentSample?: string): boolean {
    if (MINIFIED_FILE_PATTERN.test(relativePath)) return true;
    if (this.gitignoreMatcher?.ignores(relativePath)) return true;
    if (this.additionalMatcher?.ignores(relativePath)) return true;
    if (contentSample && GENERATED_MARKER_PATTERN.test(contentSample)) return true;
    return false;
  }
}
