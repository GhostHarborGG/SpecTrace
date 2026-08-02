import { describe, expect, it } from "vitest";
import { BM25FIndex, DEFAULT_BM25F_CONFIG, DEFAULT_STOPWORDS } from "../src/retrieval/bm25.js";
import type { CodeSymbol } from "../src/indexer/types.js";

function makeSymbol(overrides: Partial<CodeSymbol> & { symbolId: string }): CodeSymbol {
  return {
    kind: "function",
    name: "placeholder",
    qualifiedName: "placeholder",
    relativePath: "src/placeholder.ts",
    startLine: 1,
    endLine: 1,
    signature: "",
    documentation: "",
    normalizedSource: "",
    exported: true,
    repositoryCommit: "0".repeat(40),
    ...overrides
  };
}

const corpus: CodeSymbol[] = [
  makeSymbol({
    symbolId: "ts:src/auth/session.ts#expireInactiveSession:function",
    name: "expireInactiveSession",
    qualifiedName: "expireInactiveSession",
    relativePath: "src/auth/session.ts",
    signature: "function expireInactiveSession(session: Session): void",
    documentation: "Expires a session after the configured inactivity period.",
    normalizedSource: "function expire inactive session session void check last active timestamp"
  }),
  makeSymbol({
    symbolId: "ts:src/auth/session.ts#SessionManager.touch:method",
    name: "touch",
    qualifiedName: "SessionManager.touch",
    relativePath: "src/auth/session.ts",
    signature: "touch(session: Session): void",
    documentation: "Resets the inactivity timer for a session.",
    normalizedSource: "touch session update last active timestamp"
  }),
  makeSymbol({
    symbolId: "ts:src/billing/invoice.ts#generateInvoice:function",
    name: "generateInvoice",
    qualifiedName: "generateInvoice",
    relativePath: "src/billing/invoice.ts",
    signature: "function generateInvoice(order: Order): Invoice",
    documentation: "Creates an invoice document for a completed order.",
    normalizedSource:
      "function generate invoice order invoice compute line items totals unrelated filler text padded to a longer length so field length normalization has something to bite on across many additional repeated words words words"
  })
];

