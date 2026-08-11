import { describe, expect, it } from "vitest";
import {
  assignSymbolIds,
  hashSignature,
  symbolIdPath,
  type SymbolIdCandidate
} from "../src/indexer/symbol-id.js";

describe("assignSymbolIds", () => {
  it("builds the spec §8.3 format for a unique symbol", () => {
    const { ids, duplicates } = assignSymbolIds([
      { relativePath: "src/auth/session.ts", qualifiedName: "SessionManager.expireInactive", kind: "method" }
    ]);
    expect(ids).toEqual(["ts:src/auth/session.ts#SessionManager.expireInactive:method"]);
    expect(duplicates).toEqual([]);
  });

  it("normalizes backslash paths to forward slashes", () => {
    const { ids } = assignSymbolIds([
      { relativePath: "src\\auth\\session.ts", qualifiedName: "SessionManager.expireInactive", kind: "method" }
    ]);
    expect(ids).toEqual(["ts:src/auth/session.ts#SessionManager.expireInactive:method"]);
  });

  it("rejects absolute paths", () => {
    expect(() =>
      assignSymbolIds([
        { relativePath: "C:\\repo\\src\\index.ts", qualifiedName: "main", kind: "function" }
      ])
    ).toThrow(/repository-relative/);

    expect(() =>
      assignSymbolIds([{ relativePath: "/repo/src/index.ts", qualifiedName: "main", kind: "function" }])
    ).toThrow(/repository-relative/);
  });

  it("produces the same IDs across repeated calls (determinism)", () => {
    const candidates: SymbolIdCandidate[] = [
      { relativePath: "src/index.ts", qualifiedName: "main", kind: "function" },
      { relativePath: "src/util.ts", qualifiedName: "helpers.format", kind: "function" }
    ];
    const first = assignSymbolIds(candidates);
    const second = assignSymbolIds(candidates);
    expect(first.ids).toEqual(second.ids);
  });

  it("disambiguates overloaded functions with a parameter-signature hash", () => {
    const candidates: SymbolIdCandidate[] = [
      {
        relativePath: "src/parse.ts",
        qualifiedName: "parseValue",
        kind: "function",
        signature: { parameterTypes: ["string"], returnType: "number" }
      },
      {
        relativePath: "src/parse.ts",
        qualifiedName: "parseValue",
        kind: "function",
        signature: { parameterTypes: ["number"], returnType: "number" }
      }
    ];
    const { ids, duplicates } = assignSymbolIds(candidates);

    expect(duplicates).toEqual([]);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      expect(id).toMatch(/^ts:src\/parse\.ts#parseValue:function:[0-9a-f]{8}$/);
    }
  });

  it("does not add a disambiguation suffix to symbols outside an overload group", () => {
    const { ids } = assignSymbolIds([
      { relativePath: "src/a.ts", qualifiedName: "run", kind: "function" },
      { relativePath: "src/b.ts", qualifiedName: "run", kind: "function" }
    ]);
    // Different files: base IDs already differ, so neither is part of an overload group.
    expect(ids).toEqual(["ts:src/a.ts#run:function", "ts:src/b.ts#run:function"]);
  });

  it("reports duplicates when two overloads normalize to the identical signature hash", () => {
    const candidates: SymbolIdCandidate[] = [
      {
        relativePath: "src/dup.ts",
        qualifiedName: "run",
        kind: "function",
        signature: { parameterTypes: ["string"], returnType: "void" }
      },
      {
        relativePath: "src/dup.ts",
        qualifiedName: "run",
        kind: "function",
        signature: { parameterTypes: ["  string  "], returnType: "void" }
      }
    ];
    const { duplicates } = assignSymbolIds(candidates);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.relativePaths).toEqual(["src/dup.ts", "src/dup.ts"]);
  });

  it("hashSignature is stable across whitespace formatting differences", () => {
    const a = hashSignature({ parameterTypes: ["string", "number"], returnType: "void" });
    const b = hashSignature({ parameterTypes: ["  string", "number  "], returnType: " void " });
    expect(a).toBe(b);
  });
});

describe("symbolIdPath", () => {
  it("recovers the path from an ID the assigner produced", () => {
    const { ids } = assignSymbolIds([
      { relativePath: "src/deep/nested/module.ts", qualifiedName: "Thing.method", kind: "method" }
    ]);
    expect(symbolIdPath(ids[0]!)).toBe("src/deep/nested/module.ts");
  });

  it("round-trips every kind, including overload-disambiguated IDs", () => {
    const candidates: SymbolIdCandidate[] = [
      { relativePath: "src/a.ts", qualifiedName: "alpha", kind: "function" },
      { relativePath: "src/a.ts", qualifiedName: "Klass", kind: "class" },
      { relativePath: "src/b.ts", qualifiedName: "over", kind: "function", signature: { parameterTypes: ["string"], returnType: "void" } },
      { relativePath: "src/b.ts", qualifiedName: "over", kind: "function", signature: { parameterTypes: ["number"], returnType: "void" } }
    ];
    const { ids } = assignSymbolIds(candidates);
    expect(ids.map(symbolIdPath)).toEqual(["src/a.ts", "src/a.ts", "src/b.ts", "src/b.ts"]);
  });

  it("returns null for strings that are not symbol IDs", () => {
    for (const bad of ["", "plain-text", "ts:", "ts:#name:function", "#name", "no-hash:src/a.ts"]) {
      expect(symbolIdPath(bad)).toBeNull();
    }
  });
});
