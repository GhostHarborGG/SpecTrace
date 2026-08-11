import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts");
const snapshotDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshots");

// See cli.test.ts: `npx` lets npm's "Unknown env config" warning into the stdout
// these tests parse as JSON. Spawn tsx's resolved CLI under this Node instead.
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

function run(args: string[], env?: NodeJS.ProcessEnv): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [tsxCli, entry, ...args], {
      encoding: "utf8",
      ...(env ? { env } : {})
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? -1 };
  }
}

let repo: string;
const reqDir = () => path.join(repo, "specs", "requirements");
const proposalsPath = () => path.join(repo, "proposals.json");
const ALPHA = "ts:src/mod.ts#alpha:function";
const BETA = "ts:src/mod.ts#beta:function";

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

/** A proposals artifact shaped like `analyze --proposals` output. */
function writeProposals(): void {
  writeFileSync(
    proposalsPath(),
    JSON.stringify({
      artifact: "spectrace.proposals",
      version: 1,
      proposals: [
        {
          requirementId: "REQ-V-001",
          symbolId: ALPHA,
          rank: 1,
          classification: "implements",
          confidence: 0.91,
          rationale: "Implements the described behaviour."
        },
        {
          requirementId: "REQ-V-001",
          symbolId: BETA,
          rank: 2,
          classification: "supports",
          confidence: 0.62,
          rationale: "Called by the implementation."
        },
        {
          requirementId: "REQ-V-002",
          symbolId: BETA,
          rank: 1,
          classification: "implements",
          confidence: 0.2,
          rationale: "Thin evidence."
        }
      ]
    }),
    "utf8"
  );
}

function writeBatch(name: string, decisions: unknown[]): string {
  const file = path.join(repo, name);
  writeFileSync(file, JSON.stringify({ decisions }), "utf8");
  return file;
}

