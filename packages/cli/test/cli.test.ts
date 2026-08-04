import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("spectrace index (REQ-CLI-003, REQ-CORE-012)", () => {
  let repo: string;
  let indexPath: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "user.email=t@example.com", "-c", "user.name=Test", ...args], {
      encoding: "utf8"
    });

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "spectrace-index-cmd-"));
    indexPath = path.join(repo, ".spectrace", "index.jsonl");
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(
      path.join(repo, "src", "math.ts"),
      "/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n"
    );
    writeFileSync(
      path.join(repo, "src", "shapes.ts"),
      "export class Circle {\n" +
        "  constructor(readonly radius: number) {}\n" +
        "  /** Area of the circle. */\n" +
        "  area(): number {\n    return 1;\n  }\n}\n"
    );
    git("init", "--quiet");
    git("add", "-A");
    git("commit", "--quiet", "-m", "fixture");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("prints symbol counts by kind (AC1)", () => {
    const { stdout, status } = run(["index", "--repo", repo]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^class\s+1$/m);
    expect(stdout).toMatch(/^method\s+1$/m);
    expect(stdout).toMatch(/^function\s+1$/m);
    expect(stdout).toMatch(/^constructor\s+1$/m);
    expect(stdout).toMatch(/^total\s+\d+$/m);
  });

  it("counts the `constructor` kind as a number, not Object.prototype.constructor (AC1)", () => {
    const { countsByKind } = JSON.parse(run(["index", "--repo", repo, "--json"]).stdout);
    expect(countsByKind.constructor).toBe(1);
  });

  it("writes a versioned, provenance-carrying artifact (REQ-CORE-012)", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const header = JSON.parse(readFileSync(indexPath, "utf8").split("\n")[0]!);
    expect(header.artifact).toBe("spectrace.symbol-index");
    expect(header.version).toBe(1);
    expect(header.repositoryCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(header.excludePatterns).toEqual([]);
  });

  it("rebuilds to identical bytes after the index is deleted (REQ-CORE-012 AC1)", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const first = readFileSync(indexPath, "utf8");
    rmSync(indexPath);
    run(["index", "--repo", repo]);
    expect(readFileSync(indexPath, "utf8")).toBe(first);
  });

  it("reuses a current index instead of re-indexing, and --rebuild discards it (AC2)", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const built = readFileSync(indexPath, "utf8");

    const second = JSON.parse(run(["index", "--repo", repo, "--json"]).stdout);
    expect(second.reused).toBe(true);

    // A stale index is no obstacle to --rebuild: it is discarded, not merged.
    writeFileSync(indexPath, "not even valid jsonl\n", "utf8");
    const rebuilt = JSON.parse(run(["index", "--repo", repo, "--rebuild", "--json"]).stdout);
    expect(rebuilt.reused).toBe(false);
    expect(readFileSync(indexPath, "utf8")).toBe(built);
  });

  it("re-indexes rather than reusing when the working tree is dirty", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const extra = path.join(repo, "src", "extra.ts");
    writeFileSync(extra, "export function subtract(a: number, b: number): number {\n  return a - b;\n}\n");
    try {
      const result = JSON.parse(run(["index", "--repo", repo, "--json"]).stdout);
      expect(result.reused).toBe(false);
      expect(result.countsByKind.function).toBe(2);
    } finally {
      rmSync(extra);
      run(["index", "--repo", repo, "--rebuild"]);
    }
  });

  it("re-indexes when an exclusion pattern changes, and the exclusion removes symbols (REQ-CORE-011 AC1)", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const excluded = JSON.parse(run(["index", "--repo", repo, "--exclude", "src/shapes.ts", "--json"]).stdout);
    expect(excluded.reused).toBe(false);
    expect(excluded.excludePatterns).toEqual(["src/shapes.ts"]);
    expect(excluded.countsByKind.class).toBeUndefined();
    expect(excluded.countsByKind.function).toBe(1);
    run(["index", "--repo", repo, "--rebuild"]);
  });

  it("bounds a dry run to (requirements × ≤k) excerpts and calls no model (REQ-CORE-023 AC1, REQ-CLI-004 AC3)", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const requirements = path.join(repo, "bounded-reqs");
    mkdirSync(requirements, { recursive: true });
    for (const [id, title] of [["R-1", "Addition"], ["R-2", "Area"]] as const) {
      writeFileSync(
        path.join(requirements, `${id}.md`),
        `---\nid: ${id}\ntitle: ${title}\nstatus: proposed\ndifficulty: high-overlap\n` +
          `acceptance_criteria:\n  - It works.\n---\n\n## Statement\n\nThe system shall compute the ${title.toLowerCase()}.\n`
      );
    }
    const logPath = path.join(repo, "transmission.json");

    const { stdout, status } = run([
      "analyze",
      "--requirements", requirements,
      "--index", indexPath,
      "--top-k", "3",
      "--dry-run",
      "--transmission-log", logPath,
      "--json"
    ]);
    expect(status).toBe(0);

    const report = JSON.parse(stdout);
    expect(report.dryRun).toBe(true);
    expect(report.modelCalls).toBe(0);
    expect(report.embeddingCalls).toBe(0);
    expect(report.transmission.bounded).toBe(true);
    expect(report.transmission.violations).toEqual([]);
    expect(report.transmission.excerptCount).toBe(report.transmission.permittedExcerptCount);

    // AC1 read literally against the written log: two requirements, at most
    // three excerpts each, and no other content.
    const log = JSON.parse(readFileSync(logPath, "utf8"));
    expect(log.artifact).toBe("spectrace.transmitted-content");
    expect(log.units).toHaveLength(2);
    expect(log.units.map((u: { requirementId: string }) => u.requirementId).sort()).toEqual(["R-1", "R-2"]);
    for (const unit of log.units) {
      expect(unit.candidates.length).toBeLessThanOrEqual(3);
    }
    expect(log.units.reduce((n: number, u: { candidates: unknown[] }) => n + u.candidates.length, 0)).toBe(
      report.transmission.excerptCount
    );
    rmSync(logPath);
  });

  it("restricts a run to --req and rejects an unknown one (REQ-CLI-004 AC1)", () => {
    const requirements = path.join(repo, "bounded-reqs");
    const restricted = JSON.parse(
      run([
        "analyze",
        "--requirements", requirements,
        "--index", indexPath,
        "--req", "R-2",
        "--dry-run",
        "--json"
      ]).stdout
    );
    expect(restricted.requirementCount).toBe(1);

    const { status } = run([
      "analyze",
      "--requirements", requirements,
      "--index", indexPath,
      "--req", "R-404"
    ]);
    expect(status).toBe(2);
  });

  it("feeds analyze without a separate conversion step", () => {
    run(["index", "--repo", repo, "--rebuild"]);
    const requirements = path.join(repo, "reqs");
    mkdirSync(requirements, { recursive: true });
    writeFileSync(
      path.join(requirements, "R-1.md"),
      "---\nid: R-1\ntitle: Addition\nstatus: proposed\ndifficulty: high-overlap\nacceptance_criteria:\n  - Adding two numbers returns their sum.\n---\n\n## Statement\n\nThe system shall add two numbers.\n"
    );
    const { stdout, status } = run([
      "analyze",
      "--requirements", requirements,
      "--index", indexPath,
      "--top-k", "3",
      "--json"
    ]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).results[0].candidates.length).toBeGreaterThan(0);
  });
});

