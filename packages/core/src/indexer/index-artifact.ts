/**
 * Local index artifact (REQ-CORE-012): the documented on-disk format for an
 * extracted symbol index.
 *
 * JSONL — one header line carrying the provenance that produced the index,
 * then one line per symbol in the indexer's deterministic order. The same
 * shape as the run artifacts (REQ-CORE-071), for the same reason: a header
 * that says how the bytes were made, and records that stream.
 *
 * Two properties the format is built around:
 *
 * 1. **Byte-identical rebuild** (REQ-CORE-012 AC1). Nothing here is
 *    timestamped or environment-derived, and every symbol is written through
 *    an explicit field projection rather than whatever key order the indexer
 *    happened to construct — so serialization cannot drift when an unrelated
 *    change reorders an object literal.
 * 2. **Nothing exists only in the index.** Every header field is either an
 *    input to indexing (`repositoryCommit`, `excludePatterns`) or a fact
 *    about the engine that produced it (`engineVersion`), and every symbol
 *    field is derived from repository content. Deleting the artifact loses
 *    no information.
 *
 * Pure string ↔ object transforms; the filesystem stays at the caller's
 * boundary. Paths inside symbols are already POSIX (CLAUDE.md rule 4).
 */

import type { CodeSymbol } from "./types.js";

export const SYMBOL_INDEX_ARTIFACT = "spectrace.symbol-index";
export const SYMBOL_INDEX_VERSION = 1;

/**
 * The inputs that produced an index. Reproducing them and re-running the
 * indexer reproduces the artifact byte for byte, which is what makes the
 * stored copy disposable.
 */
export interface SymbolIndexProvenance {
  repositoryCommit: string;
  engineVersion: string;
  /** Configured patterns beyond the built-in defaults (REQ-CORE-011); order-preserving. */
  excludePatterns: string[];
}

export interface SymbolIndexHeader extends SymbolIndexProvenance {
  artifact: typeof SYMBOL_INDEX_ARTIFACT;
  version: number;
  symbolCount: number;
}

export interface ParsedSymbolIndex {
  /** Null for a legacy headerless index (the Phase A/B `spectrace index` output). */
  provenance: SymbolIndexProvenance | null;
  symbols: CodeSymbol[];
}

export class IndexArtifactFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexArtifactFormatError";
  }
}

/**
 * Serialized field order for a symbol record. Declaring it explicitly is what
 * makes AC1 hold under refactoring: `JSON.stringify` follows insertion order,
 * so without this the byte layout would silently depend on the order of an
 * object literal in the indexer.
 */
const SYMBOL_FIELDS = [
  "symbolId",
  "kind",
  "name",
  "qualifiedName",
  "relativePath",
  "startLine",
  "endLine",
  "signature",
  "documentation",
  "normalizedSource",
  "exported",
  "repositoryCommit"
] as const satisfies readonly (keyof CodeSymbol)[];

function projectSymbol(symbol: CodeSymbol): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of SYMBOL_FIELDS) record[field] = symbol[field];
  return record;
}

export function serializeSymbolIndex(
  symbols: readonly CodeSymbol[],
  provenance: SymbolIndexProvenance
): string {
  const header: SymbolIndexHeader = {
    artifact: SYMBOL_INDEX_ARTIFACT,
    version: SYMBOL_INDEX_VERSION,
    repositoryCommit: provenance.repositoryCommit,
    engineVersion: provenance.engineVersion,
    excludePatterns: [...provenance.excludePatterns],
    symbolCount: symbols.length
  };
  const lines = [JSON.stringify(header), ...symbols.map((s) => JSON.stringify(projectSymbol(s)))];
  return lines.join("\n") + "\n";
}

/**
 * Parses an index artifact. Files written before the header existed parse
 * with null provenance rather than failing, so indexes produced by the
 * Phase A/B command stay consumable by `analyze` without a rebuild.
 */
export function parseSymbolIndex(text: string): ParsedSymbolIndex {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = lines.map((line, i) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new IndexArtifactFormatError(`Line ${i + 1} is not valid JSON: ${reason}`);
    }
  });

  let provenance: SymbolIndexProvenance | null = null;
  let symbolRecords = records;

  const first = records[0];
  if (first !== undefined && first["artifact"] === SYMBOL_INDEX_ARTIFACT) {
    if (first["version"] !== SYMBOL_INDEX_VERSION) {
      throw new IndexArtifactFormatError(
        `Unsupported index artifact version ${JSON.stringify(first["version"])}; this engine reads version ${SYMBOL_INDEX_VERSION}.`
      );
    }
    const header = first as unknown as SymbolIndexHeader;
    provenance = {
      repositoryCommit: header.repositoryCommit,
      engineVersion: header.engineVersion,
      excludePatterns: Array.isArray(header.excludePatterns) ? [...header.excludePatterns] : []
    };
    symbolRecords = records.slice(1);

    if (typeof header.symbolCount === "number" && header.symbolCount !== symbolRecords.length) {
      throw new IndexArtifactFormatError(
        `Index header declares ${header.symbolCount} symbol(s) but the file carries ${symbolRecords.length}.`
      );
    }
  }

  const symbols = symbolRecords.map((record, i) => {
    if (typeof record["symbolId"] !== "string" || typeof record["relativePath"] !== "string") {
      throw new IndexArtifactFormatError(
        `Record ${i + 1} is not a symbol (expected \`symbolId\` and \`relativePath\`).`
      );
    }
    return record as unknown as CodeSymbol;
  });

  return { provenance, symbols };
}

/**
 * Whether an index on disk was produced by the inputs a caller is about to
 * index with — the check behind `spectrace index`'s reuse path, and the
 * reason `--rebuild` exists to bypass it (REQ-CLI-003 AC2).
 *
 * Deliberately conservative: any difference in commit, engine version, or
 * exclusion set means "not current". Per-file incremental scoping is
 * REQ-CORE-060 (Phase F) and is not attempted here.
 */
export function isIndexCurrent(
  stored: SymbolIndexProvenance | null,
  wanted: SymbolIndexProvenance
): boolean {
  if (stored === null) return false;
  return (
    stored.repositoryCommit === wanted.repositoryCommit &&
    stored.engineVersion === wanted.engineVersion &&
    stored.excludePatterns.length === wanted.excludePatterns.length &&
    stored.excludePatterns.every((p, i) => p === wanted.excludePatterns[i])
  );
}