/** Applies the standard batch: accept alpha, reject beta on 001, skip 002. */
function applyStandardBatch(): { stdout: string; status: number } {
  const batch = writeBatch("batch.json", [
    { requirementId: "REQ-V-001", symbolId: ALPHA, kind: "accept", timestamp: "2026-08-06T10:00:00.000Z" },
    { requirementId: "REQ-V-001", symbolId: BETA, kind: "reject", timestamp: "2026-08-06T10:01:00.000Z" },
    { requirementId: "REQ-V-002", symbolId: BETA, kind: "skip" }
  ]);
  return run([
    "review",
    "--repo", repo,
    "--proposals", proposalsPath(),
    "--decide", batch,
    "--reviewer", "bp",
    "--json"
  ]);
}

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "spectrace-vault-"));
  mkdirSync(reqDir(), { recursive: true });
  writeFileSync(path.join(reqDir(), "REQ-V-001.md"), requirementDoc("REQ-V-001", "Do the first thing"), "utf8");
  writeFileSync(path.join(reqDir(), "REQ-V-002.md"), requirementDoc("REQ-V-002", "Do the second thing"), "utf8");
  writeProposals();
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("spectrace review (REQ-CLI-005)", () => {
  it("AC3: applies a JSON decision batch without a TTY", () => {
    const { stdout, status } = applyStandardBatch();
    expect(status).toBe(0);

    const report = JSON.parse(stdout);
    expect(report.applied).toBe(2);
    expect(report.reviewer).toBe("bp");
    // A skip is recorded as skipped, never as a verdict nobody made.
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toBe("skipped by the reviewer");
    expect(report.links).toBe(1);
  });

  it("writes accepted links to frontmatter and the index, frontmatter first", () => {
    applyStandardBatch();

    // Frontmatter: the human-readable half, in the four-field schema shape.
    const doc = readFileSync(path.join(reqDir(), "REQ-V-001.md"), "utf8");
    expect(doc).toContain(ALPHA);
    expect(doc).toContain("reviewer: bp");
    // The rejected candidate is absent, and the body survived the rewrite.
    expect(doc).not.toContain(BETA);
    expect(doc).toContain("## Statement");

    // Index: the generated half, reconstructible from the above.
    const index = JSON.parse(readFileSync(path.join(repo, ".spectrace", "index.json"), "utf8"));
    expect(index.artifact).toBe("spectrace.link-index");
    expect(index.byRequirement["REQ-V-001"]).toEqual([ALPHA]);
    expect(index.bySymbol[ALPHA]).toEqual(["REQ-V-001"]);
  });

  it("AC2: exits 2 when neither --reviewer nor git config supplies an identity", () => {
    const batch = writeBatch("empty-batch.json", []);
    // No --reviewer, and git config pointed at files that do not exist, so
    // user.name is unset — the "with neither available" half of AC2.
    const absent = path.join(repo, "nonexistent-gitconfig");
    const { stderr, status } = run(
      ["review", "--repo", repo, "--proposals", proposalsPath(), "--decide", batch, "--json"],
      { ...process.env, GIT_CONFIG_GLOBAL: absent, GIT_CONFIG_SYSTEM: absent }
    );
    expect(status).toBe(2);
    expect(JSON.parse(stderr).error).toBe("unknown_reviewer");
  });

  it("AC2: --reviewer supplies the identity", () => {
    const batch = writeBatch("named.json", [
      { requirementId: "REQ-V-001", symbolId: ALPHA, kind: "accept", timestamp: "2026-08-06T11:00:00.000Z" }
    ]);
    const { stdout } = run([
      "review", "--repo", repo, "--proposals", proposalsPath(), "--decide", batch, "--reviewer", "someone-else", "--json"
    ]);
    expect(JSON.parse(stdout).reviewer).toBe("someone-else");
  });

  it("keeps the audit trail append-only across runs (REQ-CORE-042)", () => {
    // Reset so the count is unambiguous.
    rmSync(path.join(repo, ".spectrace", "decisions.json"), { force: true });

    const accept = writeBatch("a.json", [
      { requirementId: "REQ-V-001", symbolId: ALPHA, kind: "accept", timestamp: "2026-08-06T12:00:00.000Z" }
    ]);
    run(["review", "--repo", repo, "--proposals", proposalsPath(), "--decide", accept, "--reviewer", "bp", "--json"]);

    const reject = writeBatch("b.json", [
      { requirementId: "REQ-V-001", symbolId: ALPHA, kind: "reject", timestamp: "2026-08-06T12:05:00.000Z" }
    ]);
    const { stdout } = run([
      "review", "--repo", repo, "--proposals", proposalsPath(), "--decide", reject, "--reviewer", "bp", "--json"
    ]);

    const report = JSON.parse(stdout);
    // Two entries in the trail, one final state — and that state is "no link".
    expect(report.decisions).toBe(2);
    expect(report.links).toBe(0);
    expect(report.statistics.auditEntries).toBe(2);
    expect(report.statistics.decided).toBe(1);

    const trail = JSON.parse(readFileSync(path.join(repo, ".spectrace", "decisions.json"), "utf8"));
    expect(trail.decisions.map((d: { kind: string }) => d.kind)).toEqual(["accept", "reject"]);

    // The rejection removed the link from frontmatter as well as from state.
    expect(readFileSync(path.join(reqDir(), "REQ-V-001.md"), "utf8")).not.toContain(ALPHA);
  });

  it("records a redirect against the symbol the reviewer chose", () => {
    rmSync(path.join(repo, ".spectrace", "decisions.json"), { force: true });
    const batch = writeBatch("redirect.json", [
      {
        requirementId: "REQ-V-002",
        symbolId: BETA,
        kind: "redirect",
        redirectTo: { symbolId: "ts:src/other.ts#real:function", relationship: "supports" },
        timestamp: "2026-08-06T13:00:00.000Z"
      }
    ]);
    const { stdout } = run([
      "review", "--repo", repo, "--proposals", proposalsPath(), "--decide", batch, "--reviewer", "bp", "--json"
    ]);

    const report = JSON.parse(stdout);
    expect(report.links).toBe(1);
    expect(report.statistics.redirected).toBe(1);
    // A redirect always counts as an override — the model named the wrong symbol.
    expect(report.statistics.overrides).toBe(1);
    expect(readFileSync(path.join(reqDir(), "REQ-V-002.md"), "utf8")).toContain("ts:src/other.ts#real:function");
  });

  it("reports a decision naming a proposal that is not in the artifact", () => {
    const batch = writeBatch("ghost.json", [
      { requirementId: "REQ-V-001", symbolId: "ts:src/ghost.ts#nope:function", kind: "accept" }
    ]);
    const { stdout } = run([
      "review", "--repo", repo, "--proposals", proposalsPath(), "--decide", batch, "--reviewer", "bp", "--json"
    ]);
    const report = JSON.parse(stdout);
    expect(report.applied).toBe(0);
    expect(report.skipped[0].reason).toBe("no matching proposal in the artifact");
  });

  it("refuses interactive review with no TTY rather than guessing (SPEC-CLI-000 §3)", () => {
    // `review` without --decide is the one command exempted from the
    // run-in-CI criterion, so the absence of a terminal is an error with a
    // named alternative, not a silent no-op.
    const { stderr, status } = run([
      "review", "--repo", repo, "--proposals", proposalsPath(), "--reviewer", "bp", "--json"
    ]);
    expect(status).toBe(2);
    expect(JSON.parse(stderr).error).toBe("no_tty");
    expect(stderr).toContain("--decide");
  });
});