describe("spectrace init (REQ-CLI-001)", () => {
  let tmp: string;

  const CONFIG = ".spectrace/config.yaml";

  /** Every file under a directory, as path → contents, for exact-equality diffing. */
  function snapshotTree(root: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(full, rel);
        else out[rel] = readFileSync(full, "utf8");
      }
    };
    walk(root, "");
    return out;
  }

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "spectrace-init-"));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function freshRepo(name: string): string {
    const repo = path.join(tmp, name);
    mkdirSync(repo, { recursive: true });
    return repo;
  }

  it("AC1: creates the configuration file with defaults and a templates directory", () => {
    const repo = freshRepo("fresh");
    const { stdout, status } = run(["init", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.artifact).toBe("spectrace.init-report");
    expect(report.version).toBe(1);
    expect(report.created).toContain(CONFIG);
    expect(report.skipped).toEqual([]);

    // A templates directory with one file per specced template kind.
    const templates = report.created.filter((p: string) => p.startsWith(".spectrace/templates/"));
    expect(templates).toHaveLength(5);
    expect(existsSync(path.join(repo, CONFIG))).toBe(true);
  });

  it("AC1: the scaffolded config is what the engine already defaults to", () => {
    const repo = freshRepo("defaults-match");
    run(["init", "--repo", repo]);

    // A freshly initialized repo must validate identically to a bare one.
    writeFileSync(path.join(repo, CONFIG), readFileSync(path.join(repo, CONFIG), "utf8"), "utf8");
    mkdirSync(path.join(repo, "specs", "requirements"), { recursive: true });
    writeFileSync(
      path.join(repo, "specs", "requirements", "REQ-Z-001.md"),
      "---\nid: REQ-Z-001\ntitle: T\nstatus: proposed\nacceptance_criteria:\n  - x\n---\n",
      "utf8"
    );

    const report = JSON.parse(run(["validate", "--repo", repo, "--json"]).stdout);
    expect(report.specPaths).toEqual(["specs/requirements"]);
    expect(report.valid).toBe(true);
    // No missing-config warning: init wrote a real one.
    expect(report.warnings.some((w: { rule: string }) => w.rule === "missing-config")).toBe(false);
  });

  it("AC1: every scaffolded template validates unedited (REQ-CORE-003 AC1 end to end)", () => {
    const repo = freshRepo("templates-valid");
    run(["init", "--repo", repo]);

    // Point a vault at the scaffolded templates and validate them as documents.
    writeFileSync(path.join(repo, CONFIG), "version: 1\nspecPaths:\n  - .spectrace/templates\n", "utf8");
    const report = JSON.parse(run(["validate", "--repo", repo, "--json"]).stdout);

    expect(report.violations).toEqual([]);
    expect(report.requirementCount).toBe(5);
  });

  it("AC2: running init a second time leaves the repository unchanged and exits 0", () => {
    const repo = freshRepo("idempotent");
    run(["init", "--repo", repo]);
    const before = snapshotTree(path.join(repo, ".spectrace"));

    const { stdout, status } = run(["init", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);
    const after = snapshotTree(path.join(repo, ".spectrace"));

    expect(status).toBe(0);
    expect(report.created).toEqual([]);
    expect(report.overwritten).toEqual([]);
    expect(report.skipped).toHaveLength(6);
    expect(after).toEqual(before);
  });

  it("AC3: an existing file is never overwritten without --force", () => {
    const repo = freshRepo("no-clobber");
    run(["init", "--repo", repo]);
    const edited = "version: 1\n# hand-edited by the developer\nspecPaths:\n  - docs/reqs\n";
    writeFileSync(path.join(repo, CONFIG), edited, "utf8");

    const { status } = run(["init", "--repo", repo]);

    expect(status).toBe(0);
    expect(readFileSync(path.join(repo, CONFIG), "utf8")).toBe(edited);
  });

  it("AC3: --force overwrites an existing file", () => {
    const repo = freshRepo("forced");
    run(["init", "--repo", repo]);
    writeFileSync(path.join(repo, CONFIG), "version: 1\nspecPaths:\n  - docs/reqs\n", "utf8");

    const { stdout, status } = run(["init", "--repo", repo, "--force", "--json"]);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.overwritten).toContain(CONFIG);
    expect(readFileSync(path.join(repo, CONFIG), "utf8")).toContain("specs/requirements");
  });

  it("AC3: --force restores only what it rewrites, leaving unrelated files alone", () => {
    const repo = freshRepo("force-scope");
    run(["init", "--repo", repo]);
    writeFileSync(path.join(repo, ".spectrace", "notes.md"), "developer notes\n", "utf8");

    run(["init", "--repo", repo, "--force"]);

    expect(readFileSync(path.join(repo, ".spectrace", "notes.md"), "utf8")).toBe("developer notes\n");
  });

  it("exits 1 when the repository path does not exist", () => {
    expect(run(["init", "--repo", path.join(tmp, "nope")]).status).toBe(1);
  });

  it("runs non-interactively with no TTY (SPEC-CLI-000 §3 AC3)", () => {
    expect(run(["init", "--repo", freshRepo("ci-init"), "--json"]).status).toBe(0);
  });
});

