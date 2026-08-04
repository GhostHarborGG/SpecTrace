import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeVault, backlinksFor, parseWikiLinks, resolveWikiLink } from "../src/main/analysis.js";
import { writeVaultFile } from "../src/main/vault.js";

const requirement = (id: string, title: string, body = "") =>
  `---\nid: ${id}\ntitle: ${title}\nstatus: proposed\nacceptance_criteria:\n  - It works.\n---\n\n## Statement\n\nThe system shall ${title.toLowerCase()}.\n${body}`;

describe("parseWikiLinks", () => {
  it("finds plain and aliased links", () => {
    expect(parseWikiLinks("see [[REQ-A-001]] and [[notes/deep|the note]]")).toEqual([
      "REQ-A-001",
      "notes/deep"
    ]);
  });

  it("ignores embeds, which are not navigation", () => {
    expect(parseWikiLinks("![[diagram.png]] but [[REQ-A-001]]")).toEqual(["REQ-A-001"]);
  });

  it("does not let an unclosed bracket swallow the document", () => {
    expect(parseWikiLinks("[[unclosed\nstill text [[REQ-A-001]]")).toEqual(["REQ-A-001"]);
  });

  it("ignores an empty target", () => {
    expect(parseWikiLinks("[[]] [[   ]]")).toEqual([]);
  });
});

describe("resolveWikiLink", () => {
  const files = ["README.md", "requirements/REQ-A-001.md", "notes/deep/buried.md"];
  const byId = new Map([["REQ-A-001", "requirements/REQ-A-001.md"]]);

  it("resolves an exact path, with or without the extension", () => {
    expect(resolveWikiLink("requirements/REQ-A-001.md", files, byId)).toBe("requirements/REQ-A-001.md");
    expect(resolveWikiLink("requirements/REQ-A-001", files, byId)).toBe("requirements/REQ-A-001.md");
  });

  it("resolves a bare file name", () => {
    expect(resolveWikiLink("buried", files, byId)).toBe("notes/deep/buried.md");
  });

  it("resolves a requirement ID, which need not match the file name", () => {
    const renamed = new Map([["REQ-A-001", "requirements/whatever.md"]]);
    expect(resolveWikiLink("REQ-A-001", ["requirements/whatever.md"], renamed)).toBe(
      "requirements/whatever.md"
    );
  });

  it("returns null for a target that resolves to nothing", () => {
    expect(resolveWikiLink("REQ-NOPE-999", files, byId)).toBeNull();
  });
});

describe("analyzeVault — schema state comes from core (REQ-APP-004)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "studio-analysis-"));
    mkdirSync(join(root, "requirements"), { recursive: true });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reports the vault's requirements with no violations when it is clean", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(join(root, "requirements", "b.md"), requirement("REQ-A-002", "Do another"), "utf8");

    const analysis = analyzeVault({ root });
    expect(analysis.requirements.map((r) => r.id).sort()).toEqual(["REQ-A-001", "REQ-A-002"]);
    expect(analysis.violations).toEqual([]);
    expect(analysis.documentCount).toBe(2);
  });

  it("flags a duplicate ID in BOTH offending documents (REQ-APP-004 AC2)", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(join(root, "requirements", "b.md"), requirement("REQ-A-001", "Do another"), "utf8");

    const analysis = analyzeVault({ root });
    const duplicates = analysis.violations.filter((v) => v.rule.includes("duplicate"));
    expect(duplicates.length).toBeGreaterThan(0);
    const flagged = new Set(duplicates.map((v) => v.path));
    expect(flagged.has("requirements/a.md")).toBe(true);
    expect(flagged.has("requirements/b.md")).toBe(true);
  });

  it("flags a duplicate introduced in an UNSAVED buffer — the live half of AC2", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(join(root, "requirements", "b.md"), requirement("REQ-A-002", "Do another"), "utf8");

    // On disk there is no clash; the user has just typed one into b.md.
    expect(analyzeVault({ root }).violations).toEqual([]);

    const live = analyzeVault({
      root,
      overrides: [{ path: "requirements/b.md", content: requirement("REQ-A-001", "Do another") }]
    });
    const flagged = new Set(live.violations.filter((v) => v.rule.includes("duplicate")).map((v) => v.path));
    expect(flagged.has("requirements/a.md")).toBe(true);
    expect(flagged.has("requirements/b.md")).toBe(true);

    // And the file on disk is untouched — analysis never writes.
    expect(readFileSync(join(root, "requirements", "b.md"), "utf8")).toContain("REQ-A-002");
  });

  it("keeps analyzing when one document cannot be read, and says which", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(join(root, "requirements", "gone.md"), requirement("REQ-A-002", "Vanish"), "utf8");

    const analysis = analyzeVault({
      root,
      readFile: (vaultRoot, path) => {
        if (path === "requirements/gone.md") throw new Error("EACCES");
        return readFileSync(join(vaultRoot, path), "utf8");
      }
    });

    expect(analysis.requirements.map((r) => r.id)).toEqual(["REQ-A-001"]);
    expect(analysis.warnings.some((w) => w.rule === "unreadable-file" && w.path === "requirements/gone.md")).toBe(
      true
    );
  });

  it("returns structuredClone-safe data (CLAUDE.md rule 3 — it crosses IPC)", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    const analysis = analyzeVault({ root });
    expect(structuredClone(analysis)).toEqual(analysis);
  });
});

