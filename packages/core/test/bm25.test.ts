import { describe, expect, it } from "vitest";
import {
  BM25F_V3_CONFIG,
  BM25F_V4_CONFIG,
  BM25FIndex,
  DEFAULT_BM25F_CONFIG,
  DEFAULT_STOPWORDS,
  foldPlural
} from "../src/retrieval/bm25.js";
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
    expect(index.config.configurationId).toBe("bm25f-v5");
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

describe("foldPlural", () => {
  it("folds the plurals revision 1 over-stripped or skipped (revision 2)", () => {
    expect(foldPlural("promises", 2)).toBe("promise");
    expect(foldPlural("fns", 2)).toBe("fn");
  });

  it("still folds genuine sibilant plurals (revision 2)", () => {
    expect(foldPlural("classes", 2)).toBe("class");
    expect(foldPlural("processes", 2)).toBe("process");
    expect(foldPlural("responses", 2)).toBe("response");
  });

  it("leaves -ss/-us/-is endings and 2-char tokens alone (revision 2)", () => {
    for (const term of ["class", "status", "this", "is", "as", "us"]) {
      expect(foldPlural(term, 2), term).toBe(term);
    }
  });

  it("reproduces the defects of revision 1", () => {
    // Documented, not endorsed: "promises" split from "promise", and the
    // length floor of 3 left "fns" unmatched against `fn`.
    expect(foldPlural("promises", 1)).toBe("promis");
    expect(foldPlural("fns", 1)).toBe("fns");
  });

  it("agrees between revisions on the terms neither defect touches", () => {
    for (const term of ["classes", "hooks", "policies", "class", "status", "handler"]) {
      expect(foldPlural(term, 1), term).toBe(foldPlural(term, 2));
    }
  });
});

const REMOVE_ALL_ITEMS = "ts:src/store.ts#removeAllItems:function";
const REMOVE_ITEM = "ts:src/store.ts#removeItem:function";

// Two siblings whose only lexical difference is the `all` morpheme, so any
// ranking gap between them on a query containing "all" comes from stopword
// handling and nothing else.
const identifierCorpus: CodeSymbol[] = [
  makeSymbol({
    symbolId: REMOVE_ALL_ITEMS,
    name: "removeAllItems",
    qualifiedName: "removeAllItems",
    relativePath: "src/store.ts"
  }),
  makeSymbol({
    symbolId: REMOVE_ITEM,
    name: "removeItem",
    qualifiedName: "removeItem",
    relativePath: "src/store.ts"
  })
];

function scoreOf(results: readonly { symbolId: string; score: number }[], symbolId: string): number {
  return results.find((candidate) => candidate.symbolId === symbolId)?.score ?? 0;
}

describe("BM25FIndex identifier-protected stopwords", () => {
  it("ranks the symbol whose identifier carries the stopword above its sibling", () => {
    const index = new BM25FIndex(identifierCorpus);
    const results = index.search("removes all items", 10);
    expect(results[0]!.symbolId).toBe(REMOVE_ALL_ITEMS);
    expect(scoreOf(results, REMOVE_ALL_ITEMS)).toBeGreaterThan(scoreOf(results, REMOVE_ITEM));
  });

  it("does not distinguish the siblings by the stopword when protection is off", () => {
    const index = new BM25FIndex(identifierCorpus, { ...DEFAULT_BM25F_CONFIG, protectIdentifierStopwords: false });
    expect(index.search("removes all items", 10)).toEqual(index.search("removes items", 10));
  });

  it("derives protection from name/qualifiedName only, not from source or prose", () => {
    const proseOnly: CodeSymbol[] = [
      makeSymbol({
        symbolId: "ts:src/buffer.ts#flushBuffer:function",
        name: "flushBuffer",
        qualifiedName: "flushBuffer",
        relativePath: "src/buffer.ts",
        documentation: "Drops all pending writes.",
        normalizedSource: "flush buffer remove all buffered entries"
      })
    ];
    const index = new BM25FIndex(proseOnly);
    // "all" occurs only as prose, so it stays a stopword and carries nothing.
    expect(index.search("all", 10)).toEqual([]);
    expect(index.search("buffered", 10).length).toBe(1);
  });
});