describe("spectrace validate (REQ-CLI-002)", () => {
  let tmp: string;

  const VALID = (id: string) =>
    `---\nid: ${id}\ntitle: A title\nstatus: proposed\nacceptance_criteria:\n  - It does the thing.\n---\n\n# A title\n`;

  /** A repo with a config naming `specPaths`, plus the documents to put there. */
  function makeRepo(name: string, specPaths: string[], files: Record<string, string>): string {
    const repo = path.join(tmp, name);
    mkdirSync(path.join(repo, ".spectrace"), { recursive: true });
    writeFileSync(
      path.join(repo, ".spectrace", "config.yaml"),
      `version: 1\nspecPaths:\n${specPaths.map((p) => `  - ${p}`).join("\n")}\n`,
      "utf8"
    );
    for (const [relative, content] of Object.entries(files)) {
      const full = path.join(repo, relative);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
    return repo;
  }

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "spectrace-validate-"));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("AC1: validation covers exactly the specification paths named in configuration", () => {
    const repo = makeRepo("scoped", ["specs/included"], {
      "specs/included/REQ-IN-001.md": VALID("REQ-IN-001"),
      // Broken, but outside every configured path — must not be validated.
      "specs/excluded/REQ-OUT-001.md": "---\ntitle: no id and no criteria\n---\n"
    });

    const { stdout, status } = run(["validate", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.valid).toBe(true);
    expect(report.specPaths).toEqual(["specs/included"]);
    expect(report.requirementCount).toBe(1);
    expect(JSON.stringify(report)).not.toContain("REQ-OUT-001");
  });

  it("AC1: a second configured path is also covered", () => {
    const repo = makeRepo("two-paths", ["specs/a", "specs/b"], {
      "specs/a/REQ-A-001.md": VALID("REQ-A-001"),
      "specs/b/REQ-B-001.md": VALID("REQ-B-001")
    });

    const report = JSON.parse(run(["validate", "--repo", repo, "--json"]).stdout);
    expect(report.requirementCount).toBe(2);
  });

  it("AC1: a configured path that does not exist is reported as a warning", () => {
    const repo = makeRepo("missing-path", ["specs/nowhere"], {});
    const { stdout, status } = run(["validate", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.warnings.some((w: { rule: string }) => w.rule === "missing-spec-path")).toBe(true);
  });

  it("AC2: --json emits the full violation list", () => {
    const repo = makeRepo("violations", ["specs"], {
      "specs/REQ-NOID.md": "---\ntitle: missing id and status\nacceptance_criteria:\n  - x\n---\n",
      "specs/REQ-NOAC-001.md": "---\nid: REQ-NOAC-001\ntitle: T\nstatus: proposed\n---\n",
      "specs/REQ-DUP-a.md": VALID("REQ-DUP-001"),
      "specs/REQ-DUP-b.md": VALID("REQ-DUP-001")
    });

    const { stdout } = run(["validate", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    expect(report.artifact).toBe("spectrace.validation-report");
    expect(report.version).toBe(1);
    expect(report.valid).toBe(false);

    // Every distinct failure is present, not just the first one found.
    const rules = new Set(report.violations.map((v: { rule: string }) => v.rule));
    expect(rules).toEqual(new Set(["missing-field", "no-acceptance-criteria", "duplicate-id"]));

    // Duplicate IDs name each other, and paths are repo-relative and findable.
    const duplicates = report.violations.filter((v: { rule: string }) => v.rule === "duplicate-id");
    expect(duplicates).toHaveLength(2);
    expect(duplicates.find((v: { path: string }) => v.path === "specs/REQ-DUP-a.md").message).toContain(
      "specs/REQ-DUP-b.md"
    );
  });

  it("AC3: a specification set carrying at least one violation exits 3", () => {
    const repo = makeRepo("exit-three", ["specs"], {
      "specs/REQ-BAD-001.md": "---\nid: REQ-BAD-001\ntitle: T\nstatus: proposed\n---\n"
    });
    expect(run(["validate", "--repo", repo]).status).toBe(3);
  });

  it("AC3: a clean set exits 0", () => {
    const repo = makeRepo("exit-zero", ["specs"], { "specs/REQ-OK-001.md": VALID("REQ-OK-001") });
    const { status, stdout } = run(["validate", "--repo", repo]);
    expect(status).toBe(0);
    expect(stdout).toContain("no violations");
  });

  it("falls back to default specPaths and warns when there is no config file", () => {
    const repo = path.join(tmp, "no-config");
    mkdirSync(path.join(repo, "specs", "requirements"), { recursive: true });
    writeFileSync(path.join(repo, "specs", "requirements", "REQ-D-001.md"), VALID("REQ-D-001"), "utf8");

    const { stdout, status } = run(["validate", "--repo", repo, "--json"]);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.specPaths).toEqual(["specs/requirements"]);
    expect(report.requirementCount).toBe(1);
    expect(report.warnings.some((w: { rule: string }) => w.rule === "missing-config")).toBe(true);
  });

  it("exits 1 when the repository path does not exist", () => {
    expect(run(["validate", "--repo", path.join(tmp, "nope")]).status).toBe(1);
  });

  it("runs non-interactively with no TTY (SPEC-CLI-000 §3 AC3)", () => {
    const repo = makeRepo("ci", ["specs"], { "specs/REQ-CI-001.md": VALID("REQ-CI-001") });
    expect(run(["validate", "--repo", repo, "--json"]).status).toBe(0);
  });
});