describe("analyzeVault — the link graph (REQ-APP-003)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "studio-links-"));
    mkdirSync(join(root, "requirements"), { recursive: true });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("resolves links by requirement ID and exposes backlinks", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(
      join(root, "requirements", "b.md"),
      requirement("REQ-A-002", "Do another", "\nDepends on [[REQ-A-001]].\n"),
      "utf8"
    );

    const analysis = analyzeVault({ root });
    const backlinks = backlinksFor(analysis, "requirements/a.md");
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]!.from).toBe("requirements/b.md");
  });

  it("records an unresolved link rather than dropping it", () => {
    writeFileSync(
      join(root, "requirements", "a.md"),
      requirement("REQ-A-001", "Do a thing", "\nSee [[REQ-NOPE-999]].\n"),
      "utf8"
    );
    const analysis = analyzeVault({ root });
    expect(analysis.links).toHaveLength(1);
    expect(analysis.links[0]!.to).toBeNull();
    expect(analysis.links[0]!.target).toBe("REQ-NOPE-999");
  });

  it("does not count a document's link to itself as a backlink", () => {
    writeFileSync(
      join(root, "requirements", "a.md"),
      requirement("REQ-A-001", "Do a thing", "\nSee [[REQ-A-001]].\n"),
      "utf8"
    );
    const analysis = analyzeVault({ root });
    expect(backlinksFor(analysis, "requirements/a.md")).toEqual([]);
  });

  it("sees links in an unsaved buffer, so backlinks track what is on screen", () => {
    writeFileSync(join(root, "requirements", "a.md"), requirement("REQ-A-001", "Do a thing"), "utf8");
    writeFileSync(join(root, "requirements", "b.md"), requirement("REQ-A-002", "Do another"), "utf8");

    expect(backlinksFor(analyzeVault({ root }), "requirements/a.md")).toEqual([]);

    const live = analyzeVault({
      root,
      overrides: [
        { path: "requirements/b.md", content: requirement("REQ-A-002", "Do another", "\n[[REQ-A-001]]\n") }
      ]
    });
    expect(backlinksFor(live, "requirements/a.md")).toHaveLength(1);
  });
});

describe("writeVaultFile — ordinary filesystem writes (REQ-APP-001 AC2)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "studio-write-"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("writes plain bytes an external tool sees immediately", () => {
    writeVaultFile(root, "notes/new.md", "# Hello\n");
    expect(readFileSync(join(root, "notes", "new.md"), "utf8")).toBe("# Hello\n");
  });

  it("refuses to escape the vault", () => {
    expect(() => writeVaultFile(root, "../escape.md", "x")).toThrow(/outside the vault/);
    expect(() => writeVaultFile(root, "/abs.md", "x")).toThrow(/vault-relative/);
  });

  it("refuses anything that is not markdown", () => {
    expect(() => writeVaultFile(root, "config.yaml", "x")).toThrow(/markdown files only/);
  });

  it("round-trips content unchanged, which is what REQ-APP-002 AC1 rests on", () => {
    const original = requirement("REQ-A-001", "Do a thing", "\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    writeVaultFile(root, "a.md", original);
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe(original);
  });
});
