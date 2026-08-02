/**
 * Vault reading for the main process (REQ-APP-001 partial: the tree half).
 *
 * Deliberately free of Electron imports so it can be unit-tested in plain
 * Node — the IPC handlers in ./index.ts are the only Electron-aware part.
 */
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
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
 * Reads a vault-relative file. Rejects absolute paths and any path that
 * escapes the vault root — the renderer is untrusted input, even when it is
 * our own code.
 */
export function readVaultFile(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error(`Refusing to read "${relativePath}": vault-relative paths only.`);
  }
  const rootAbsolute = resolve(root);
  const target = resolve(rootAbsolute, relativePath);
  if (target !== rootAbsolute && !target.startsWith(rootAbsolute + sep)) {
    throw new Error(`Refusing to read "${relativePath}": outside the vault.`);
  }
  return readFileSync(target, "utf8");
}