const COORDINATOR = "ts:src/coordinator.ts#TaskCoordinator:class";
const RUN_NEXT = "ts:src/coordinator.ts#TaskCoordinator.runNext:method";

// A container class whose normalizedSource is the union of its members' text,
// so the queried terms repeat three times in it and once in the member that
// implements them. No query term appears in any name or signature, isolating
// the effect to raw term evidence in the source field.
const containerCorpus: CodeSymbol[] = [
  makeSymbol({
    symbolId: COORDINATOR,
    kind: "class",
    name: "TaskCoordinator",
    qualifiedName: "TaskCoordinator",
    relativePath: "src/coordinator.ts",
    startLine: 1,
    endLine: 40,
    signature: "class TaskCoordinator",
    normalizedSource:
      "schedule pending retry backoff schedule pending retry backoff schedule pending retry backoff"
  }),
  makeSymbol({
    symbolId: RUN_NEXT,
    kind: "method",
    name: "runNext",
    qualifiedName: "TaskCoordinator.runNext",
    relativePath: "src/coordinator.ts",
    startLine: 5,
    endLine: 15,
    signature: "runNext(): void",
    normalizedSource: "schedule pending retry backoff"
  }),
  makeSymbol({
    symbolId: "ts:src/coordinator.ts#TaskCoordinator.stopTimer:method",
    kind: "method",
    name: "stopTimer",
    qualifiedName: "TaskCoordinator.stopTimer",
    relativePath: "src/coordinator.ts",
    startLine: 20,
    endLine: 30,
    signature: "stopTimer(): void",
    normalizedSource: "stop timer clear handle"
  })
];

const CONTAINMENT_QUERY = "schedule pending retry backoff";

const withoutContainment = { ...DEFAULT_BM25F_CONFIG, containmentAlpha: null };

describe("BM25FIndex containment prior", () => {
  it("ranks the implementing member above the container class that repeats its terms", () => {
    const results = new BM25FIndex(containerCorpus).search(CONTAINMENT_QUERY, 10);
    expect(results.map((candidate) => candidate.symbolId).slice(0, 2)).toEqual([RUN_NEXT, COORDINATOR]);
  });

  it("documents the defect the prior corrects: without it the container outranks the member", () => {
    const results = new BM25FIndex(containerCorpus, withoutContainment).search(CONTAINMENT_QUERY, 10);
    expect(results.map((candidate) => candidate.symbolId).slice(0, 2)).toEqual([COORDINATOR, RUN_NEXT]);
  });

  it("leaves the relative order of two leaf symbols unchanged", () => {
    // The prior is 1.0 for every leaf, so it cannot reorder leaves.
    const query = "expire inactive session timer";
    const leavesWith = new BM25FIndex(corpus).search(query, 10);
    const leavesWithout = new BM25FIndex(corpus, withoutContainment).search(query, 10);
    expect(leavesWith.map((candidate) => candidate.symbolId)).toEqual(
      leavesWithout.map((candidate) => candidate.symbolId)
    );
    expect(leavesWith.map((candidate) => candidate.score)).toEqual(
      leavesWithout.map((candidate) => candidate.score)
    );
  });

  it("counts only the indexed symbols a container's span covers in its own file", () => {
    // An overlapping span in a different file must confer no containment, so
    // the outsider stays a leaf while the container counts exactly its two
    // members. The per-document prior is recoverable as the ratio of the v5
    // score to the same score with the prior disabled: 1 / (1 + alpha * n).
    const OUTSIDER = "ts:src/other.ts#scheduleSweep:function";
    const withOutsider: CodeSymbol[] = [
      ...containerCorpus,
      makeSymbol({
        symbolId: OUTSIDER,
        name: "scheduleSweep",
        qualifiedName: "scheduleSweep",
        relativePath: "src/other.ts",
        startLine: 1,
        endLine: 40,
        normalizedSource: "schedule pending retry backoff"
      })
    ];
    const withPrior = new BM25FIndex(withOutsider).search(CONTAINMENT_QUERY, 10);
    const noPrior = new BM25FIndex(withOutsider, withoutContainment).search(CONTAINMENT_QUERY, 10);

    const priorOf = (symbolId: string) => scoreOf(withPrior, symbolId) / scoreOf(noPrior, symbolId);
    expect(priorOf(COORDINATOR)).toBeCloseTo(1 / (1 + 0.15 * 2), 12);
    expect(priorOf(RUN_NEXT)).toBeCloseTo(1, 12);
    expect(priorOf(OUTSIDER)).toBeCloseTo(1, 12);
  });

  it("is deterministic across repeated searches and separate indexes", () => {
    const first = new BM25FIndex(containerCorpus);
    const second = new BM25FIndex(containerCorpus);
    expect(first.search(CONTAINMENT_QUERY, 10)).toEqual(first.search(CONTAINMENT_QUERY, 10));
    expect(first.search(CONTAINMENT_QUERY, 10)).toEqual(second.search(CONTAINMENT_QUERY, 10));
  });
});

