import { describe, expect, it } from "vitest";
import { parseRequirementDocument, type RequirementDocument } from "../src/schema/parse.js";
import { validateRequirements } from "../src/schema/validate.js";
import { DEFAULT_REQUIREMENT_PRIORITY } from "../src/schema/types.js";

/** A schema-valid document carrying only the mandatory fields plus one criterion. */
const minimal = (id: string, extra = "") =>
  `---\nid: ${id}\ntitle: A title\nstatus: proposed\nacceptance_criteria:\n  - It does the thing.\n${extra}---\n\n# A title\n`;

const doc = (path: string, content: string): RequirementDocument => ({ path, content });

describe("parseRequirementDocument — REQ-CORE-001 (schema fields)", () => {
  it("AC1: a document missing a mandatory field fails validation with a message naming the field and file", () => {
    const parsed = parseRequirementDocument(
      doc("specs/requirements/REQ-X-001.md", `---\ntitle: No id here\nacceptance_criteria:\n  - Something.\n---\n`)
    );

    expect(parsed.requirement).toBeNull();
    const missing = parsed.violations.filter((v) => v.rule === "missing-field");
    expect(missing.map((v) => v.field).sort()).toEqual(["id", "status"]);
    for (const violation of missing) {
      expect(violation.path).toBe("specs/requirements/REQ-X-001.md");
      expect(violation.message).toContain("specs/requirements/REQ-X-001.md");
      expect(violation.message).toContain(`\`${violation.field}\``);
    }
  });

  it("AC1: reports every missing mandatory field at once, not just the first", () => {
    const parsed = parseRequirementDocument(
      doc("r.md", `---\nacceptance_criteria:\n  - Something.\n---\n`)
    );
    expect(parsed.violations.filter((v) => v.rule === "missing-field").map((v) => v.field).sort()).toEqual([
      "id",
      "status",
      "title"
    ]);
  });

  it("AC2: trace links parse as an array of {symbol, reviewer, timestamp, commit} entries", () => {
    const links =
      "links:\n" +
      "  - symbol: src/a.ts::doThing\n" +
      "    reviewer: Brian Parker\n" +
      "    timestamp: 2026-08-02T12:00:00Z\n" +
      "    commit: abc123\n";
    const parsed = parseRequirementDocument(doc("r.md", minimal("REQ-X-001", links)));

    expect(parsed.violations).toEqual([]);
    expect(parsed.requirement?.traceLinks).toEqual([
      {
        symbol: "src/a.ts::doThing",
        reviewer: "Brian Parker",
        timestamp: "2026-08-02T12:00:00Z",
        commit: "abc123"
      }
    ]);
  });

  it("AC2: trace links are readable without SpecTrace installed — plain JSON values, structuredClone-safe", () => {
    const links =
      "links:\n" +
      "  - symbol: src/a.ts::doThing\n" +
      "    reviewer: Brian Parker\n" +
      "    timestamp: 2026-08-02T12:00:00Z\n" +
      "    commit: abc123\n";
    const requirement = parseRequirementDocument(doc("r.md", minimal("REQ-X-001", links))).requirement;

    expect(() => structuredClone(requirement)).not.toThrow();
    // A stock JSON round-trip loses nothing: no class instances, no Dates.
    expect(JSON.parse(JSON.stringify(requirement))).toEqual(requirement);
    for (const link of requirement!.traceLinks) {
      expect(Object.keys(link).sort()).toEqual(["commit", "reviewer", "symbol", "timestamp"]);
      expect(Object.values(link).every((v) => typeof v === "string")).toBe(true);
    }
  });

  it("AC2: a malformed link entry is reported rather than silently dropped", () => {
    const parsed = parseRequirementDocument(
      doc("r.md", minimal("REQ-X-001", "links:\n  - symbol: src/a.ts::doThing\n    reviewer: BP\n"))
    );
    const violation = parsed.violations.find((v) => v.rule === "malformed-links");
    expect(violation?.message).toContain("timestamp");
    expect(violation?.message).toContain("commit");
  });

  it("AC3: identifiers are opaque — the same content at a different path keeps the same ID", () => {
    const content = minimal("REQ-CORE-999");
    const first = parseRequirementDocument(doc("specs/requirements/REQ-CORE-999.md", content)).requirement;
    const renamed = parseRequirementDocument(doc("somewhere/else/totally-different-name.md", content)).requirement;

    expect(first?.id).toBe("REQ-CORE-999");
    expect(renamed?.id).toBe("REQ-CORE-999");
    expect(renamed?.path).toBe("somewhere/else/totally-different-name.md");
  });

  it("AC4: a document with only the mandatory fields validates, and priority defaults", () => {
    const parsed = parseRequirementDocument(doc("r.md", minimal("REQ-X-001")));

    expect(parsed.violations).toEqual([]);
    expect(parsed.requirement?.priority).toBe(DEFAULT_REQUIREMENT_PRIORITY);
    expect(parsed.requirement?.traceLinks).toEqual([]);
    expect(parsed.requirement?.rationale).toBeUndefined();
  });

  it("AC4: a rationale supplied as a body section satisfies the rationale field", () => {
    const content =
      `---\nid: REQ-X-002\ntitle: Body rationale\nstatus: proposed\nacceptance_criteria:\n  - It does the thing.\n---\n\n` +
      `# Body rationale\n\n## Statement\n\nThe thing shall happen.\n\n## Rationale\n\nBecause the proposal says so.\n\n## Notes\n\nUnrelated trailing prose.\n`;
    const parsed = parseRequirementDocument(doc("r.md", content));

    expect(parsed.violations).toEqual([]);
    expect(parsed.requirement?.rationale).toBe("Because the proposal says so.");
  });

  it("AC4: frontmatter rationale wins over a body section when both are present", () => {
    const content =
      `---\nid: REQ-X-003\ntitle: T\nstatus: proposed\nrationale: From frontmatter\nacceptance_criteria:\n  - x\n---\n\n## Rationale\n\nFrom body\n`;
    expect(parseRequirementDocument(doc("r.md", content)).requirement?.rationale).toBe("From frontmatter");
  });

  it("accepts acceptance criteria from a body section as well as frontmatter", () => {
    const content =
      `---\nid: REQ-X-004\ntitle: T\nstatus: proposed\n---\n\n## Acceptance criteria\n\n- The first thing holds.\n- The second thing holds.\n`;
    const parsed = parseRequirementDocument(doc("r.md", content));

    expect(parsed.violations).toEqual([]);
    expect(parsed.requirement?.acceptanceCriteria).toEqual(["The first thing holds.", "The second thing holds."]);
  });

  it("preserves out-of-schema frontmatter keys so vault-specific fields survive a round trip", () => {
    const parsed = parseRequirementDocument(
      doc("r.md", minimal("REQ-X-005", "difficulty: partial-overlap\nspec: SPEC-CORE-000\n"))
    );
    expect(parsed.requirement?.extra).toEqual({ difficulty: "partial-overlap", spec: "SPEC-CORE-000" });
  });

  it("reports a document with no frontmatter rather than throwing", () => {
    const parsed = parseRequirementDocument(doc("r.md", "# Just a heading\n"));
    expect(parsed.requirement).toBeNull();
    expect(parsed.violations[0]?.rule).toBe("malformed-frontmatter");
  });

  it("warns, but does not fail, on a status outside the vocabulary", () => {
    const parsed = parseRequirementDocument(
      doc("r.md", `---\nid: REQ-X-006\ntitle: T\nstatus: bikeshedding\nacceptance_criteria:\n  - x\n---\n`)
    );
    expect(parsed.violations).toEqual([]);
    expect(parsed.warnings[0]?.rule).toBe("unknown-status");
    expect(parsed.warnings[0]?.message).toContain("bikeshedding");
  });

  it("returns values that survive structuredClone (CLAUDE.md rule 3 / Electron IPC)", () => {
    const parsed = parseRequirementDocument(doc("r.md", minimal("REQ-X-007", "difficulty: exact\n")));
    expect(() => structuredClone(parsed)).not.toThrow();
  });

  it("normalizes backslash paths to POSIX (CLAUDE.md rule 4)", () => {
    const parsed = parseRequirementDocument(doc("specs\\requirements\\REQ-X-008.md", minimal("REQ-X-008")));
    expect(parsed.requirement?.path).toBe("specs/requirements/REQ-X-008.md");
  });
});

