import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { coverageReport, linkQueries, readVaultLinkState } from "../src/main/coverage.js";

/**
 * NFR-APP-007 parity.
 *
 * The snapshot is the CLI's own recorded contract file — not a copy — so a
 * change to either client's output fails here and in `packages/cli` at the
 * same time. Both clients build the envelope with core's
 * `buildCoverageReport`, so this suite confirms the wiring rather than
 * policing two implementations. (CLAUDE.md rule 5: the snapshot is read, never
 * written, from this side.)
 */
const snapshotPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "cli",
  "test",
  "snapshots",
  "coverage-report.json"
);

let repo: string;
const ALPHA = "ts:src/mod.ts#alpha:function";
const COMMIT = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const reqDir = () => path.join(repo, "specs", "requirements");

function requirementDoc(id: string, title: string, links: string): string {
  return `---
id: ${id}
title: ${title}
status: proposed
priority: P0
links:${links}
acceptance_criteria:
  - It does the thing.
---

# ${title}

## Statement

The system shall ${title.toLowerCase()}.
`;
}

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "spectrace-parity-"));
  mkdirSync(reqDir(), { recursive: true });

  // The same vault the CLI suite records its snapshot from: REQ-V-001 linked
  // to alpha by an accepted decision, REQ-V-002 unlinked.
  writeFileSync(
    path.join(reqDir(), "REQ-V-001.md"),
    requirementDoc(
      "REQ-V-001",
      "Do the first thing",
      // Quoted deliberately: an all-numeric SHA would parse as a YAML number
      // and be rejected as a malformed link. Our own writer quotes it; a
      // hand-edited document might not, and it fails loudly when it does not.
      `\n  - symbol: ${ALPHA}\n    reviewer: bp\n    timestamp: '2026-08-06T10:00:00.000Z'\n    commit: '${COMMIT}'`
    ),
    "utf8"
  );
  writeFileSync(
    path.join(reqDir(), "REQ-V-002.md"),
    requirementDoc("REQ-V-002", "Do the second thing", " []"),
    "utf8"
  );
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("Studio ↔ CLI parity (NFR-APP-007, REQ-APP-012 AC1)", () => {
  it("emits the recorded coverage contract byte-for-byte at the shape level", () => {
    const report = coverageReport({ root: repo });

    // Commit and engine version vary by machine and release, exactly as the
    // CLI's own snapshot test normalizes them.
    const normalized = { ...report, repositoryCommit: "<commit>", engineVersion: "<version>" };
    const recorded = JSON.parse(readFileSync(snapshotPath, "utf8"));

    expect(normalized).toEqual(recorded);
  });

  it("serializes identically to the recorded contract", () => {
    const report = coverageReport({ root: repo });
    const normalized = { ...report, repositoryCommit: "<commit>", engineVersion: "<version>" };

    // Key order matters for a byte-for-byte claim, so compare the text, not
    // just the value.
    expect(`${JSON.stringify(normalized, null, 2)}\n`).toBe(readFileSync(snapshotPath, "utf8"));
  });

  it("reports staleness as unchecked without a symbol index", () => {
    const report = coverageReport({ root: repo });
    expect(report.stalenessChecked).toBe(false);
    expect(report.brokenLinks).toBeUndefined();
  });

  it("flags a link whose symbol no longer resolves, without dropping it", () => {
    const indexPath = path.join(repo, "symbols.jsonl");
    writeFileSync(
      indexPath,
      `${JSON.stringify({
        symbolId: "ts:src/mod.ts#beta:function",
        kind: "function",
        name: "beta",
        qualifiedName: "beta",
        relativePath: "src/mod.ts",
        startLine: 1,
        endLine: 4,
        signature: "function beta(): void",
        documentation: "",
        normalizedSource: "function beta() {}",
        exported: true,
        repositoryCommit: "f".repeat(40)
      })}\n`,
      "utf8"
    );

    const report = coverageReport({ root: repo, indexPath });
    expect(report.stalenessChecked).toBe(true);
    expect(report.summary).toMatchObject({ linked: 0, stale: 1, unlinked: 1 });
    expect(report.brokenLinks).toHaveLength(1);
    expect(report.brokenLinks![0]!.symbolId).toBe(ALPHA);
  });

  it("totals reconcile with the per-requirement rows (REQ-CORE-051 AC2)", () => {
    const { summary, requirements } = coverageReport({ root: repo });
    expect(summary.linked + summary.stale + summary.unlinked).toBe(summary.total);
    expect(summary.total).toBe(requirements.length);
    expect(summary.linkTotal).toBe(requirements.reduce((n, r) => n + r.linkCount, 0));
  });

  it("answers the same bidirectional queries the CLI does (REQ-CORE-051)", () => {
    const queries = linkQueries({ root: repo });
    expect(queries.symbolsFor("REQ-V-001")).toEqual([ALPHA]);
    expect(queries.requirementsFor(ALPHA)).toEqual(["REQ-V-001"]);
    expect(queries.unlinked()).toEqual(["REQ-V-002"]);
  });

  it("builds the link index from frontmatter alone (REQ-CORE-050 AC2)", () => {
    const state = readVaultLinkState({ root: repo });
    expect(state.requirements.map((r) => r.id)).toEqual(["REQ-V-001", "REQ-V-002"]);
    expect(state.index.byRequirement["REQ-V-001"]).toEqual([ALPHA]);
    expect(state.index.links).toHaveLength(1);
  });

  it("returns structuredClone-safe values across the IPC boundary (CLAUDE.md rule 3)", () => {
    const report = coverageReport({ root: repo });
    expect(() => structuredClone(report)).not.toThrow();
    expect(structuredClone(report)).toEqual(report);
  });
});
