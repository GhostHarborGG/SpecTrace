/**
 * The vault→repository pairing (REQ-APP-015 AC4).
 *
 * A pairing is a machine-local fact — an absolute path on this disk — so it
 * lives in a JSON file under Electron's `userData`, never in the vault. A
 * committed file carrying `H:/somewhere/local` would be wrong for everyone
 * who clones the vault, and the vault stays exactly what external tools see
 * (REQ-APP-001 AC2): plain markdown plus `.spectrace/` artifacts.
 *
 * Electron-free like its siblings — the store path is injected by
 * `./index.ts`, so this tests in plain Node.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { toPosixPath } from "@spectrace/core";

/** One entry per vault, keyed by absolute POSIX vault path. */
interface WorkspaceStore {
  workspaces: Record<string, string>;
}

function readStore(storePath: string): WorkspaceStore {
  if (!existsSync(storePath)) return { workspaces: {} };
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Partial<WorkspaceStore>;
    return { workspaces: parsed.workspaces ?? {} };
  } catch {
    // A corrupt store loses the pairings, not the vault or the repository —
    // both still exist on disk and one picker click restores the link.
    return { workspaces: {} };
  }
}

function writeStore(storePath: string, store: WorkspaceStore): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/** Canonical key: absolute, POSIX — so `H:\vault` and `H:/vault/` collide, as they should. */
function keyFor(vaultRoot: string): string {
  return toPosixPath(resolve(vaultRoot));
}

/**
 * The repository linked to this vault, or null when there is none.
 *
 * A stored path whose directory no longer exists reads as null rather than
 * erroring, but the entry is kept: a repository on an unplugged drive should
 * come back when the drive does, not need re-linking.
 */
export function linkedRepository(storePath: string, vaultRoot: string): string | null {
  const stored = readStore(storePath).workspaces[keyFor(vaultRoot)];
  if (stored === undefined) return null;
  try {
    return statSync(stored).isDirectory() ? stored : null;
  } catch {
    return null;
  }
}

/** Links a repository directory to the vault, replacing any previous link. Returns the stored POSIX path. */
export function linkRepository(storePath: string, vaultRoot: string, repositoryRoot: string): string {
  const repository = toPosixPath(resolve(repositoryRoot));
  if (!statSync(repository).isDirectory()) {
    throw new Error(`Not a directory: ${repository}`);
  }
  const store = readStore(storePath);
  store.workspaces[keyFor(vaultRoot)] = repository;
  writeStore(storePath, store);
  return repository;
}

/** Removes the vault's repository link (REQ-APP-015 AC4). A no-op when there is none. */
export function unlinkRepository(storePath: string, vaultRoot: string): void {
  const store = readStore(storePath);
  const key = keyFor(vaultRoot);
  if (!(key in store.workspaces)) return;
  delete store.workspaces[key];
  writeStore(storePath, store);
}
