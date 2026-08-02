import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVault, readVaultFile } from "../src/main/vault.js";

describe("readVault — REQ-APP-001 (open and manage a vault)", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "studio-vault-"));
    mkdirSync(join(root, "requirements"), { recursive: true });
    mkdirSync(join(root, "notes", "deep"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });

    writeFileSync(join(root, "README.md"), "# Readme\n", "utf8");
    writeFileSync(join(root, "requirements", "REQ-B-002.md"), "# B\n", "utf8");
    writeFileSync(join(root, "requirements", "REQ-A-001.md"), "# A\n", "utf8");
    writeFileSync(join(root, "notes", "deep", "buried.md"), "# Buried\n", "utf8");
    writeFileSync(join(root, "notes", "ignored.txt"), "not markdown\n", "utf8");
    writeFileSync(join(root, "node_modules", "pkg", "readme.md"), "# Vendored\n", "utf8");
    writeFileSync(join(root, ".git", "COMMIT_EDITMSG.md"), "# Git\n", "utf8");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("AC1: opening a directory lists its markdown files as a navigable tree", () => {
    const summary = readVault(root);

    expect(summary.tree.files.map((f) => f.name)).toEqual(["README.md"]);
    expect(summary.tree.directories.map((d) => d.name)).toEqual(["notes", "requirements"]);
    expect(summary.fileCount).toBe(4);
  });

  it("AC1: nested markdown is found at any depth", () => {
    const summary = readVault(root);
    const notes = summary.tree.directories.find((d) => d.name === "notes");

    expect(notes?.directories[0]?.files[0]?.path).toBe("notes/deep/buried.md");
  });

  it("lists entries deterministically, directories before files, each sorted by name", () => {
    const requirements = readVault(root).tree.directories.find((d) => d.name === "requirements");
    expect(requirements?.files.map((f) => f.name)).toEqual(["REQ-A-001.md", "REQ-B-002.md"]);
  });

  it("excludes non-markdown files and vendored or VCS directories", () => {
    const serialized = JSON.stringify(readVault(root));
    expect(serialized).not.toContain("ignored.txt");
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toContain(".git");
  });

  it("reports POSIX paths, so the tree matches what core stores (CLAUDE.md rule 4)", () => {
    const summary = readVault(root);
    expect(summary.root).not.toContain("\\");
    expect(JSON.stringify(summary)).not.toContain("\\\\");
  });

  it("returns a summary that survives structuredClone (Electron IPC)", () => {
    expect(() => structuredClone(readVault(root))).not.toThrow();
  });
});

describe("readVaultFile — REQ-APP-001", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "studio-read-"));
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "sub", "doc.md"), "# Hello\n", "utf8");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("AC2: reads a vault-relative file as ordinary filesystem content", () => {
    expect(readVaultFile(root, "sub/doc.md")).toBe("# Hello\n");
  });

  it("refuses a path that escapes the vault root", () => {
    expect(() => readVaultFile(root, "../outside.md")).toThrow(/outside the vault/);
    expect(() => readVaultFile(root, "sub/../../outside.md")).toThrow(/outside the vault/);
  });

  it("refuses an absolute path", () => {
    expect(() => readVaultFile(root, join(root, "sub", "doc.md"))).toThrow(/vault-relative/);
  });

  it("refuses a path containing a NUL byte", () => {
    expect(() => readVaultFile(root, "sub/doc.md\0.png")).toThrow(/vault-relative/);
  });
});
