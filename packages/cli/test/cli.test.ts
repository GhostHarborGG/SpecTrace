import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts");

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", entry, ...args], {
      encoding: "utf8",
      shell: process.platform === "win32"
    });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    return { stdout: e.stdout ?? "", status: e.status ?? -1 };
  }
}

describe("cli surface", () => {
  it("lists all nine speced commands in help", () => {
    const { stdout } = run(["--help"]);
    for (const cmd of ["init", "validate", "index", "analyze", "review", "links", "coverage", "drift", "evaluate"]) {
      expect(stdout).toContain(cmd);
    }
  });
});

describe("analyze → evaluate retrieval (REQ-CLI-009 end-to-end)", () => {
  let tmp: string;
  let requirementsDir: string;
  let indexFile: string;
  let resultsFile: string;
  let groundTruthFile: string;

  const symbol = (id: string, name: string, file: string, documentation: string) => ({
    symbolId: id,
    kind: "function",
    name,
    qualifiedName: name,
    relativePath: file,
    startLine: 1,
    endLine: 5,
    signature: `function ${name}(): void`,
    documentation,
    normalizedSource: documentation.toLowerCase(),
    exported: true,
    repositoryCommit: "deadbeef"
  });

  const requirementMd = (id: string, title: string, difficulty: string, statement: string, ac: string) =>
    `---\nid: ${id}\ntitle: ${title}\ndifficulty: ${difficulty}\nacceptance_criteria:\n  - ${ac}\n---\n\n## Statement\n\n${statement}\n`;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "spectrace-cli-"));
    requirementsDir = path.join(tmp, "requirements");
    indexFile = path.join(tmp, "index.jsonl");
    resultsFile = path.join(tmp, "results.jsonl");
    groundTruthFile = path.join(tmp, "ground-truth.json");
    mkdirSync(requirementsDir);

    writeFileSync(
      path.join(requirementsDir, "R-1.md"),
      requirementMd("R-1", "Create todo items", "high-overlap", "The library shall create todo items.", "createTodo returns the created item"),
      "utf8"
    );
    writeFileSync(
      path.join(requirementsDir, "R-2.md"),
      requirementMd("R-2", "Delete todo items", "partial-overlap", "The library shall delete todo items by identifier.", "deleteTodo removes the item"),
      "utf8"
    );

    const symbols = [
      symbol("src/create.ts::createTodo", "createTodo", "src/create.ts", "Create a todo item with the given title."),
      symbol("src/delete.ts::deleteTodo", "deleteTodo", "src/delete.ts", "Delete a todo item by identifier."),
      symbol("src/render.ts::renderList", "renderList", "src/render.ts", "Render the list to the console.")
    ];
    writeFileSync(indexFile, symbols.map((s) => JSON.stringify(s)).join("\n") + "\n", "utf8");

    const link = (requirementId: string, symbolId: string) => ({
      requirementId,
      symbolId,
      labelPass: "independent",
      relationship: "implements",
      confidence: "confirmed",
      rationale: "test fixture"
    });
    writeFileSync(
      groundTruthFile,
      JSON.stringify(
        {
          repositoryCommit: "deadbeef",
          createdAt: "2026-08-02T00:00:00Z",
          labeler: "fixture",
          links: [link("R-1", "src/create.ts::createTodo"), link("R-2", "src/delete.ts::deleteTodo")]
        },
        null,
        2
      ),
      "utf8"
    );
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("analyze writes a provenance-carrying results artifact", () => {
    const { stdout, status } = run([
      "analyze",
      "--requirements", requirementsDir,
      "--index", indexFile,
      "--out", resultsFile,
      "--json"
    ]);
    expect(status).toBe(0);
    const summary = JSON.parse(stdout);
    expect(summary.requirementCount).toBe(2);
    expect(summary.repositoryCommit).toBe("deadbeef");
    expect(summary.configurationId).toMatch(/^bm25f-/);
  });

  it("evaluate retrieval reports metrics with difficulty breakdowns", () => {
    const { stdout, status } = run([
      "evaluate", "retrieval",
      "--results", resultsFile,
      "--ground-truth", groundTruthFile,
      "--requirements", requirementsDir,
      "--json"
    ]);
    expect(status).toBe(0);
    const artifact = JSON.parse(stdout);
    expect(artifact.artifact).toBe("spectrace.retrieval-metrics");
    expect(artifact.provenance.repositoryCommit).toBe("deadbeef");

    const labels = artifact.report.breakdowns.map((b: { label: string }) => b.label);
    expect(labels).toContain("high-overlap");
    expect(labels).toContain("partial-overlap");

    const overall = artifact.report.breakdowns.find((b: { label: string }) => b.label === "overall");
    expect(overall.requirementCount).toBe(2);
    expect(overall.recallAtK["10"]).toBe(1);
    expect(overall.hitAtK["10"]).toBe(100);
    expect(overall.meanReciprocalRank).toBeGreaterThan(0);
  });

  it("exits 1 on a missing results file (REQ-CLI-009)", () => {
    const { status } = run([
      "evaluate", "retrieval",
      "--results", path.join(tmp, "does-not-exist.jsonl"),
      "--ground-truth", groundTruthFile
    ]);
    expect(status).toBe(1);
  });
});