describe("BM25F_V4_CONFIG", () => {
  it("identifies itself as the earlier revision", () => {
    expect(BM25F_V4_CONFIG.configurationId).toBe("bm25f-v4");
    expect(new BM25FIndex(corpus, BM25F_V4_CONFIG).config.configurationId).toBe("bm25f-v4");
  });

  it("applies no containment prior", () => {
    expect(BM25F_V4_CONFIG.containmentAlpha).toBeNull();
    expect(new BM25FIndex(containerCorpus, BM25F_V4_CONFIG).search(CONTAINMENT_QUERY, 10)).toEqual(
      new BM25FIndex(containerCorpus, withoutContainment).search(CONTAINMENT_QUERY, 10)
    );
  });
});

describe("BM25F_V3_CONFIG", () => {
  it("identifies itself as the earlier revision", () => {
    expect(BM25F_V3_CONFIG.configurationId).toBe("bm25f-v3");
    expect(new BM25FIndex(corpus, BM25F_V3_CONFIG).config.configurationId).toBe("bm25f-v3");
  });

  it("reproduces v3 stopword semantics: identifier morphemes stay stopped", () => {
    // v3 strips "all" from the query and from the identifier alike, leaving
    // the siblings with identical term counts and field lengths: they tie
    // exactly and fall back to symbolId order, where v4 separates them.
    const index = new BM25FIndex(identifierCorpus, BM25F_V3_CONFIG);
    const results = index.search("removes all items", 10);
    expect(results).toEqual(index.search("removes items", 10));
    expect(results.map((candidate) => candidate.symbolId)).toEqual([REMOVE_ALL_ITEMS, REMOVE_ITEM]);
    expect(scoreOf(results, REMOVE_ALL_ITEMS)).toBe(scoreOf(results, REMOVE_ITEM));
  });

  it("reproduces the v3 plural folder", () => {
    const promises: CodeSymbol[] = [
      makeSymbol({
        symbolId: "ts:src/async.ts#settlePromise:function",
        name: "settlePromise",
        qualifiedName: "settlePromise",
        relativePath: "src/async.ts"
      })
    ];
    // v3 folded the query to "promis" and the identifier to "promise".
    expect(new BM25FIndex(promises, BM25F_V3_CONFIG).search("promises", 10)).toEqual([]);
    expect(new BM25FIndex(promises).search("promises", 10).length).toBe(1);
  });

  it("is deterministic across repeated searches and separate indexes", () => {
    const first = new BM25FIndex(identifierCorpus, BM25F_V3_CONFIG);
    const second = new BM25FIndex(identifierCorpus, BM25F_V3_CONFIG);
    expect(first.search("removes all items", 10)).toEqual(first.search("removes all items", 10));
    expect(first.search("removes all items", 10)).toEqual(second.search("removes all items", 10));
  });
});
