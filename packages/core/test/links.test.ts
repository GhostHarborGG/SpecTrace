import { describe, expect, it } from "vitest";
import type { TraceLinkRecord } from "../src/schema/types.js";
import type { AcceptedLink } from "../src/review/decisions.js";
import {
  LINK_INDEX_ARTIFACT,
  buildLinkIndex,
  coverageSummary,
  reconcileLinkIndex,
  requirementsForSymbol,
  serializeLinkIndex,
  symbolsForRequirement,
  toTraceLinkRecords,
  unlinkedRequirements,
  type RequirementLinks
} from "../src/links/link-index.js";
import { resolveLinks } from "../src/links/staleness.js";

const COMMIT = "c".repeat(40);
const LATER = "d".repeat(40);

function record(symbol: string, overrides: Partial<TraceLinkRecord> = {}): TraceLinkRecord {
  return {
    symbol,
    reviewer: "bp",
    timestamp: "2026-08-05T12:00:00.000Z",
    commit: COMMIT,
    ...overrides
  };
}

function requirement(id: string, symbols: readonly string[]): RequirementLinks {
  return { id, traceLinks: symbols.map((s) => record(s)) };
}

const VAULT: RequirementLinks[] = [
  requirement("REQ-X-001", ["ts:src/a.ts#alpha:function", "ts:src/b.ts#beta:function"]),
  requirement("REQ-X-002", ["ts:src/a.ts#alpha:function"]),
  requirement("REQ-X-003", [])
];

describe("REQ-CORE-050 dual storage", () => {
  it("AC2: rebuild from frontmatter alone reproduces the index exactly", () => {
    const first = buildLinkIndex(VAULT, COMMIT);
    const second = buildLinkIndex(VAULT, COMMIT);

    expect(second).toEqual(first);
    expect(serializeLinkIndex(second)).toBe(serializeLinkIndex(first));

    // Nothing but frontmatter went in: the same documents in a different
    // order still produce a byte-identical artifact.
    const shuffled = [VAULT[2]!, VAULT[0]!, VAULT[1]!];
    expect(serializeLinkIndex(buildLinkIndex(shuffled, COMMIT))).toBe(serializeLinkIndex(first));
  });

  it("maps both directions", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    expect(index.byRequirement["REQ-X-001"]).toEqual([
      "ts:src/a.ts#alpha:function",
      "ts:src/b.ts#beta:function"
    ]);
    expect(index.bySymbol["ts:src/a.ts#alpha:function"]).toEqual(["REQ-X-001", "REQ-X-002"]);
    expect(index.artifact).toBe(LINK_INDEX_ARTIFACT);
  });

  it("AC1: reports disagreement in both directions, and agrees when in sync", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    expect(reconcileLinkIndex(VAULT, index).agrees).toBe(true);

    // A link in frontmatter the index never picked up.
    const grown = [...VAULT, requirement("REQ-X-004", ["ts:src/c.ts#gamma:function"])];
    const missing = reconcileLinkIndex(grown, index);
    expect(missing.agrees).toBe(false);
    expect(missing.disagreements[0]!.rule).toBe("missing-from-index");

    // A link the index asserts that no document records.
    const orphaned = reconcileLinkIndex([VAULT[0]!, VAULT[2]!], index);
    expect(orphaned.disagreements.map((d) => d.rule)).toContain("absent-from-frontmatter");
  });

  it("detects a field that drifted between frontmatter and the index", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const edited: RequirementLinks[] = [
      { id: "REQ-X-001", traceLinks: [record("ts:src/a.ts#alpha:function", { reviewer: "someone-else" })] },
      VAULT[1]!,
      VAULT[2]!
    ];

    const result = reconcileLinkIndex(edited, index);
    expect(result.agrees).toBe(false);
    expect(result.disagreements.some((d) => d.rule === "field-mismatch")).toBe(true);
  });

  it("reports every disagreement in one pass rather than stopping at the first", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const rewritten = [requirement("REQ-X-009", ["ts:src/z.ts#zeta:function"])];
    const result = reconcileLinkIndex(rewritten, index);
    expect(result.disagreements.length).toBeGreaterThan(1);
  });

  it("collapses a symbol listed twice in one requirement's frontmatter", () => {
    const dup: RequirementLinks[] = [
      { id: "REQ-X-001", traceLinks: [record("ts:src/a.ts#alpha:function"), record("ts:src/a.ts#alpha:function")] }
    ];
    const index = buildLinkIndex(dup, COMMIT);
    expect(index.links).toHaveLength(1);
    expect(index.byRequirement["REQ-X-001"]).toEqual(["ts:src/a.ts#alpha:function"]);
  });

  it("converts accepted links to frontmatter records", () => {
    const accepted: AcceptedLink[] = [
      {
        requirementId: "REQ-X-001",
        symbolId: "ts:src/b.ts#beta:function",
        relationship: "supports",
        reviewer: "bp",
        timestamp: "2026-08-05T12:00:00.000Z",
        repositoryCommit: COMMIT
      },
      {
        requirementId: "REQ-X-001",
        symbolId: "ts:src/a.ts#alpha:function",
        relationship: "implements",
        reviewer: "bp",
        timestamp: "2026-08-05T12:00:00.000Z",
        repositoryCommit: COMMIT
      }
    ];

    const records = toTraceLinkRecords(accepted);
    // Sorted, and exactly the four schema fields — REQ-CORE-001 AC2's shape.
    expect(records.map((r) => r.symbol)).toEqual([
      "ts:src/a.ts#alpha:function",
      "ts:src/b.ts#beta:function"
    ]);
    expect(Object.keys(records[0]!).sort()).toEqual(["commit", "reviewer", "symbol", "timestamp"]);
  });

  it("round-trips accepted links through frontmatter into the index", () => {
    const accepted: AcceptedLink[] = [
      {
        requirementId: "REQ-X-001",
        symbolId: "ts:src/a.ts#alpha:function",
        relationship: "implements",
        reviewer: "bp",
        timestamp: "2026-08-05T12:00:00.000Z",
        repositoryCommit: COMMIT
      }
    ];
    const index = buildLinkIndex([{ id: "REQ-X-001", traceLinks: toTraceLinkRecords(accepted) }], COMMIT);
    expect(index.links[0]).toEqual({
      requirementId: "REQ-X-001",
      symbolId: "ts:src/a.ts#alpha:function",
      reviewer: "bp",
      timestamp: "2026-08-05T12:00:00.000Z",
      commit: COMMIT
    });
  });

  it("returns structuredClone-safe values (CLAUDE.md rule 3)", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    expect(() => structuredClone(index)).not.toThrow();
    expect(structuredClone(index)).toEqual(index);
  });
});