describe("spectrace links (REQ-CLI-006)", () => {
  beforeAll(() => {
    rmSync(path.join(repo, ".spectrace", "decisions.json"), { force: true });
    applyStandardBatch();
  });

  it("AC1: --req lists the symbols linked to that requirement", () => {
    const { stdout, status } = run(["links", "--repo", repo, "--req", "REQ-V-001", "--json"]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ requirementId: "REQ-V-001", symbols: [ALPHA] });
  });

  it("AC2: --symbol lists the requirements linked to that symbol", () => {
    const { stdout } = run(["links", "--repo", repo, "--symbol", ALPHA, "--json"]);
    expect(JSON.parse(stdout)).toEqual({ symbolId: ALPHA, requirementIds: ["REQ-V-001"] });
  });

  it("AC3: --unlinked lists requirements with no accepted links", () => {
    const { stdout } = run(["links", "--repo", repo, "--unlinked", "--json"]);
    expect(JSON.parse(stdout)).toEqual({ unlinked: ["REQ-V-002"] });
  });

  it("prints one identifier per line without --json", () => {
    const { stdout } = run(["links", "--repo", repo, "--req", "REQ-V-001"]);
    expect(stdout.trim()).toBe(ALPHA);
  });

  it("requires exactly one selector", () => {
    expect(run(["links", "--repo", repo, "--json"]).status).toBe(2);
    expect(run(["links", "--repo", repo, "--req", "REQ-V-001", "--unlinked", "--json"]).status).toBe(2);
  });

  it("exits 2 on a requirement that has no document", () => {
    const { stderr, status } = run(["links", "--repo", repo, "--req", "REQ-NOPE", "--json"]);
    expect(status).toBe(2);
    expect(JSON.parse(stderr).error).toBe("unknown_requirement");
  });

  it("returns an empty list for a symbol nothing links to", () => {
    const { stdout } = run(["links", "--repo", repo, "--symbol", "ts:src/nowhere.ts#x:function", "--json"]);
    expect(JSON.parse(stdout).requirementIds).toEqual([]);
  });
});

