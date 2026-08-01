import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRequirements } from "../../src/requirements/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const validDir = join(here, "..", "fixtures", "requirements", "valid");
const invalidDir = join(here, "..", "fixtures", "requirements", "invalid");

describe("loadRequirements — valid fixtures", () => {
  it("parses every valid requirement with no errors", () => {
    const { requirements, errors } = loadRequirements(validDir);
    expect(errors).toEqual([]);
    expect(requirements.map((r) => r.id).sort()).toEqual(["REQ-AUTH-001", "REQ-AUTH-002"]);
  });

  it("extracts frontmatter and body sections", () => {
    const { requirements } = loadRequirements(validDir);
    const req = requirements.find((r) => r.id === "REQ-AUTH-001")!;
    expect(req.title).toBe("Expire inactive sessions");
    expect(req.difficulty).toBe("partial-overlap");
    expect(req.acceptanceCriteria).toHaveLength(2);
    expect(req.sourceDocumentation).toEqual(["docs/authentication.md"]);
    expect(req.statement).toMatch(/expire an authenticated session/);
    expect(req.rationale).toMatch(/must not remain valid indefinitely/);
  });

  it("defaults optional fields when absent", () => {
    const { requirements } = loadRequirements(validDir);
    const req = requirements.find((r) => r.id === "REQ-AUTH-002")!;
    expect(req.status).toBeNull();
    expect(req.priority).toBeNull();
    expect(req.rationale).toBeNull();
    expect(req.sourceDocumentation).toEqual([]);
  });
});

describe("loadRequirements — invalid fixtures (spec §6.4)", () => {
  it("rejects every malformed file with the expected error code", () => {
    const { requirements, errors } = loadRequirements(invalidDir);

    const byCode = new Map(errors.map((e) => [e.filePath.replace(/\\/g, "/").split("/").pop(), e.code]));

    expect(byCode.get("REQ-EMPTY.md")).toBe("empty_file");
    expect(byCode.get("REQ-BADYAML.md")).toBe("invalid_frontmatter");
    expect(byCode.get("REQ-NOTITLE.md")).toBe("missing_title");
    expect(byCode.get("REQ-NOSTATEMENT.md")).toBe("missing_statement");
    expect(byCode.get("REQ-NOAC.md")).toBe("missing_acceptance_criteria");
    expect(byCode.get("REQ-BADDIFF.md")).toBe("invalid_difficulty");
    // REQ-DUP-A.md is valid and registers the ID first; REQ-DUP-B.md collides with it.
    expect(byCode.get("REQ-DUP-B.md")).toBe("duplicate_id");

    // Only REQ-DUP-A.md should have passed validation.
    expect(requirements.map((r) => r.filePath.replace(/\\/g, "/").split("/").pop())).toEqual(["REQ-DUP-A.md"]);
  });
});