describe("BM25FIndex", () => {
  it("is deterministic across repeated searches", () => {
    const index = new BM25FIndex(corpus);
    const first = index.search("expire inactive session", 10);
    const second = index.search("expire inactive session", 10);
    expect(first).toEqual(second);
  });

  it("ranks the symbol whose name/qualifiedName matches the query above a same-topic method with lower field weight", () => {
    const index = new BM25FIndex(corpus);
    const results = index.search("expire inactive session", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.symbolId).toBe("ts:src/auth/session.ts#expireInactiveSession:function");
  });

  it("excludes documents unrelated to the query", () => {
    const index = new BM25FIndex(corpus);
    const results = index.search("expire inactive session", 10);
    const ids = results.map((r) => r.symbolId);
    expect(ids).not.toContain("ts:src/billing/invoice.ts#generateInvoice:function");
  });

  it("respects topK", () => {
    const index = new BM25FIndex(corpus);
    const results = index.search("session invoice", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns no candidates for a query with no matching terms", () => {
    const index = new BM25FIndex(corpus);
    expect(index.search("qqqzzz wwwyyy nonexistentterm", 10)).toEqual([]);
  });

  it("breaks ties deterministically by ascending symbolId", () => {
    const tied: CodeSymbol[] = [
      makeSymbol({
        symbolId: "ts:src/b.ts#run:function",
        name: "run",
        qualifiedName: "run",
        documentation: "runs the process"
      }),
      makeSymbol({
        symbolId: "ts:src/a.ts#run:function",
        name: "run",
        qualifiedName: "run",
        documentation: "runs the process"
      })
    ];
    const index = new BM25FIndex(tied);
    const results = index.search("run process", 10);
    expect(results.map((r) => r.symbolId)).toEqual(["ts:src/a.ts#run:function", "ts:src/b.ts#run:function"]);
    expect(results[0]!.score).toBe(results[1]!.score);
  });

  it("exposes the configuration it was built with", () => {
    const index = new BM25FIndex(corpus, DEFAULT_BM25F_CONFIG);
    expect(index.config.configurationId).toBe("bm25f-v3");
    expect(index.documentCount).toBe(corpus.length);
  });

  it("handles an empty corpus without throwing", () => {
    const index = new BM25FIndex([]);
    expect(index.search("anything", 10)).toEqual([]);
  });

  it("gives no credit for stopword matches", () => {
    const withProse: CodeSymbol[] = [
      ...corpus,
      makeSymbol({
        symbolId: "ts:src/config.ts#Options:interface",
        kind: "interface",
        name: "Options",
        qualifiedName: "Options",
        relativePath: "src/config.ts",
        normalizedSource: "the a or and is not from as such the the a"
      })
    ];
    const index = new BM25FIndex(withProse);
    const results = index.search("the session is not expired or the timer is reset", 10);
    const ids = results.map((r) => r.symbolId);
    expect(ids).not.toContain("ts:src/config.ts#Options:interface");
  });

  it("keeps domain-carrying words out of the default stopword list", () => {
    for (const domainTerm of ["before", "after", "once", "call", "hook", "error", "remove"]) {
      expect(DEFAULT_STOPWORDS).not.toContain(domainTerm);
    }
  });

  it("lets a documented symbol earn credit from its documentation even when most of the corpus has none", () => {
    // Two symbols identical except one documents the queried behavior; the
    // rest of the corpus has empty documentation fields. Averaging field
    // length over all documents would crush the documented symbol's credit.
    const pair: CodeSymbol[] = [
      ...corpus,
      makeSymbol({
        symbolId: "ts:src/queue.ts#drainQueue:function",
        name: "drainQueue",
        qualifiedName: "drainQueue",
        relativePath: "src/queue.ts",
        documentation: "Retries delivery until the pending backlog empties.",
        normalizedSource: "function drain queue process next"
      }),
      makeSymbol({
        symbolId: "ts:src/queue.ts#flushQueue:function",
        name: "flushQueue",
        qualifiedName: "flushQueue",
        relativePath: "src/queue.ts",
        documentation: "",
        normalizedSource: "function flush queue process next"
      })
    ];
    const index = new BM25FIndex(pair);
    const results = index.search("retries delivery until the pending backlog empties", 10);
    expect(results[0]!.symbolId).toBe("ts:src/queue.ts#drainQueue:function");
  });

  it("matches plural query terms against singular identifier terms", () => {
    const withRemove: CodeSymbol[] = [
      ...corpus,
      makeSymbol({
        symbolId: "ts:src/registry.ts#removeHandler:function",
        name: "removeHandler",
        qualifiedName: "removeHandler",
        relativePath: "src/registry.ts",
        signature: "function removeHandler(name: string): void",
        normalizedSource: "function remove handler name delete registered handler"
      })
    ];
    const index = new BM25FIndex(withRemove);
    // "removes"/"handlers" only appear singular in the symbol's text.
    const results = index.search("removes registered handlers", 10);
    expect(results[0]!.symbolId).toBe("ts:src/registry.ts#removeHandler:function");
  });

  it("does not fold -ss/-us/-is endings or short tokens when folding plurals", () => {
    const symbols: CodeSymbol[] = [
      makeSymbol({
        symbolId: "ts:src/a.ts#processStatus:function",
        name: "processStatus",
        qualifiedName: "processStatus",
        normalizedSource: "process status class analysis"
      })
    ];
    const index = new BM25FIndex(symbols);
    // Every one of these must survive folding unchanged to match.
    for (const q of ["process", "status", "class", "analysis"]) {
      expect(index.search(q, 10).length, q).toBe(1);
    }
  });

  it("ranks a member symbol above a file aggregate carrying the same text", () => {
    const withFile: CodeSymbol[] = [
      ...corpus,
      makeSymbol({
        symbolId: "ts:src/auth/session.ts#src/auth/session.ts:file",
        kind: "file",
        name: "session.ts",
        qualifiedName: "src/auth/session.ts",
        relativePath: "src/auth/session.ts",
        normalizedSource:
          "function expire inactive session session void check last active timestamp touch session update last active timestamp"
      })
    ];
    const index = new BM25FIndex(withFile);
    const results = index.search("expire inactive session", 10);
    const fileRank = results.findIndex((r) => r.symbolId === "ts:src/auth/session.ts#src/auth/session.ts:file");
    const functionRank = results.findIndex(
      (r) => r.symbolId === "ts:src/auth/session.ts#expireInactiveSession:function"
    );
    expect(functionRank).toBeGreaterThanOrEqual(0);
    expect(fileRank === -1 || functionRank < fileRank).toBe(true);
  });
});
