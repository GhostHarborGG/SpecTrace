import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { indexRepository } from "@spectrace/core";
import { loadRequirements } from "../../src/requirements/index.js";
import { retrieveForAllRequirements } from "../../src/retrieval/rank.js";

/**
 * End-to-end coverage of the pipeline pieces that exist so far: requirements
 * -> index -> retrieve (spec §18.2, §18.3 steps 1-4), with indexing and
 * retrieval provided by @spectrace/core (REQ-CORE-010/020). LLM ranking,
 * human review, and drift-scenario steps aren't implemented yet (see
 * README's status checklist), so this test stops where the harness
 * currently stops.
 */

const here = dirname(fileURLToPath(import.meta.url));
// The TypeScript fixture repo moved to core alongside the indexer tests
// (REQ-CORE-010); this integration test intentionally exercises the same
// corpus through the experiment pipeline.
const repoRoot = join(here, "..", "..", "..", "core", "test", "fixtures", "typescript-repo");
const validRequirementsDir = join(here, "..", "fixtures", "requirements", "valid");
const invalidRequirementsDir = join(here, "..", "fixtures", "requirements", "invalid");
const COMMIT = "b".repeat(40);

describe("pipeline: requirements -> index -> retrieve", () => {
  it("indexes a small TypeScript fixture and retrieves the known correct symbol for a known requirement", () => {
    const { requirements, errors: requirementErrors } = loadRequirements(validRequirementsDir);
    expect(requirementErrors).toEqual([]);

    const { symbols } = indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT });
    expect(symbols.length).toBeGreaterThan(0);

    const results = retrieveForAllRequirements(symbols, requirements, 10, COMMIT);

    const authResult = results.find((r) => r.requirementId === "REQ-AUTH-001")!;
    expect(authResult.candidates.length).toBeGreaterThan(0);
    expect(authResult.candidates[0]!.symbolId).toBe("ts:src/session.ts#SessionManager.expireInactive:method");
    expect(authResult.candidates.length).toBeLessThanOrEqual(10);
  });

  it("generates deterministic top-10 output across repeated runs of the whole pipeline", () => {
    const run = () => {
      const { requirements } = loadRequirements(validRequirementsDir);
      const { symbols } = indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT });
      return retrieveForAllRequirements(symbols, requirements, 10, COMMIT);
    };

    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("resolves an unchanged symbol's ID identically across repeated indexing runs", () => {
    const first = indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT }).symbols;
    const second = indexRepository({ repositoryRoot: repoRoot, repositoryCommit: COMMIT }).symbols;

    const findExpireInactive = (symbols: typeof first) =>
      symbols.find((s) => s.qualifiedName === "SessionManager.expireInactive")!.symbolId;

    expect(findExpireInactive(first)).toBe(findExpireInactive(second));
    expect(findExpireInactive(first)).toBe("ts:src/session.ts#SessionManager.expireInactive:method");
  });

  it("rejects a requirement set containing duplicate IDs rather than silently proceeding to retrieval", () => {
    const { requirements, errors } = loadRequirements(invalidRequirementsDir);
    expect(errors.some((e) => e.code === "duplicate_id")).toBe(true);
    // The one requirement in the invalid fixture set that does pass validation
    // (REQ-DUP-A.md — the first file to claim its ID) should still be usable,
    // demonstrating the CLI's fail-fast-on-invalid-set behavior is a policy
    // choice at the command layer, not a hard limitation of the loader.
    expect(requirements).toHaveLength(1);
  });
});