describe("REQ-CORE-051 bidirectional queries", () => {
  const index = buildLinkIndex(VAULT, COMMIT);

  it("answers code units linked to a requirement", () => {
    expect(symbolsForRequirement(index, "REQ-X-002")).toEqual(["ts:src/a.ts#alpha:function"]);
    expect(symbolsForRequirement(index, "REQ-X-003")).toEqual([]);
    expect(symbolsForRequirement(index, "REQ-NOPE")).toEqual([]);
  });

  it("answers requirements linked to a symbol", () => {
    expect(requirementsForSymbol(index, "ts:src/a.ts#alpha:function")).toEqual([
      "REQ-X-001",
      "REQ-X-002"
    ]);
    expect(requirementsForSymbol(index, "ts:src/nowhere.ts#x:function")).toEqual([]);
  });

  it("answers requirements with no accepted links", () => {
    expect(unlinkedRequirements(index, ["REQ-X-001", "REQ-X-002", "REQ-X-003", "REQ-X-004"])).toEqual([
      "REQ-X-003",
      "REQ-X-004"
    ]);
  });

  it("AC1: symbol→requirements lookup stays far inside the 500 ms budget at scale", () => {
    const requirements: RequirementLinks[] = Array.from({ length: 2_000 }, (_, r) => ({
      id: `REQ-BIG-${r}`,
      traceLinks: Array.from({ length: 5 }, (_, s) => record(`ts:src/f${(r * 5 + s) % 4_000}.ts#s:function`))
    }));
    const big = buildLinkIndex(requirements, COMMIT);
    expect(big.links).toHaveLength(10_000);

    const started = performance.now();
    for (let i = 0; i < 1_000; i += 1) {
      requirementsForSymbol(big, `ts:src/f${i % 4_000}.ts#s:function`);
    }
    const elapsed = performance.now() - started;

    // A thousand lookups, against a budget of 500 ms for one. The reverse
    // direction is materialized at build time, so this is dictionary access.
    expect(elapsed).toBeLessThan(500);
  });

  it("AC2: coverage totals reconcile with per-requirement states exactly", () => {
    const summary = coverageSummary(index, ["REQ-X-001", "REQ-X-002", "REQ-X-003"]);

    expect(summary.total).toBe(summary.byRequirement.length);
    expect(summary.linked + summary.stale + summary.unlinked).toBe(summary.total);
    expect(summary.linkTotal).toBe(
      summary.byRequirement.reduce((sum, row) => sum + row.linkCount, 0)
    );
    expect(summary.brokenLinkTotal).toBe(
      summary.byRequirement.reduce((sum, row) => sum + row.brokenLinkCount, 0)
    );
    expect(summary).toMatchObject({ total: 3, linked: 2, stale: 0, unlinked: 1, linkTotal: 3 });
  });

  it("counts a requirement whose links are all broken as stale, not linked", () => {
    const summary = coverageSummary(
      index,
      ["REQ-X-001", "REQ-X-002", "REQ-X-003"],
      new Set(["ts:src/a.ts#alpha:function"])
    );

    // REQ-X-002's only link is broken; REQ-X-001 still has a live one.
    expect(summary).toMatchObject({ linked: 1, stale: 1, unlinked: 1 });
    expect(summary.linked + summary.stale + summary.unlinked).toBe(summary.total);
    expect(summary.brokenLinkTotal).toBe(2);
  });
});

