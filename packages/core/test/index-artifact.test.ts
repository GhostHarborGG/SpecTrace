import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { indexRepository } from "../src/indexer/typescript-indexer.js";
import {
  IndexArtifactFormatError,
  SYMBOL_INDEX_ARTIFACT,
  SYMBOL_INDEX_VERSION,
  isIndexCurrent,
  parseSymbolIndex,
  serializeSymbolIndex,
  type SymbolIndexProvenance
} from "../src/indexer/index-artifact.js";
import type { CodeSymbol } from "../src/indexer/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "fixtures", "typescript-repo");
const COMMIT = "a".repeat(40);

const provenance: SymbolIndexProvenance = {
  repositoryCommit: COMMIT,
  engineVersion: "0.1.0",
  excludePatterns: []
};

function indexFixture(): CodeSymbol[] {
  return indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT }).symbols;
}

describe("index artifact — byte-identical rebuild (REQ-CORE-012 AC1)", () => {
  it("writes, deletes and rebuilds the index at the same commit to identical bytes", () => {
    const scratch = mkdtempSync(join(tmpdir(), "spectrace-index-artifact-"));
    const artifactPath = join(scratch, "index.jsonl");
    try {
      writeFileSync(artifactPath, serializeSymbolIndex(indexFixture(), provenance), "utf8");
      const first = readFileSync(artifactPath, "utf8");

      rmSync(artifactPath);
      // Rebuilt from the repository alone — the deleted file contributes nothing.
      writeFileSync(artifactPath, serializeSymbolIndex(indexFixture(), provenance), "utf8");

      expect(readFileSync(artifactPath, "utf8")).toBe(first);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("carries no timestamp or other non-reproducible field", () => {
    const text = serializeSymbolIndex(indexFixture(), provenance);
    const header = JSON.parse(text.split("\n")[0]!) as Record<string, unknown>;
    expect(Object.keys(header).sort()).toEqual([
      "artifact",
      "engineVersion",
      "excludePatterns",
      "repositoryCommit",
      "symbolCount",
      "version"
    ]);
  });

  it("serializes symbol fields in a fixed order regardless of key insertion order", () => {
    const symbols = indexFixture();
    const shuffled = symbols.map((s) => {
      const reversed: Record<string, unknown> = {};
      for (const key of Object.keys(s).reverse()) reversed[key] = (s as unknown as Record<string, unknown>)[key];
      return reversed as unknown as CodeSymbol;
    });
    expect(serializeSymbolIndex(shuffled, provenance)).toBe(serializeSymbolIndex(symbols, provenance));
  });
});

describe("index artifact — format", () => {
  it("round-trips through parse with provenance intact", () => {
    const symbols = indexFixture();
    const p: SymbolIndexProvenance = { ...provenance, excludePatterns: ["docs/**", "*.spec.ts"] };
    const parsed = parseSymbolIndex(serializeSymbolIndex(symbols, p));
    expect(parsed.provenance).toEqual(p);
    expect(parsed.symbols).toEqual(symbols);
    expect(serializeSymbolIndex(parsed.symbols, parsed.provenance!)).toBe(serializeSymbolIndex(symbols, p));
  });

  it("names the artifact and version in its header", () => {
    const header = JSON.parse(serializeSymbolIndex(indexFixture(), provenance).split("\n")[0]!);
    expect(header.artifact).toBe(SYMBOL_INDEX_ARTIFACT);
    expect(header.version).toBe(SYMBOL_INDEX_VERSION);
    expect(header.symbolCount).toBe(indexFixture().length);
  });

  it("serializes an empty index as a header line and nothing else", () => {
    const text = serializeSymbolIndex([], provenance);
    expect(text.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
    expect(parseSymbolIndex(text).symbols).toEqual([]);
  });

  it("parses a legacy headerless index with null provenance", () => {
    const symbols = indexFixture();
    const legacy = symbols.map((s) => JSON.stringify(s)).join("\n") + "\n";
    const parsed = parseSymbolIndex(legacy);
    expect(parsed.provenance).toBeNull();
    expect(parsed.symbols).toEqual(symbols);
  });

  it("rejects a truncated index whose header count no longer matches", () => {
    const lines = serializeSymbolIndex(indexFixture(), provenance).trimEnd().split("\n");
    const truncated = lines.slice(0, -1).join("\n") + "\n";
    expect(() => parseSymbolIndex(truncated)).toThrow(IndexArtifactFormatError);
  });

  it("rejects an unsupported artifact version rather than misreading it", () => {
    const text = serializeSymbolIndex(indexFixture(), provenance);
    const bumped = text.replace(`"version":${SYMBOL_INDEX_VERSION}`, `"version":${SYMBOL_INDEX_VERSION + 1}`);
    expect(() => parseSymbolIndex(bumped)).toThrow(/Unsupported index artifact version/);
  });

  it("rejects a line that is not JSON, naming the line", () => {
    expect(() => parseSymbolIndex("{not json}\n")).toThrow(/Line 1 is not valid JSON/);
  });

  it("rejects a record that is not a symbol", () => {
    expect(() => parseSymbolIndex(`${JSON.stringify({ nope: true })}\n`)).toThrow(/is not a symbol/);
  });
});

describe("isIndexCurrent — the reuse check behind --rebuild (REQ-CLI-003 AC2)", () => {
  it("is true only for identical inputs", () => {
    expect(isIndexCurrent(provenance, provenance)).toBe(true);
  });

  it("is false for a missing header, a different commit, engine, or exclusion set", () => {
    expect(isIndexCurrent(null, provenance)).toBe(false);
    expect(isIndexCurrent({ ...provenance, repositoryCommit: "b".repeat(40) }, provenance)).toBe(false);
    expect(isIndexCurrent({ ...provenance, engineVersion: "0.2.0" }, provenance)).toBe(false);
    expect(isIndexCurrent({ ...provenance, excludePatterns: ["docs/**"] }, provenance)).toBe(false);
  });

  it("treats exclusion order as significant — patterns are order-dependent in gitignore semantics", () => {
    const a = { ...provenance, excludePatterns: ["a/**", "!a/keep.ts"] };
    const b = { ...provenance, excludePatterns: ["!a/keep.ts", "a/**"] };
    expect(isIndexCurrent(a, b)).toBe(false);
  });
});

describe("index artifact — structuredClone safety (CLAUDE.md rule 3)", () => {
  it("survives structuredClone", () => {
    const parsed = parseSymbolIndex(serializeSymbolIndex(indexFixture(), provenance));
    expect(structuredClone(parsed)).toEqual(parsed);
  });

  it("holds POSIX paths only (CLAUDE.md rule 4)", () => {
    const text = serializeSymbolIndex(indexFixture(), provenance);
    expect(text).not.toContain("\\\\");
    for (const symbol of parseSymbolIndex(text).symbols) {
      expect(symbol.relativePath).not.toContain("\\");
      expect(symbol.symbolId).not.toContain("\\");
    }
  });
});