describe("spectrace coverage (REQ-CLI-007)", () => {
  beforeAll(() => {
    rmSync(path.join(repo, ".spectrace", "decisions.json"), { force: true });
    applyStandardBatch();
  });

  it("AC1: output carries a summary and per-requirement states", () => {
    const { stdout, status } = run(["coverage", "--repo", repo, "--json"]);
    expect(status).toBe(0);

    const report = JSON.parse(stdout);
    expect(report.summary).toMatchObject({ total: 2, linked: 1, stale: 0, unlinked: 1, linkTotal: 1 });
    expect(report.requirements).toHaveLength(2);
    expect(report.requirements[0]).toMatchObject({ requirementId: "REQ-V-001", state: "linked", linkCount: 1 });
    expect(report.requirements[1]).toMatchObject({ requirementId: "REQ-V-002", state: "unlinked", linkCount: 0 });

    // Totals reconcile with the rows exactly (REQ-CORE-051 AC2).
    expect(report.summary.linked + report.summary.stale + report.summary.unlinked).toBe(report.summary.total);
  });

  it("says staleness was not checked rather than implying links resolve", () => {
    const { stdout } = run(["coverage", "--repo", repo, "--json"]);
    expect(JSON.parse(stdout).stalenessChecked).toBe(false);

    const plain = run(["coverage", "--repo", repo]);
    expect(plain.stdout).toContain("staleness not checked");
  });

  it("reports a link whose symbol no longer resolves as stale (REQ-CORE-052)", () => {
    // A symbol index that knows about beta but not alpha — alpha was deleted.
    const indexPath = path.join(repo, "symbols.jsonl");
    writeFileSync(
      indexPath,
      `${JSON.stringify({
        symbolId: BETA,
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

    const { stdout } = run(["coverage", "--repo", repo, "--index", indexPath, "--json"]);
    const report = JSON.parse(stdout);

    expect(report.stalenessChecked).toBe(true);
    expect(report.summary).toMatchObject({ linked: 0, stale: 1, unlinked: 1 });
    // Present and flagged, never dropped — with its last-resolved commit.
    expect(report.brokenLinks).toHaveLength(1);
    expect(report.brokenLinks[0].symbolId).toBe(ALPHA);
    expect(report.brokenLinks[0].resolved).toBe(false);
    expect(report.brokenLinks[0].lastResolvedCommit).toBeTruthy();
  });

  it("AC2: --json matches the recorded cross-package contract (NFR-APP-007)", () => {
    const { stdout } = run(["coverage", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    // Commit varies by machine; the contract is the shape, not the SHA.
    const normalized = { ...report, repositoryCommit: "<commit>", engineVersion: "<version>" };
    const snapshotPath = path.join(snapshotDir, "coverage-report.json");

    if (!existsSync(snapshotPath)) {
      writeFileSync(snapshotPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    }
    expect(normalized).toEqual(JSON.parse(readFileSync(snapshotPath, "utf8")));
  });
});

/**
 * REQ-CORE-011 AC2 end-to-end: the exclusion is added *after* the proposals
 * exist, which is the only ordering under which the criterion means anything.
 * A proposal generated against an index that already excluded the symbol
 * could never have been generated at all.
 */
describe("REQ-CORE-011 AC2: exclusions flag proposals stale", () => {
  let excl: string;
  const KEPT = "ts:src/keep.ts#kept:function";
  const EXCLUDED = "ts:src/apiclient/api.ts#fetchUser:function";
  const DOOMED = "ts:src/doomed.ts#doomed:function";

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", excl, "-c", "user.email=t@example.com", "-c", "user.name=Test", ...args], {
      encoding: "utf8"
    });

  const reviewJson = (extra: string[] = []) => {
    const batch = path.join(excl, "noop-batch.json");
    writeFileSync(batch, JSON.stringify({ decisions: [] }), "utf8");
    const { stdout, status } = run([
      "review",
      "--repo", excl,
      "--proposals", path.join(excl, "proposals.json"),
      "--decide", batch,
      "--reviewer", "bp",
      "--json",
      ...extra
    ]);
    expect(status).toBe(0);
    return JSON.parse(stdout);
  };

  beforeAll(() => {
    excl = mkdtempSync(path.join(tmpdir(), "spectrace-exclusions-"));
    mkdirSync(path.join(excl, "specs", "requirements"), { recursive: true });
    mkdirSync(path.join(excl, "src", "apiclient"), { recursive: true });
    writeFileSync(
      path.join(excl, "specs", "requirements", "REQ-E-001.md"),
      requirementDoc("REQ-E-001", "Fetch a user"),
      "utf8"
    );
    writeFileSync(path.join(excl, "src", "keep.ts"), "export function kept(): number {\n  return 1;\n}\n");
    writeFileSync(path.join(excl, "src", "doomed.ts"), "export function doomed(): number {\n  return 2;\n}\n");
    writeFileSync(
      path.join(excl, "src", "apiclient", "api.ts"),
      "export function fetchUser(): string {\n  return \"u\";\n}\n"
    );
    git("init", "--quiet");
    git("add", "-A");
    git("commit", "--quiet", "-m", "fixture");

    // Proposals reference all three, as an `analyze` run before any exclusion
    // existed would have produced.
    writeFileSync(
      path.join(excl, "proposals.json"),
      JSON.stringify({
        artifact: "spectrace.proposals",
        version: 1,
        proposals: [KEPT, EXCLUDED, DOOMED].map((symbolId, i) => ({
          requirementId: "REQ-E-001",
          symbolId,
          rank: i + 1,
          classification: "implements",
          confidence: 0.9,
          rationale: "Generated before the exclusion existed."
        }))
      }),
      "utf8"
    );

    run(["index", "--repo", excl, "--rebuild"]);
  });

  afterAll(() => rmSync(excl, { recursive: true, force: true }));

  it("flags nothing while every proposed symbol is still indexed", () => {
    const report = reviewJson();
    expect(report.stale).toEqual([]);
    expect(report.stalenessUnchecked).toBeNull();
    expect(report.stalenessCheckedAgainst).toContain(".spectrace/index.jsonl");
  });

  it("AC2: adding an exclusion pattern and re-indexing flags the affected proposal stale", () => {
    mkdirSync(path.join(excl, ".spectrace"), { recursive: true });
    writeFileSync(
      path.join(excl, ".spectrace", "config.yaml"),
      "exclude:\n  - src/apiclient/\n",
      "utf8"
    );
    run(["index", "--repo", excl, "--rebuild"]);

    const report = reviewJson();
    const flagged = report.stale.find((entry: { symbolId: string }) => entry.symbolId === EXCLUDED);
    expect(flagged).toMatchObject({
      requirementId: "REQ-E-001",
      stale: true,
      reason: "excluded",
      path: "src/apiclient/api.ts"
    });
    // The unaffected proposal is untouched — the flag is about the exclusion,
    // not about the artifact being old.
    expect(report.stale.map((e: { symbolId: string }) => e.symbolId)).not.toContain(KEPT);
  });

  it("distinguishes a deleted symbol from an excluded one", () => {
    rmSync(path.join(excl, "src", "doomed.ts"));
    git("add", "-A");
    git("commit", "--quiet", "-m", "delete doomed");
    run(["index", "--repo", excl, "--rebuild"]);

    const report = reviewJson();
    const byId = new Map(
      report.stale.map((e: { symbolId: string; reason: string }) => [e.symbolId, e.reason])
    );
    expect(byId.get(EXCLUDED)).toBe("excluded");
    expect(byId.get(DOOMED)).toBe("missing");
  });

  it("reports staleness as unchecked, not as clean, when no index exists", () => {
    rmSync(path.join(excl, ".spectrace", "index.jsonl"));
    const report = reviewJson();
    expect(report.stale).toEqual([]);
    expect(report.stalenessCheckedAgainst).toBeNull();
    expect(report.stalenessUnchecked).toContain("no symbol index");
  });

  it("still fails loudly when an explicitly named --index is unreadable", () => {
    const { status, stderr } = run([
      "review",
      "--repo", excl,
      "--proposals", path.join(excl, "proposals.json"),
      "--decide", path.join(excl, "noop-batch.json"),
      "--reviewer", "bp",
      "--index", path.join(excl, "no-such-index.jsonl"),
      "--json"
    ]);
    expect(status).toBe(1);
    expect(JSON.parse(stderr).error).toBe("unreadable_index");
  });
});
