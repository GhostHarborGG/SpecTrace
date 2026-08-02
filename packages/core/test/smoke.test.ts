import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIDENCE_BANDS, toPosixPath } from "../src/index.js";

describe("core scaffold", () => {
  it("defaults match REQ-CORE-041 provisional policy", () => {
    expect(DEFAULT_CONFIDENCE_BANDS).toEqual({ suggest: 0.75, review: 0.5 });
  });

  it("POSIX-normalizes Windows paths (CLAUDE.md rule 4)", () => {
    expect(toPosixPath("packages\\core\\src\\index.ts")).toBe("packages/core/src/index.ts");
  });

  it("bands survive structuredClone (CLAUDE.md rule 3)", () => {
    expect(structuredClone(DEFAULT_CONFIDENCE_BANDS)).toEqual(DEFAULT_CONFIDENCE_BANDS);
  });
});
