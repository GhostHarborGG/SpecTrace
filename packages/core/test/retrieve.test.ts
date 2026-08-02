import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { indexRepository } from "../src/indexer/typescript-indexer.js";
import { retrieveCandidates } from "../src/retrieval/retrieve.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "fixtures", "typescript-repo");
const COMMIT = "c".repeat(40);

describe("retrieveCandidates — lexical retrieval, Configuration A (REQ-CORE-020)", () => {
  const { symbols } = indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT });

  it("AC1: with no API settings of any kind, retrieval completes and emits rank-measurable output", () => {
    // No model, embedding, or network configuration exists anywhere in this
    // call chain — the function only sees in-memory symbols and query text.
    const [result] = retrieveCandidates({
      queries: [{ requirementId: "REQ-AUTH-001", text: "expire an inactive session after a timeout" }],
      symbols,
      topK: 10,
      repositoryCommit: COMMIT
    });

    expect(result!.requirementId).toBe("REQ-AUTH-001");
    expect(result!.candidates.length).toBeGreaterThan(0);
    expect(result!.candidates.length).toBeLessThanOrEqual(10);
    expect(result!.candidates[0]!.rank).toBe(1);
    expect(result!.candidates.map((c) => c.rank)).toEqual(
      result!.candidates.map((_, i) => i + 1)
    );
    expect(result!.configurationId).toBe("bm25f-v4");
    expect(result!.repositoryCommit).toBe(COMMIT);
  });

  it("AC2: retrieval operates on the prebuilt symbol set only — no repository path ever reaches it", () => {
    // Structural guarantee: the API takes symbols, not a repo directory, so a
    // per-run full-text rescan is impossible by construction. Verify the
    // results are a pure function of (symbols, query, config).
    const run = () =>
      retrieveCandidates({
        queries: [{ requirementId: "REQ-AUTH-001", text: "session expiry" }],
        symbols,
        topK: 5,
        repositoryCommit: COMMIT
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("returns values that survive structuredClone (CLAUDE.md rule 3 / Electron IPC)", () => {
    const results = retrieveCandidates({
      queries: [{ requirementId: "REQ-AUTH-001", text: "expire inactive session" }],
      symbols,
      topK: 3,
      repositoryCommit: COMMIT
    });
    expect(structuredClone(results)).toEqual(results);
  });

  it("respects topK from configuration", () => {
    const [result] = retrieveCandidates({
      queries: [{ requirementId: "REQ-AUTH-001", text: "session" }],
      symbols,
      topK: 1,
      repositoryCommit: COMMIT
    });
    expect(result!.candidates).toHaveLength(1);
  });
});
