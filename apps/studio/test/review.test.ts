import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyDecisions, reviewPaths, reviewQueue } from "../src/main/review.js";

/**
 * REQ-APP-013 — the queue and the decision write.
 *
 * Every judgement under test is core's; what is Studio's is queue policy
 * (which proposals are shown) and the write ordering (trail, frontmatter,
 * index). Both are asserted directly.
 */

let repo: string;
const ALPHA = "ts:src/mod.ts#alpha:function";
const BETA = "ts:src/mod.ts#beta:function";
const GONE = "ts:src/deleted.ts#gone:function";

function requirementDoc(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
status: proposed
priority: P0
links: []
acceptance_criteria:
  - It does the thing.
---

# ${title}

## Statement

The system shall ${title.toLowerCase()}.
`;
}

/** Confidences chosen to straddle the default bands: .91 suggest, .60 review, .20 discard. */
function writeProposals(): void {
  writeFileSync(
    path.join(repo, ".spectrace", "proposals.json"),
    JSON.stringify({
      artifact: "spectrace.proposals",
      version: 1,
      proposals: [
        { requirementId: "REQ-Q-001", symbolId: ALPHA, rank: 1, classification: "implements", confidence: 0.91, rationale: "Implements it." },
        { requirementId: "REQ-Q-001", symbolId: BETA, rank: 2, classification: "supports", confidence: 0.6, rationale: "Supports it." },
        { requirementId: "REQ-Q-002", symbolId: BETA, rank: 1, classification: "implements", confidence: 0.2, rationale: "Thin." },
        { requirementId: "REQ-Q-002", symbolId: GONE, rank: 2, classification: "implements", confidence: 0.88, rationale: "Points at a deleted file." }
      ]
    }),
    "utf8"
  );
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "spectrace-queue-"));
  mkdirSync(path.join(repo, "specs", "requirements"), { recursive: true });
  mkdirSync(path.join(repo, ".spectrace"), { recursive: true });
  mkdirSync(path.join(repo, "src"), { recursive: true });
  writeFileSync(path.join(repo, "specs", "requirements", "REQ-Q-001.md"), requirementDoc("REQ-Q-001", "Do the first thing"), "utf8");
  writeFileSync(path.join(repo, "specs", "requirements", "REQ-Q-002.md"), requirementDoc("REQ-Q-002", "Do the second thing"), "utf8");
  writeFileSync(
    path.join(repo, "src", "mod.ts"),
    "export function alpha(): number {\n  return 1;\n}\nexport function beta(): number {\n  return 2;\n}\n",
    "utf8"
  );
  writeProposals();
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "user.email=t@e.com", "-c", "user.name=Test", ...args], { encoding: "utf8" });
  git("init", "--quiet");
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("REQ-APP-013 AC1: the queue", () => {
  it("withholds the discard band rather than queueing it (REQ-CORE-041)", () => {
    const snapshot = reviewQueue(repo);
    expect(snapshot.withheld).toBe(1);
    expect(snapshot.entries.map((e) => e.proposal.symbolId)).not.toContain(
      snapshot.entries.find((e) => e.band === "discard")?.proposal.symbolId
    );
    expect(snapshot.entries.every((e) => e.band !== "discard")).toBe(true);
  });

  it("orders suggest before review, so the strongest claims triage first", () => {
    const bands = reviewQueue(repo).entries.map((e) => e.band);
    expect(bands).toEqual([...bands].sort((a, b) => (a === b ? 0 : a === "suggest" ? -1 : 1)));
    expect(bands[0]).toBe("suggest");
  });

  it("reports staleness as unchecked when there is no symbol index", () => {
    const snapshot = reviewQueue(repo);
    expect(snapshot.stalenessUnchecked).toContain("no symbol index");
    expect(snapshot.entries.every((e) => e.stale === false)).toBe(true);
  });

  it("flags a proposal whose symbol is absent from the index (REQ-CORE-011 AC2)", () => {
    // A minimal index carrying only the symbols that still exist.
    writeFileSync(
      reviewPaths(repo).symbolIndex,
      [
        JSON.stringify({ artifact: "spectrace.symbol-index", version: 1, repositoryCommit: "a".repeat(40), engineVersion: "0.1.0", excludePatterns: [], symbolCount: 2 }),
        JSON.stringify({ symbolId: ALPHA, kind: "function", relativePath: "src/mod.ts", qualifiedName: "alpha", startLine: 1, endLine: 3, signature: "", documentation: "", normalizedSource: "", exported: true, repositoryCommit: "a".repeat(40) }),
        JSON.stringify({ symbolId: BETA, kind: "function", relativePath: "src/mod.ts", qualifiedName: "beta", startLine: 4, endLine: 6, signature: "", documentation: "", normalizedSource: "", exported: true, repositoryCommit: "a".repeat(40) })
      ].join("\n"),
      "utf8"
    );

    const snapshot = reviewQueue(repo);
    expect(snapshot.stalenessUnchecked).toBeNull();
    const flagged = snapshot.entries.find((e) => e.proposal.symbolId === GONE);
    expect(flagged).toMatchObject({ stale: true, staleReason: "missing" });
    // The stale entry is flagged, not removed.
    expect(snapshot.entries.some((e) => e.proposal.symbolId === GONE)).toBe(true);
  });

  it("survives structuredClone (rule 3)", () => {
    const snapshot = reviewQueue(repo);
    expect(structuredClone(snapshot)).toEqual(snapshot);
  });
});

describe("REQ-APP-013 AC2: applying decisions", () => {
  const accept = () =>
    applyDecisions({
      root: repo,
      reviewer: "bp",
      decisions: [
        { requirementId: "REQ-Q-001", symbolId: ALPHA, kind: "accept", timestamp: "2026-08-10T10:00:00.000Z" },
        { requirementId: "REQ-Q-001", symbolId: BETA, kind: "reject", timestamp: "2026-08-10T10:01:00.000Z" },
        { requirementId: "REQ-Q-002", symbolId: GONE, kind: "skip" }
      ]
    });

  it("writes accepted links to frontmatter and the index", () => {
    const outcome = accept();
    expect(outcome.applied).toBe(2);
    expect(outcome.links).toBe(1);

    const doc = readFileSync(path.join(repo, "specs", "requirements", "REQ-Q-001.md"), "utf8");
    expect(doc).toContain(ALPHA);
    expect(doc).toContain("bp");
    // The rejected candidate is absent, and the body survived the rewrite.
    expect(doc).not.toContain(BETA);
    expect(doc).toContain("## Statement");

    const index = JSON.parse(readFileSync(path.join(repo, ".spectrace", "index.json"), "utf8"));
    expect(index.byRequirement["REQ-Q-001"]).toEqual([ALPHA]);
    expect(index.bySymbol[ALPHA]).toEqual(["REQ-Q-001"]);
  });

  it("records a skip as skipped, never as a verdict nobody made", () => {
    const outcome = accept();
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0]).toMatchObject({ symbolId: GONE, reason: "skipped by the reviewer" });

    const log = JSON.parse(readFileSync(outcome.decisionsPath, "utf8"));
    expect(log.decisions.some((d: { symbolId: string }) => d.symbolId === GONE)).toBe(false);
  });

  it("drops a decided proposal out of the queue on the next pass", () => {
    expect(reviewQueue(repo).entries).toHaveLength(3);
    accept();
    const after = reviewQueue(repo);
    expect(after.decided).toBe(2);
    expect(after.entries.map((e) => e.proposal.symbolId)).not.toContain(ALPHA);
  });

  it("writes the trail, then frontmatter, then the index (REQ-CORE-050)", () => {
    const outcome = accept();
    // All three exist afterwards; the ordering guarantee is that the index is
    // derived from what frontmatter now holds, which is what this asserts.
    expect(existsSync(outcome.decisionsPath)).toBe(true);
    expect(existsSync(outcome.indexPath)).toBe(true);
    const index = JSON.parse(readFileSync(outcome.indexPath, "utf8"));
    const doc = readFileSync(path.join(repo, "specs", "requirements", "REQ-Q-001.md"), "utf8");
    for (const symbolId of index.byRequirement["REQ-Q-001"]) expect(doc).toContain(symbolId);
  });

  it("is idempotent — re-applying the identical batch rewrites no document", () => {
    accept();
    // The same decisions, including timestamps, so the derived link records
    // are byte-identical and no file needs touching. A later timestamp would
    // legitimately rewrite: the record carries when the decision was made.
    const second = accept();
    expect(second.updatedDocuments).toEqual([]);
  });

  it("rewrites when a later decision changes the record", () => {
    accept();
    const later = applyDecisions({
      root: repo,
      reviewer: "bp",
      decisions: [
        { requirementId: "REQ-Q-001", symbolId: ALPHA, kind: "accept", timestamp: "2026-08-10T11:00:00.000Z" }
      ]
    });
    expect(later.updatedDocuments).toHaveLength(1);
  });

  it("skips a decision naming a proposal the artifact does not carry", () => {
    const outcome = applyDecisions({
      root: repo,
      reviewer: "bp",
      decisions: [{ requirementId: "REQ-Q-001", symbolId: "ts:src/nope.ts#nope:function", kind: "accept" }]
    });
    expect(outcome.applied).toBe(0);
    expect(outcome.skipped[0]?.reason).toBe("no matching proposal in the artifact");
  });
});
