import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { linkRepository, linkedRepository, unlinkRepository } from "../src/main/workspace.js";

/**
 * REQ-APP-015 AC4: a vault's repository link is restored when the vault is
 * reopened on the same machine, and can be removed.
 *
 * The store path is injected, so the tests never touch Electron's userData —
 * the same seam `./index.ts` uses to supply the real one.
 */

let dir: string;
let store: string;
let vault: string;
let repo: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spectrace-workspace-"));
  store = path.join(dir, "state", "workspaces.json");
  vault = path.join(dir, "vault");
  repo = path.join(dir, "repo");
  mkdirSync(vault, { recursive: true });
  mkdirSync(repo, { recursive: true });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("REQ-APP-015 AC4: the pairing survives and can be removed", () => {
  it("returns the linked repository on a later read — the relaunch case", () => {
    linkRepository(store, vault, repo);
    // A fresh read from disk, exactly what a new process would do.
    expect(linkedRepository(store, vault)).toBe(linkRepository(store, vault, repo));
  });

  it("returns null for a vault that was never linked", () => {
    expect(linkedRepository(store, vault)).toBeNull();
  });

  it("unlinking removes the pairing", () => {
    linkRepository(store, vault, repo);
    unlinkRepository(store, vault);
    expect(linkedRepository(store, vault)).toBeNull();
  });

  it("unlinking a vault with no link is a no-op, not an error", () => {
    expect(() => unlinkRepository(store, vault)).not.toThrow();
  });

  it("keys by canonical path, so a trailing separator is the same vault", () => {
    linkRepository(store, vault, repo);
    expect(linkedRepository(store, vault + path.sep)).not.toBeNull();
  });

  it("stores and returns POSIX paths only (CLAUDE.md rule 4)", () => {
    const stored = linkRepository(store, vault, repo);
    expect(stored).not.toContain("\\");
    expect(readFileSync(store, "utf8")).not.toContain("\\\\");
  });

  it("re-linking replaces the previous repository", () => {
    const second = path.join(dir, "repo-2");
    mkdirSync(second);
    linkRepository(store, vault, repo);
    linkRepository(store, vault, second);
    expect(linkedRepository(store, vault)).toBe(linkRepository(store, vault, second));
  });

  it("rejects a path that is not a directory", () => {
    const file = path.join(dir, "not-a-directory.txt");
    writeFileSync(file, "text", "utf8");
    expect(() => linkRepository(store, vault, file)).toThrow(/Not a directory/);
  });

  it("reads a vanished repository as null but keeps the entry for its return", () => {
    linkRepository(store, vault, repo);
    rmSync(repo, { recursive: true });
    // Gone — an unplugged drive, a deleted checkout — reads as unlinked…
    expect(linkedRepository(store, vault)).toBeNull();
    // …but comes back with the directory, with no re-linking.
    mkdirSync(repo);
    expect(linkedRepository(store, vault)).not.toBeNull();
  });

  it("treats a corrupt store as empty rather than failing to open the vault", () => {
    mkdirSync(path.dirname(store), { recursive: true });
    writeFileSync(store, "{ not json", "utf8");
    expect(linkedRepository(store, vault)).toBeNull();
    // And a new link writes a clean store over it.
    linkRepository(store, vault, repo);
    expect(linkedRepository(store, vault)).not.toBeNull();
  });
});
