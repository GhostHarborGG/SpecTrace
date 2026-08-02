import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config/parse.js";
import { loadConfig } from "../src/config/load.js";
import { CONFIG_FILE_RELATIVE_PATH, DEFAULT_CONFIG, renderDefaultConfig } from "../src/config/types.js";

describe("parseConfig / loadConfig — REQ-CORE-004 (configuration file)", () => {
  let scratchRoot: string;

  beforeAll(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "spectrace-config-"));
  });

  afterAll(() => {
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("AC1: a missing config produces defaults plus a warning, not a failure", () => {
    const emptyRepo = mkdtempSync(join(scratchRoot, "no-config-"));

    const result = loadConfig(emptyRepo);

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.source).toBe("defaults");
    expect(result.warnings.map((w) => w.rule)).toEqual(["missing-config"]);
    expect(result.warnings[0]?.message).toContain(CONFIG_FILE_RELATIVE_PATH);
  });

  it("AC1: an unreadable or malformed config still yields defaults rather than throwing", () => {
    const repo = mkdtempSync(join(scratchRoot, "bad-yaml-"));
    mkdirSync(join(repo, ".spectrace"), { recursive: true });
    writeFileSync(join(repo, CONFIG_FILE_RELATIVE_PATH), "retrieval: [unclosed\n", "utf8");

    const result = loadConfig(repo);

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings.some((w) => w.rule === "invalid-value")).toBe(true);
  });

  it("AC2: an unknown config key produces a warning naming the key", () => {
    const result = parseConfig("version: 1\nbogusKey: 3\n");

    const unknown = result.warnings.filter((w) => w.rule === "unknown-key");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.key).toBe("bogusKey");
    expect(unknown[0]?.message).toContain("bogusKey");
  });

  it("AC2: an unknown nested key is named by its dotted path", () => {
    const result = parseConfig("retrieval:\n  mode: lexical\n  topP: 0.9\n");

    const unknown = result.warnings.filter((w) => w.rule === "unknown-key");
    expect(unknown.map((w) => w.key)).toEqual(["retrieval.topP"]);
    expect(unknown[0]?.message).toContain("retrieval.topP");
  });

  it("AC2: an unknown key is a warning, not a failure — known keys still apply", () => {
    const result = parseConfig("bogusKey: 3\nretrieval:\n  topK: 25\n");

    expect(result.config.retrieval.topK).toBe(25);
    expect(result.source).toBe("file");
  });

  it("AC3: parsed configuration survives structuredClone", () => {
    const result = parseConfig(
      "version: 1\nspecPaths:\n  - specs/requirements\nretrieval:\n  mode: hybrid\n  topK: 5\nbands:\n  suggest: 0.8\n  review: 0.4\n"
    );

    expect(() => structuredClone(result)).not.toThrow();
    expect(structuredClone(result.config)).toEqual(result.config);
  });

  it("AC3: no YAML-specific value types reach the public API — timestamps normalize to strings", () => {
    // An unquoted YAML timestamp is the classic way a Date escapes into config.
    const result = parseConfig("version: 1\nmodel:\n  ranking: 2026-08-02\n");

    expect(() => structuredClone(result.config)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result.config))).toEqual(result.config);
    // Whatever it resolved to, it is not a Date.
    expect(result.config.model.ranking).not.toBeInstanceOf(Date);
  });

  it("AC3: a config full of exotic YAML still yields plain JSON-safe values", () => {
    const result = parseConfig(
      "version: 1\nspecPaths:\n  - specs/requirements\nexclude:\n  - '**/*.min.js'\nmodel:\n  ranking: null\n  embedding: null\n"
    );

    const roundTripped = JSON.parse(JSON.stringify(result.config));
    expect(roundTripped).toEqual(result.config);
    expect(() => structuredClone(result.config)).not.toThrow();
  });

  it("reads a well-formed file and resolves every field", () => {
    const repo = mkdtempSync(join(scratchRoot, "good-"));
    mkdirSync(join(repo, ".spectrace"), { recursive: true });
    writeFileSync(
      join(repo, CONFIG_FILE_RELATIVE_PATH),
      [
        "version: 1",
        "specPaths:",
        "  - docs/reqs",
        "exclude:",
        "  - '**/*.generated.ts'",
        "retrieval:",
        "  mode: hybrid",
        "  topK: 20",
        "model:",
        "  ranking: claude-opus-5",
        "  embedding: voyage-3",
        "bands:",
        "  suggest: 0.8",
        "  review: 0.45",
        ""
      ].join("\n"),
      "utf8"
    );

    const { config, warnings, source } = loadConfig(repo);

    expect(source).toBe("file");
    expect(warnings).toEqual([]);
    expect(config).toEqual({
      version: 1,
      specPaths: ["docs/reqs"],
      exclude: ["**/*.generated.ts"],
      retrieval: { mode: "hybrid", topK: 20 },
      model: { ranking: "claude-opus-5", embedding: "voyage-3" },
      bands: { suggest: 0.8, review: 0.45 }
    });
  });

  it("fills absent keys from defaults without warning about them", () => {
    const result = parseConfig("version: 1\nretrieval:\n  topK: 3\n");

    expect(result.config.retrieval.topK).toBe(3);
    expect(result.config.retrieval.mode).toBe(DEFAULT_CONFIG.retrieval.mode);
    expect(result.config.specPaths).toEqual(DEFAULT_CONFIG.specPaths);
    expect(result.config.bands).toEqual(DEFAULT_CONFIG.bands);
    expect(result.warnings).toEqual([]);
  });

  it("warns and falls back when a value has the wrong type or is out of range", () => {
    const result = parseConfig("retrieval:\n  mode: telepathy\n  topK: -4\nbands:\n  suggest: 12\n");

    expect(result.config.retrieval.mode).toBe(DEFAULT_CONFIG.retrieval.mode);
    expect(result.config.retrieval.topK).toBe(DEFAULT_CONFIG.retrieval.topK);
    expect(result.config.bands.suggest).toBe(DEFAULT_CONFIG.bands.suggest);

    const keys = result.warnings.filter((w) => w.rule === "invalid-value").map((w) => w.key);
    expect(keys).toEqual(["retrieval.mode", "retrieval.topK", "bands.suggest"]);
  });

  it("warns when the review band sits above the suggest band, leaving no review window", () => {
    const result = parseConfig("bands:\n  suggest: 0.4\n  review: 0.9\n");
    expect(result.warnings.some((w) => w.key === "bands")).toBe(true);
  });

  it("treats an empty config file as present but silent", () => {
    const result = parseConfig("");
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
    expect(result.source).toBe("file");
  });

  it("defaults match the REQ-CORE-041 provisional threshold policy", () => {
    expect(DEFAULT_CONFIG.bands).toEqual({ suggest: 0.75, review: 0.5 });
  });

  it("the rendered default config round-trips to DEFAULT_CONFIG exactly", () => {
    // What `spectrace init` writes must parse back to the built-in defaults,
    // or a freshly initialized repository would behave unlike an empty one.
    const result = parseConfig(renderDefaultConfig());

    expect(result.warnings).toEqual([]);
    expect(result.config).toEqual(DEFAULT_CONFIG);
  });

  it("the rendered default config carries explanatory comments", () => {
    // Comments are why YAML was chosen over JSON (REQ-CORE-004 notes).
    expect(renderDefaultConfig()).toMatch(/^#/m);
  });
});

describe("engine constraints — REQ-CORE-004 statement and CLAUDE.md rule 2", () => {
  /** Every .ts file under packages/core/src. */
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
    });
  }

  // vitest runs with cwd at the package root, so this resolves on every OS.
  const files = sourceFiles(join(process.cwd(), "src"));

  it("actually scans the engine sources (guards the two greps below from passing vacuously)", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("index.ts"))).toBe(true);
  });

  it("the engine reads no environment variables directly", () => {
    const offenders = files.filter((f) => /process\.env/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the engine writes no console output and never calls process.exit", () => {
    const offenders = files.filter((f) => /\bconsole\.|process\.exit\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
