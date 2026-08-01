import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts");

describe("cli skeleton", () => {
  it("lists all eight speced commands in help", () => {
    const out = execFileSync("npx", ["tsx", entry, "--help"], { encoding: "utf8", shell: process.platform === "win32" });
    for (const cmd of ["init", "validate", "index", "analyze", "review", "links", "coverage", "drift"]) {
      expect(out).toContain(cmd);
    }
  });
});
