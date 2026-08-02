import { describe, expect, it } from "vitest";
import {
  instantiateAllTemplates,
  instantiateTemplate,
  nextRequirementId
} from "../src/templates/instantiate.js";
import { TEMPLATES, TEMPLATE_KINDS } from "../src/templates/types.js";
import { validateRequirements } from "../src/schema/validate.js";
import { parseRequirementDocument } from "../src/schema/parse.js";

describe("specification templates — REQ-CORE-003", () => {
  it("provides a template for each of the five specced kinds", () => {
    expect(TEMPLATES.map((t) => t.kind)).toEqual([
      "use-case",
      "functional",
      "non-functional",
      "architecturally-significant",
      "acceptance-criteria"
    ]);
  });

  it.each(TEMPLATE_KINDS)(
    "AC1: the %s template instantiates with a generated unique ID and passes validation unedited",
    (kind) => {
      const document = instantiateTemplate({ kind });
      const report = validateRequirements([document]);

      expect(report.violations).toEqual([]);
      expect(report.valid).toBe(true);
      expect(report.requirements).toHaveLength(1);

      const requirement = report.requirements[0]!;
      expect(requirement.id).toMatch(/^REQ-[A-Z]+-\d{3}$/);
      expect(requirement.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
      expect(document.path).toBe(`${requirement.id}.md`);
    }
  );

  it("AC1: all five instantiated together are mutually unique and validate as a set", () => {
    const documents = instantiateAllTemplates();
    const report = validateRequirements(documents);

    expect(report.violations).toEqual([]);
    expect(report.requirements).toHaveLength(5);
    expect(new Set(report.requirements.map((r) => r.id)).size).toBe(5);
  });

  it("AC1: generated IDs do not collide with a vault that already uses the same family", () => {
    const existing = ["REQ-FN-001", "REQ-FN-002", "REQ-UC-007"];
    const document = instantiateTemplate({ kind: "functional", existingIds: existing });

    expect(document.path).toBe("REQ-FN-003.md");
    const report = validateRequirements([
      ...existing.map((id) => ({
        path: `${id}.md`,
        content: `---\nid: ${id}\ntitle: T\nstatus: proposed\nacceptance_criteria:\n  - x\n---\n`
      })),
      document
    ]);
    expect(report.violations).toEqual([]);
  });

  it("each template resolves a rationale, so a new document is not born incomplete", () => {
    for (const kind of TEMPLATE_KINDS) {
      const parsed = parseRequirementDocument(instantiateTemplate({ kind }));
      expect(parsed.requirement?.rationale, kind).toBeDefined();
    }
  });

  it("each template carries a Statement section", () => {
    for (const kind of TEMPLATE_KINDS) {
      expect(instantiateTemplate({ kind }).content, kind).toContain("## Statement");
    }
  });

  it("an explicit id overrides generation", () => {
    const document = instantiateTemplate({ kind: "use-case", id: "REQ-CUSTOM-042" });
    expect(document.path).toBe("REQ-CUSTOM-042.md");
    expect(parseRequirementDocument(document).requirement?.id).toBe("REQ-CUSTOM-042");
  });

  it("an explicit idPrefix overrides the template's default family", () => {
    const document = instantiateTemplate({ kind: "functional", idPrefix: "REQ-APP" });
    expect(document.path).toBe("REQ-APP-001.md");
  });

  it("rejects an unknown template kind rather than emitting an invalid document", () => {
    // @ts-expect-error deliberately outside the union
    expect(() => instantiateTemplate({ kind: "haiku" })).toThrow(/Unknown template kind/);
  });

  it("returns documents that survive structuredClone (CLAUDE.md rule 3)", () => {
    expect(() => structuredClone(instantiateAllTemplates())).not.toThrow();
  });
});

describe("nextRequirementId — REQ-CORE-003", () => {
  it("starts at 001 for an empty vault", () => {
    expect(nextRequirementId("REQ-FN")).toBe("REQ-FN-001");
  });

  it("continues from the highest existing number, ignoring other families", () => {
    expect(nextRequirementId("REQ-FN", ["REQ-FN-001", "REQ-FN-009", "REQ-UC-050"])).toBe("REQ-FN-010");
  });

  it("keeps a wider numbering scheme once the vault uses one", () => {
    expect(nextRequirementId("REQ-FN", ["REQ-FN-0099"])).toBe("REQ-FN-0100");
  });

  it("ignores IDs that merely start with the prefix", () => {
    expect(nextRequirementId("REQ-FN", ["REQ-FNX-900", "REQ-FN-002"])).toBe("REQ-FN-003");
  });

  it("treats a prefix containing regex metacharacters literally", () => {
    expect(nextRequirementId("REQ.FN", ["REQXFN-900"])).toBe("REQ.FN-001");
  });
});
