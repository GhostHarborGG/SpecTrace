import { createHash } from "node:crypto";

/**
 * Deterministic symbol identifiers (REQ-CORE-010 AC1/AC2): identity is
 * declaration-based (path + qualified name + kind), so IDs are stable
 * across re-indexing and survive edits to a symbol's body. ID grammar and
 * overload disambiguation follow specs/spectrace-prelim-spec.md §8.3.
 * Paths are POSIX-normalized and repository-relative (CLAUDE.md rule 4).
 */

/** Matches the `CodeSymbol.kind` union (prelim spec §8.2). */
export type SymbolKind =
  | "file"
  | "module"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "constructor";

/** Parameter/return type text used to disambiguate overloaded declarations (spec §8.3). */
export interface OverloadSignature {
  parameterTypes: string[];
  returnType: string;
}

export interface SymbolIdCandidate {
  relativePath: string;
  qualifiedName: string;
  kind: SymbolKind;
  /** Required for kinds that can be overloaded (function/method/constructor); ignored otherwise. */
  signature?: OverloadSignature;
}

export interface DuplicateSymbolIdError {
  symbolId: string;
  relativePaths: string[];
}

const ABSOLUTE_PATH_PATTERN = /^([A-Za-z]:[\\/]|\/)/;

function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function assertRepositoryRelativePath(path: string): void {
  if (ABSOLUTE_PATH_PATTERN.test(path)) {
    throw new Error(
      `Symbol identifier path must be repository-relative, got an absolute-looking path: "${path}"`
    );
  }
}

function normalizeTypeText(type: string): string {
  return type.replace(/\s+/g, " ").trim();
}

/** Deterministic, formatting-insensitive hash of an overload's parameter/return types. */
export function hashSignature(signature: OverloadSignature): string {
  const normalized = JSON.stringify({
    params: signature.parameterTypes.map(normalizeTypeText),
    returnType: normalizeTypeText(signature.returnType)
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

function buildBaseSymbolId(candidate: SymbolIdCandidate): string {
  const path = toForwardSlashes(candidate.relativePath);
  assertRepositoryRelativePath(path);
  return `ts:${path}#${candidate.qualifiedName}:${candidate.kind}`;
}

/**
 * Assigns a deterministic `symbolId` to every candidate (spec §8.3). Candidates
 * that share a base ID — overload groups — get a parameter-signature hash
 * suffix appended; candidates that are alone under their base ID keep the
 * shorter, more readable form. Returns any IDs that still collide after
 * disambiguation so the caller can fail the run per §8.5.
 */
export function assignSymbolIds(candidates: readonly SymbolIdCandidate[]): {
  ids: string[];
  duplicates: DuplicateSymbolIdError[];
} {
  const baseIds = candidates.map(buildBaseSymbolId);

  const baseGroups = new Map<string, number[]>();
  baseIds.forEach((base, index) => {
    const indices = baseGroups.get(base);
    if (indices) {
      indices.push(index);
    } else {
      baseGroups.set(base, [index]);
    }
  });

  const ids = new Array<string>(candidates.length);
  for (const [base, indices] of baseGroups) {
    if (indices.length === 1) {
      ids[indices[0]!] = base;
      continue;
    }
    for (const index of indices) {
      const signature = candidates[index]!.signature ?? { parameterTypes: [], returnType: "" };
      ids[index] = `${base}:${hashSignature(signature)}`;
    }
  }

  const finalGroups = new Map<string, number[]>();
  ids.forEach((id, index) => {
    const indices = finalGroups.get(id);
    if (indices) {
      indices.push(index);
    } else {
      finalGroups.set(id, [index]);
    }
  });

  const duplicates: DuplicateSymbolIdError[] = [];
  for (const [id, indices] of finalGroups) {
    if (indices.length > 1) {
      duplicates.push({
        symbolId: id,
        relativePaths: indices.map((index) => candidates[index]!.relativePath)
      });
    }
  }

  return { ids, duplicates };
}
