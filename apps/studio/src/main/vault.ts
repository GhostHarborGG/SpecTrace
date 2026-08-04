/**
 * Vault reading for the main process (REQ-APP-001 partial: the tree half).
 *
 * Deliberately free of Electron imports so it can be unit-tested in plain
 * Node — the IPC handlers in ./index.ts are the only Electron-aware part.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { VaultDirectory, VaultSummary } from "../shared/ipc.js";

/** Directories never worth showing in a spec vault. */
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "out", ".next", "coverage"]);

const toPosix = (p: string): string => p.split(sep).join("/");

function readDirectory(absolute: string, relative: string, name: string): VaultDirectory {
  const directories: VaultDirectory[] = [];
  const files: VaultDirectory["files"] = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      directories.push(readDirectory(join(absolute, entry.name), childRelative, entry.name));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push({ path: childRelative, name: entry.name });
    }
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return { path: relative, name, directories: directories.sort(byName), files: files.sort(byName) };
}

function countFiles(directory: VaultDirectory): number {
  return directory.files.length + directory.directories.reduce((total, d) => total + countFiles(d), 0);
}

/**
 * Builds the vault summary for a directory. Directories containing no
 * markdown at any depth are kept rather than pruned — an empty folder the
 * author just created should still be visible.
 */
export function readVault(directory: string): VaultSummary {
  const root = resolve(directory);
  const name = root.split(sep).filter(Boolean).pop() ?? root;
  const tree = readDirectory(root, "", name);
  return { root: toPosix(root), tree, fileCount: countFiles(tree) };
}

/**
 * Resolves a vault-relative path to an absolute one, rejecting absolute
 * paths and any path that escapes the vault root — the renderer is untrusted
 * input, even when it is our own code.
 */
function resolveInVault(root: string, relativePath: string, verb: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error(`Refusing to ${verb} "${relativePath}": vault-relative paths only.`);
  }
  const rootAbsolute = resolve(root);
  const target = resolve(rootAbsolute, relativePath);
  if (target !== rootAbsolute && !target.startsWith(rootAbsolute + sep)) {
    throw new Error(`Refusing to ${verb} "${relativePath}": outside the vault.`);
  }
  return target;
}

/** Reads a vault-relative file. */
export function readVaultFile(root: string, relativePath: string): string {
  return readFileSync(resolveInVault(root, relativePath, "read"), "utf8");
}

/**
 * Writes a vault-relative file (REQ-APP-001 AC2).
 *
 * An ordinary filesystem write, deliberately: no lock file, no sidecar, no
 * database. A vault edited in Studio must be indistinguishable from one
 * edited in any other editor, because the requirement is that external tools
 * see changes immediately — and because `git diff` is how the user checks
 * our work.
 *
 * Only `.md` files are writable. Studio is a markdown editor, and a bug that
 * lets the renderer overwrite arbitrary vault files is worse than a missing
 * feature.
 */
export function writeVaultFile(root: string, relativePath: string, content: string): void {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error(`Refusing to write "${relativePath}": Studio writes markdown files only.`);
  }
  const target = resolveInVault(root, relativePath, "write");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}
