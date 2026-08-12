import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RankingProvider, RankingRequest, RankingResponse } from "@spectrace/core";
import { artifactPaths, runAnalysis } from "../src/main/run-analysis.js";
import type { RunProgress } from "../src/shared/ipc.js";

/**
 * REQ-APP-012 AC2 (cost before and after the LLM stage) and AC3 (cancelling
 * leaves the last completed stage's artifacts intact).
 *
 * The ranking provider is injected, so the whole pipeline runs with no API
 * key, no network, and no spend — which is exactly why core takes a provider
 * interface rather than constructing one.
 */

let repo: string;

/** Deterministic stand-in for a ranking model. Counts its calls so cancellation is observable. */
function fakeProvider(options: { onCall?: (n: number) => void } = {}): RankingProvider & {
  calls: () => number;
} {
  let calls = 0;
  return {
    modelId: "fake-ranker-1",
    calls: () => calls,
    async complete(request: RankingRequest): Promise<RankingResponse> {
      calls += 1;
      options.onCall?.(calls);
      // A provider sees only prompt text — core hands it no candidate list —
      // so the symbol IDs are read back out of the prompt, exactly as a real
      // model would have to. One `implements` verdict each at high confidence,
      // so every proposal lands in the `suggest` band.
      const symbolIds = [...new Set(request.user.match(/ts:[^\s"'`,)\]]+/g) ?? [])];
      const verdicts = symbolIds.map((symbolId) => ({
        symbolId,
        classification: "implements",
        confidence: 0.9,
        rationale: "Fake verdict."
      }));
      return {
        text: JSON.stringify({ verdicts }),
        inputTokens: 100,
        outputTokens: 20
      };
    }
  };
}

const PRICING = { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10 };

function requirementDoc(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Parses a configuration file and returns its settings.
---

# ${title}

## Statement

The system shall ${title.toLowerCase()}.
`;
}

const queries = [
  { requirementId: "REQ-S-001", text: "Load configuration parse config settings file" },
  { requirementId: "REQ-S-002", text: "Format a report render output summary" }
];

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "spectrace-run-"));
  mkdirSync(path.join(repo, "specs", "requirements"), { recursive: true });
  mkdirSync(path.join(repo, "src"), { recursive: true });
  writeFileSync(
    path.join(repo, "specs", "requirements", "REQ-S-001.md"),
    requirementDoc("REQ-S-001", "Load configuration"),
    "utf8"
  );
  writeFileSync(
    path.join(repo, "specs", "requirements", "REQ-S-002.md"),
    requirementDoc("REQ-S-002", "Format a report"),
    "utf8"
  );
  writeFileSync(
    path.join(repo, "src", "config.ts"),
    "/** Parses a configuration file and returns its settings. */\n" +
      "export function loadConfiguration(path: string): Record<string, string> {\n  return {};\n}\n",
    "utf8"
  );
  writeFileSync(
    path.join(repo, "src", "report.ts"),
    "/** Renders an output summary report. */\n" +
      "export function formatReport(rows: string[]): string {\n  return rows.join(\"\\n\");\n}\n",
    "utf8"
  );
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "user.email=t@example.com", "-c", "user.name=Test", ...args], {
      encoding: "utf8"
    });
  git("init", "--quiet");
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("REQ-APP-012 AC2: cost before and after the LLM stage", () => {
  it("projects cost before ranking starts and reports measured usage after", async () => {
    const seen: RunProgress[] = [];
    let projectionSeenBeforeFirstCall: boolean | null = null;

    const provider = fakeProvider({
      onCall: (n) => {
        if (n === 1) {
          projectionSeenBeforeFirstCall = seen.some((p) => p.stage === "estimate");
        }
      }
    });

    const result = await runAnalysis({
      root: repo,
      queries,
      rankingProvider: provider,
      pricing: PRICING,
      onProgress: (progress) => seen.push(progress)
    });

    // The estimate is emitted before the model is called, not alongside it.
    expect(projectionSeenBeforeFirstCall).toBe(true);

    // Before: a projection, priced, with a positive call count.
    expect(result.projection).toMatchObject({ priced: true });
    expect(result.projection!.calls).toBeGreaterThan(0);
    expect(result.projection!.estimatedCostUsd).toBeGreaterThan(0);

    // After: measured usage, from what the provider reported.
    expect(result.usage!.run.calls).toBe(provider.calls());
    expect(result.usage!.run.inputTokens).toBe(100 * provider.calls());
    expect(result.usage!.run.outputTokens).toBe(20 * provider.calls());
  });

  it("reports an unpriced run as unpriced rather than as free", async () => {
    const result = await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    expect(result.projection).toMatchObject({ priced: false, estimatedCostUsd: 0 });
  });

  it("stops after retrieval when no ranking provider is configured", async () => {
    const result = await runAnalysis({ root: repo, queries });
    expect(result.cancelled).toBe(false);
    expect(result.proposalCount).toBeUndefined();
    // The projection still exists: knowing the cost is the point of not paying it yet.
    expect(result.projection!.calls).toBeGreaterThan(0);
    expect(existsSync(artifactPaths(repo).proposals)).toBe(false);
  });
});

describe("REQ-APP-012 AC3: cancellation leaves completed stages intact", () => {
  it("cancelling before the run starts leaves nothing written", async () => {
    const result = await runAnalysis({
      root: repo,
      queries,
      signal: { aborted: true }
    });
    expect(result).toMatchObject({ cancelled: true, cancelledDuring: "index" });
    expect(result.artifactsWritten).toEqual([]);
  });

  it("cancelling during ranking keeps the index and retrieval artifacts", async () => {
    const controller = new AbortController();
    // Abort as soon as the ranking stage is reached, before any model call.
    const result = await runAnalysis({
      root: repo,
      queries,
      rankingProvider: fakeProvider(),
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.stage === "estimate") controller.abort();
      }
    });

    expect(result.cancelled).toBe(true);
    const paths = artifactPaths(repo);
    expect(existsSync(paths.index)).toBe(true);
    expect(existsSync(paths.retrieval)).toBe(true);

    // The index artifact is complete, not truncated — a checkpoint is only
    // useful if what survives is readable.
    const header = JSON.parse(readFileSync(paths.index, "utf8").split("\n")[0]!);
    expect(header.artifact).toBe("spectrace.symbol-index");
    expect(header.symbolCount).toBeGreaterThan(0);
  });

  it("cancelling mid-ranking keeps the proposals produced so far, marked partial", async () => {
    const controller = new AbortController();
    const provider = fakeProvider({
      // Stop after the first requirement is ranked, so the second never runs.
      onCall: (n) => {
        if (n === 1) controller.abort();
      }
    });

    const result = await runAnalysis({
      root: repo,
      queries,
      rankingProvider: provider,
      signal: controller.signal
    });

    expect(result.cancelled).toBe(true);
    expect(provider.calls()).toBe(1);

    const written = JSON.parse(readFileSync(artifactPaths(repo).proposals, "utf8"));
    expect(written.partial).toBe(true);
    // Work already paid for is kept, not discarded.
    expect(written.proposals.length).toBeGreaterThan(0);
    expect(written.proposals.every((p: { requirementId: string }) => p.requirementId === "REQ-S-001")).toBe(true);
  });

  it("a completed run is not marked partial", async () => {
    await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    const written = JSON.parse(readFileSync(artifactPaths(repo).proposals, "utf8"));
    expect(written.partial).toBeUndefined();
  });
});

describe("REQ-APP-015: a linked repository directory", () => {
  /** Every path under `dir`, sorted — the whole-tree fingerprint AC2 compares. */
  const listing = (dir: string): string[] =>
    (readdirSync(dir, { recursive: true }) as string[]).map(String).sort();

  let vault: string;

  beforeEach(() => {
    // A vault that is nothing but documents: no source, no git history. If a
    // run's provenance ever came from here it would read `unknown`, which is
    // what makes AC1's commit assertion a real discriminator.
    vault = mkdtempSync(path.join(tmpdir(), "spectrace-vault-"));
    mkdirSync(path.join(vault, "specs", "requirements"), { recursive: true });
    writeFileSync(
      path.join(vault, "specs", "requirements", "REQ-S-001.md"),
      requirementDoc("REQ-S-001", "Load configuration"),
      "utf8"
    );
  });

  afterEach(() => rmSync(vault, { recursive: true, force: true }));

  it("AC1: indexes the repository's source and stamps the repository's commit", async () => {
    const result = await runAnalysis({ root: vault, repositoryRoot: repo, queries });

    // The symbols are the repository's — the vault has no TypeScript to find.
    expect(result.symbolCount).toBeGreaterThan(0);

    // Provenance is the code's HEAD, not the vault's (which has none).
    const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(result.repositoryCommit).toBe(head);

    const header = JSON.parse(readFileSync(artifactPaths(vault).index, "utf8").split("\n")[0]!);
    expect(header.repositoryCommit).toBe(head);
  });

  it("AC2: writes nothing inside the linked repository — every artifact lands in the vault", async () => {
    const before = listing(repo);
    const result = await runAnalysis({
      root: vault,
      repositoryRoot: repo,
      queries,
      rankingProvider: fakeProvider(),
      pricing: PRICING
    });

    // The repository is byte-for-byte untouched at the tree level…
    expect(listing(repo)).toEqual(before);

    // …and the full artifact set checkpointed under the vault's `.spectrace/`.
    const paths = artifactPaths(vault);
    expect(existsSync(paths.index)).toBe(true);
    expect(existsSync(paths.retrieval)).toBe(true);
    expect(existsSync(paths.proposals)).toBe(true);
    const vaultPosix = vault.replace(/\\/g, "/");
    for (const written of result.artifactsWritten) expect(written.startsWith(vaultPosix)).toBe(true);
  });

  it("AC3: a run with no linked repository is byte-identical to a single-root run", async () => {
    // `repo` is the original single-root fixture: vault and code in one place.
    const read = () =>
      (Object.values(artifactPaths(repo)) as string[]).map((artifact) => readFileSync(artifact, "utf8"));

    await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    const withoutLink = read();

    // Linking the vault to itself must be the same run, byte for byte.
    await runAnalysis({ root: repo, repositoryRoot: repo, queries, rankingProvider: fakeProvider() });
    expect(read()).toEqual(withoutLink);
  });
});

describe("run artifacts", () => {
  it("checkpoints each stage in order, and reports what it wrote", async () => {
    const result = await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    expect(result.artifactsWritten.map((p) => p.split("/").pop())).toEqual([
      "index.jsonl",
      "retrieval.json",
      "proposals.json"
    ]);
    // POSIX separators inside artifacts and reported paths (CLAUDE.md rule 4).
    for (const written of result.artifactsWritten) expect(written).not.toContain("\\");
  });

  it("bands every proposal through core, so the queue matches the CLI's", async () => {
    const result = await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    // The fake answers 0.9/implements throughout, which is above the default
    // suggest threshold — so every proposal must land in `suggest`.
    expect(result.bandCounts).toMatchObject({ review: 0, discard: 0 });
    expect(result.bandCounts!.suggest).toBe(result.proposalCount);
  });

  it("survives structuredClone, as everything crossing IPC must (rule 3)", async () => {
    const result = await runAnalysis({ root: repo, queries, rankingProvider: fakeProvider() });
    expect(structuredClone(result)).toEqual(result);
  });
});