describe("REQ-CORE-052 stale link resolution", () => {
  it("AC1: deleting a linked symbol leaves the link present and flagged, with its last-resolved commit", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const beforeCount = index.links.length;

    // Re-index at a later commit where alpha no longer exists.
    const report = resolveLinks({
      index,
      knownSymbolIds: new Set(["ts:src/b.ts#beta:function"]),
      repositoryCommit: LATER
    });

    // Present: nothing was dropped.
    expect(report.resolutions).toHaveLength(beforeCount);
    expect(index.links).toHaveLength(beforeCount);

    // Flagged, with the last commit it is known to have resolved at.
    const broken = report.broken;
    expect(broken).toHaveLength(2);
    for (const entry of broken) {
      expect(entry.symbolId).toBe("ts:src/a.ts#alpha:function");
      expect(entry.resolved).toBe(false);
      expect(entry.lastResolvedCommit).toBe(COMMIT);
      expect(entry.checkedCommit).toBe(LATER);
    }
  });

  it("advances last-resolved commit while a link still resolves", () => {
    const index = buildLinkIndex([requirement("REQ-X-001", ["ts:src/b.ts#beta:function"])], COMMIT);
    const known = new Set(["ts:src/b.ts#beta:function"]);

    const first = resolveLinks({ index, knownSymbolIds: known, repositoryCommit: LATER });
    expect(first.resolutions[0]!.lastResolvedCommit).toBe(LATER);

    // Now it breaks — the advanced marker is carried forward, not reset.
    const second = resolveLinks({
      index,
      knownSymbolIds: new Set(),
      repositoryCommit: "e".repeat(40),
      previous: first.resolutions
    });
    expect(second.broken[0]!.lastResolvedCommit).toBe(LATER);
    expect(second.broken[0]!.checkedCommit).toBe("e".repeat(40));
  });

  it("reports every link, resolved or not, in index order", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const report = resolveLinks({
      index,
      knownSymbolIds: new Set(["ts:src/a.ts#alpha:function", "ts:src/b.ts#beta:function"]),
      repositoryCommit: COMMIT
    });

    expect(report.broken).toEqual([]);
    expect(report.brokenSymbolIds.size).toBe(0);
    expect(report.resolutions.map((r) => `${r.requirementId}/${r.symbolId}`)).toEqual(
      index.links.map((l) => `${l.requirementId}/${l.symbolId}`)
    );
    expect(report.resolutions.every((r) => r.resolved)).toBe(true);
  });

  it("feeds coverage: a broken symbol makes its sole-linked requirement stale", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const report = resolveLinks({
      index,
      knownSymbolIds: new Set(["ts:src/b.ts#beta:function"]),
      repositoryCommit: LATER
    });
    const summary = coverageSummary(
      index,
      ["REQ-X-001", "REQ-X-002", "REQ-X-003"],
      report.brokenSymbolIds
    );

    expect(summary).toMatchObject({ linked: 1, stale: 1, unlinked: 1 });
  });

  it("never removes a link from the index it was given", () => {
    const index = buildLinkIndex(VAULT, COMMIT);
    const snapshot = structuredClone(index);
    resolveLinks({ index, knownSymbolIds: new Set(), repositoryCommit: LATER });
    expect(index).toEqual(snapshot);
  });
});