describe("validateRequirements — REQ-CORE-002 (validation rules)", () => {
  it("AC1: two files sharing an ID are both reported, each naming the other", () => {
    const report = validateRequirements([
      doc("a.md", minimal("REQ-DUP-001")),
      doc("b.md", minimal("REQ-DUP-001"))
    ]);

    const duplicates = report.violations.filter((v) => v.rule === "duplicate-id");
    expect(duplicates).toHaveLength(2);

    const forA = duplicates.find((v) => v.path === "a.md");
    const forB = duplicates.find((v) => v.path === "b.md");
    expect(forA?.message).toContain("b.md");
    expect(forB?.message).toContain("a.md");
    expect(report.valid).toBe(false);
  });

  it("AC1: a three-way collision reports all three, each naming the other two", () => {
    const report = validateRequirements([
      doc("a.md", minimal("REQ-DUP-002")),
      doc("b.md", minimal("REQ-DUP-002")),
      doc("c.md", minimal("REQ-DUP-002"))
    ]);

    const duplicates = report.violations.filter((v) => v.rule === "duplicate-id");
    expect(duplicates).toHaveLength(3);
    expect(duplicates.find((v) => v.path === "b.md")?.message).toContain("a.md");
    expect(duplicates.find((v) => v.path === "b.md")?.message).toContain("c.md");
  });

  it("rejects a requirement with no acceptance criterion", () => {
    const report = validateRequirements([
      doc("a.md", `---\nid: REQ-NOAC-001\ntitle: T\nstatus: proposed\n---\n\n# T\n`)
    ]);
    expect(report.violations.map((v) => v.rule)).toEqual(["no-acceptance-criteria"]);
    expect(report.valid).toBe(false);
  });

  it("reports all violations in a single pass rather than failing on the first", () => {
    const report = validateRequirements([
      doc("a.md", `---\ntitle: No id\nacceptance_criteria:\n  - x\n---\n`),
      doc("b.md", `---\nid: REQ-B-001\ntitle: No criteria\nstatus: proposed\n---\n`),
      doc("c.md", minimal("REQ-C-001")),
      doc("d.md", minimal("REQ-C-001")),
      doc("e.md", "no frontmatter at all\n")
    ]);

    expect(new Set(report.violations.map((v) => v.rule))).toEqual(
      new Set(["missing-field", "no-acceptance-criteria", "duplicate-id", "malformed-frontmatter"])
    );
    // Every offending file appears; none is skipped because an earlier one failed.
    expect(new Set(report.violations.map((v) => v.path))).toEqual(new Set(["a.md", "b.md", "c.md", "d.md", "e.md"]));
  });

  it("a clean set is valid and returns every requirement", () => {
    const report = validateRequirements([doc("a.md", minimal("REQ-A-001")), doc("b.md", minimal("REQ-B-001"))]);
    expect(report.valid).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.requirements.map((r) => r.id)).toEqual(["REQ-A-001", "REQ-B-001"]);
  });

  it("AC2: validates a specification set well inside the 2 s budget", () => {
    // 200 documents — roughly 5x this repo's own vault, so the margin is real.
    const documents = Array.from({ length: 200 }, (_, i) =>
      doc(`specs/requirements/REQ-PERF-${String(i).padStart(3, "0")}.md`, minimal(`REQ-PERF-${String(i).padStart(3, "0")}`))
    );

    const started = performance.now();
    const report = validateRequirements(documents);
    const elapsedMs = performance.now() - started;

    expect(report.valid).toBe(true);
    expect(report.requirements).toHaveLength(200);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("returns a report that survives structuredClone (CLAUDE.md rule 3)", () => {
    const report = validateRequirements([doc("a.md", minimal("REQ-A-001"))]);
    expect(() => structuredClone(report)).not.toThrow();
  });
});
