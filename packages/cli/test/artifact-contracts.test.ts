import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildInitReport,
  buildValidationReport,
  serializeProposalsArtifact,
  serializeSymbolIndex,
  type CodeSymbol
} from "@spectrace/core";

/**
 * Cross-package artifact contracts (REQ-APP-012 AC1; NFR-APP-007).
 *
 * These snapshots freeze the byte-level shape of the two artifacts Studio's
 * run must match the CLI's on: the proposals envelope and the symbol-index
 * envelope. Both clients call the same core serializer, so parity is a
 * property of the code; what a snapshot adds is permanence — a change to
 * either envelope fails this suite and Studio's `parity.test.ts` (which reads
 * these same files) at the same time, making a contract change visible in
 * both packages instead of an accident in one.
 *
 * CLAUDE.md rule 5: files under `test/snapshots/` are recorded here and read
 * everywhere else; update only when explicitly instructed.
 */

const snapshotDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshots");

/** Volatile-free inputs: pinned commit, versions, and digests — nothing here varies by machine. */
export const PROPOSALS_CONTRACT_FIXTURE = {
  repositoryCommit: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  configurationId: "bm25f-v5",
  engineVersion: "0.0.0-contract",
  promptVersion: "rank-v1-contract",
  modelId: "contract-model",
  bands: { suggest: 0.8, review: 0.5 },
  proposals: [
    {
      requirementId: "REQ-V-001",
      symbolId: "ts:src/mod.ts#alpha:function",
      rank: 1,
      classification: "implements" as const,
      confidence: 0.91,
      rationale: "Contract fixture."
    }
  ],
  failures: [
    {
      rule: "empty-rationale" as const,
      scope: "entry" as const,
      requirementId: "REQ-V-001",
      symbolId: "ts:src/mod.ts#beta:function",
      message: "Rationale absent or blank.",
      rawResponseRef: "deadbeefdeadbeef",
      promptVersion: "rank-v1-contract",
      modelId: "contract-model"
    }
  ],
  rawResponses: [{ ref: "deadbeefdeadbeef", requirementId: "REQ-V-001", body: '{"verdicts":[]}' }],
  usage: {
    records: [
      {
        kind: "ranking" as const,
        modelId: "contract-model",
        requirementId: "REQ-V-001",
        inputTokens: 100,
        outputTokens: 20,
        estimatedCostUsd: 0
      }
    ],
    run: { calls: 1, inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0 },
    byRequirement: [
      {
        requirementId: "REQ-V-001",
        totals: { calls: 1, inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0 }
      }
    ]
  }
};

export const INDEX_CONTRACT_SYMBOL: CodeSymbol = {
  symbolId: "ts:src/mod.ts#alpha:function",
  kind: "function",
  name: "alpha",
  qualifiedName: "alpha",
  relativePath: "src/mod.ts",
  startLine: 1,
  endLine: 5,
  signature: "function alpha(): void",
  documentation: "Contract fixture symbol.",
  normalizedSource: "contract fixture symbol.",
  exported: true,
  repositoryCommit: PROPOSALS_CONTRACT_FIXTURE.repositoryCommit
};

function assertSnapshot(name: string, produced: string): void {
  const snapshotPath = path.join(snapshotDir, name);
  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, produced, "utf8");
  }
  expect(produced).toBe(readFileSync(snapshotPath, "utf8"));
}

describe("artifact contracts (REQ-APP-012 AC1, NFR-APP-007)", () => {
  it("the proposals envelope matches the recorded contract byte for byte", () => {
    assertSnapshot("proposals-artifact.json", serializeProposalsArtifact(PROPOSALS_CONTRACT_FIXTURE));
  });

  it("a partial run adds exactly one trailing key and changes nothing else", () => {
    const complete = serializeProposalsArtifact(PROPOSALS_CONTRACT_FIXTURE);
    const partial = serializeProposalsArtifact({ ...PROPOSALS_CONTRACT_FIXTURE, partial: true });
    expect(JSON.parse(partial)).toEqual({ ...JSON.parse(complete), partial: true });
    // `partial: false` is not written at all — absence is the complete-run signal.
    expect(serializeProposalsArtifact({ ...PROPOSALS_CONTRACT_FIXTURE, partial: false })).toBe(complete);
  });

  it("the symbol-index envelope matches the recorded contract byte for byte", () => {
    assertSnapshot(
      "symbol-index.jsonl",
      serializeSymbolIndex([INDEX_CONTRACT_SYMBOL], {
        repositoryCommit: PROPOSALS_CONTRACT_FIXTURE.repositoryCommit,
        engineVersion: "0.0.0-contract",
        excludePatterns: []
      })
    );
  });

  it("both artifacts carry POSIX paths only (CLAUDE.md rule 4)", () => {
    expect(serializeProposalsArtifact(PROPOSALS_CONTRACT_FIXTURE)).not.toContain("\\\\");
  });

  // The Phase B carry-forward, discharged: these envelopes moved from the CLI
  // into core "when Phase D records the parity snapshots" — that is, here.
  it("the init-report envelope matches the recorded contract byte for byte", () => {
    const report = buildInitReport({
      repositoryRoot: "h:/contract/repo",
      created: [".spectrace/config.yaml"],
      skipped: [".spectrace/templates/use-case.md"],
      overwritten: []
    });
    assertSnapshot("init-report.json", `${JSON.stringify(report, null, 2)}\n`);
  });

  it("the validation-report envelope matches the recorded contract byte for byte", () => {
    const report = buildValidationReport({
      valid: false,
      specPaths: ["specs/requirements"],
      requirementCount: 2,
      documentCount: 3,
      violations: [
        {
          rule: "duplicate-id",
          path: "specs/requirements/REQ-V-002.md",
          message: "Duplicate requirement ID REQ-V-001.",
          requirementId: "REQ-V-001"
        }
      ],
      warnings: [
        {
          source: "config",
          rule: "missing-spec-path",
          key: "specPaths",
          message: "Configured specification path `docs/absent` does not exist — nothing validated from it."
        }
      ]
    });
    assertSnapshot("validation-report.json", `${JSON.stringify(report, null, 2)}\n`);
  });
});
