import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonLines, writeJsonLines } from "../../src/output/jsonl.js";

describe("JSON Lines round-trip", () => {
  it("writes and reads back the same records", () => {
    const dir = mkdtempSync(join(tmpdir(), "spectrace-jsonl-"));
    const filePath = join(dir, "records.jsonl");
    try {
      const records = [{ a: 1 }, { a: 2, b: "two" }];
      writeJsonLines(filePath, records);
      expect(readJsonLines(filePath)).toEqual(records);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes an empty file for an empty record list and reads it back as an empty array", () => {
    const dir = mkdtempSync(join(tmpdir(), "spectrace-jsonl-"));
    const filePath = join(dir, "empty.jsonl");
    try {
      writeJsonLines(filePath, []);
      expect(readJsonLines(filePath)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
