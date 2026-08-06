import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIDENCE_BANDS, type ConfidenceBands } from "../src/config/types.js";
import type { Proposal } from "../src/ranking/types.js";
import { bandFor, bucketProposals, countByBand, proposalKey } from "../src/review/bands.js";
import {
  DECISION_LOG_ARTIFACT,
  InvalidDecisionError,
  appendDecision,
  deriveLinkState,
  emptyDecisionLog,
  recordDecision,
  recordedBands,
  reviewStatistics,
  serializeDecisionLog,
  type DecisionInput,
  type DecisionLog
} from "../src/review/decisions.js";

const COMMIT = "b".repeat(40);

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    requirementId: "REQ-X-001",
    symbolId: "ts:src/mod.ts#alpha:function",
    rank: 1,
    classification: "implements",
    confidence: 0.9,
    rationale: "Does what the requirement describes.",
    ...overrides
  };
}

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    kind: "accept",
    reviewer: "bp",
    timestamp: "2026-08-05T12:00:00.000Z",
    repositoryCommit: COMMIT,
    ...overrides
  };
}

/** Decide `p` with the band its confidence implies, and append to `log`. */
function decide(log: DecisionLog, p: Proposal, i: DecisionInput, bands = DEFAULT_CONFIDENCE_BANDS) {
  return appendDecision(log, recordDecision(p, bandFor(p.confidence, p.classification, bands), i));
}

describe("REQ-CORE-041 confidence bands", () => {
  it("AC1: defaults match the proposal's provisional policy (suggest 0.75, review 0.50)", () => {
    expect(DEFAULT_CONFIDENCE_BANDS).toEqual({ suggest: 0.75, review: 0.5 });
  });

  it("buckets by the documented boundaries, inclusive at the bottom of each band", () => {
    const b = DEFAULT_CONFIDENCE_BANDS;
    expect(bandFor(1, "implements", b)).toBe("suggest");
    expect(bandFor(0.75, "implements", b)).toBe("suggest");
    expect(bandFor(0.7499, "implements", b)).toBe("review");
    expect(bandFor(0.5, "implements", b)).toBe("review");
    expect(bandFor(0.4999, "implements", b)).toBe("discard");
    expect(bandFor(0, "implements", b)).toBe("discard");
  });

  it("puts a confident `unrelated` verdict in discard, not suggest", () => {
    // Reading confidence alone would present the model's most emphatic
    // "these are unrelated" as a suggested link, inverting the answer.
    expect(bandFor(0.99, "unrelated", DEFAULT_CONFIDENCE_BANDS)).toBe("discard");
    expect(bandFor(0.99, "supports", DEFAULT_CONFIDENCE_BANDS)).toBe("suggest");
  });

  it("AC2: reviewer decision and model confidence are stored independently", () => {
    const p = proposal({ confidence: 0.92 });
    const decision = recordDecision(p, "suggest", input({ kind: "reject" }));

    // The reviewer said no; the model's number is untouched beside it.
    expect(decision.kind).toBe("reject");
    expect(decision.modelConfidence).toBe(0.92);
    expect(decision.modelClassification).toBe("implements");
    expect(decision.band).toBe("suggest");

    // Which is exactly what makes override rate computable.
    const stats = reviewStatistics(appendDecision(emptyDecisionLog(), decision));
    expect(stats.overrides).toBe(1);
    expect(stats.overrideRate).toBe(1);
  });

  it("re-buckets unreviewed proposals on a threshold change and leaves decided ones alone", () => {
    const undecided = proposal({ symbolId: "ts:src/mod.ts#alpha:function", confidence: 0.8 });
    const decided = proposal({ symbolId: "ts:src/mod.ts#beta:function", confidence: 0.8 });

    const log = decide(emptyDecisionLog(), decided, input({ kind: "reject" }));
    const stricter: ConfidenceBands = { suggest: 0.95, review: 0.6 };

    const bucketed = bucketProposals([undecided, decided], stricter, recordedBands(log));

    // The unreviewed one moves; the decided one keeps the band it was decided in.
    expect(bucketed[0]).toMatchObject({ band: "review", reviewed: false });
    expect(bucketed[1]).toMatchObject({ band: "suggest", reviewed: true });
  });

  it("a threshold change never alters a past decision", () => {
    const p = proposal({ confidence: 0.8 });
    const log = decide(emptyDecisionLog(), p, input({ kind: "reject" }));
    const before = structuredClone(log);

    bucketProposals([p], { suggest: 0.95, review: 0.6 }, recordedBands(log));

    expect(log).toEqual(before);
    expect(log.decisions[0]!.band).toBe("suggest");
  });

  it("counts proposals by band", () => {
    const bucketed = bucketProposals(
      [
        proposal({ symbolId: "a", confidence: 0.9 }),
        proposal({ symbolId: "b", confidence: 0.6 }),
        proposal({ symbolId: "c", confidence: 0.2 }),
        proposal({ symbolId: "d", confidence: 0.99, classification: "unrelated" })
      ],
      DEFAULT_CONFIDENCE_BANDS
    );
    expect(countByBand(bucketed)).toEqual({ suggest: 1, review: 1, discard: 2 });
  });

  it("keeps discarded proposals retained and inspectable rather than dropping them", () => {
    const bucketed = bucketProposals([proposal({ confidence: 0.1 })], DEFAULT_CONFIDENCE_BANDS);
    expect(bucketed).toHaveLength(1);
    expect(bucketed[0]!.band).toBe("discard");
    expect(bucketed[0]!.proposal.rationale).toBeTruthy();
  });
});

describe("REQ-CORE-040 review decisions", () => {
  it("AC1: link state is derivable only from decisions — a proposal cannot reach it", () => {
    // Structural, not conventional: deriveLinkState's signature has no
    // parameter a proposal could be passed through. This test documents the
    // guarantee the AC asks a grep to confirm.
    const log = emptyDecisionLog();
    expect(deriveLinkState(log)).toEqual([]);

    // A maximally confident proposal, never decided, produces no link.
    const bucketed = bucketProposals([proposal({ confidence: 1 })], DEFAULT_CONFIDENCE_BANDS);
    expect(bucketed[0]!.band).toBe("suggest");
    expect(deriveLinkState(log)).toEqual([]);
  });

  it("supports accept, reject, and redirect", () => {
    const accepted = decide(emptyDecisionLog(), proposal(), input());
    expect(deriveLinkState(accepted)).toEqual([
      {
        requirementId: "REQ-X-001",
        symbolId: "ts:src/mod.ts#alpha:function",
        relationship: "implements",
        reviewer: "bp",
        timestamp: "2026-08-05T12:00:00.000Z",
        repositoryCommit: COMMIT
      }
    ]);

    const rejected = decide(emptyDecisionLog(), proposal(), input({ kind: "reject" }));
    expect(deriveLinkState(rejected)).toEqual([]);

    const redirected = decide(
      emptyDecisionLog(),
      proposal(),
      input({ kind: "redirect", redirectTo: { symbolId: "ts:src/other.ts#real:function" } })
    );
    const links = deriveLinkState(redirected);
    expect(links).toHaveLength(1);
    expect(links[0]!.symbolId).toBe("ts:src/other.ts#real:function");
  });

  it("a redirect can re-target the relationship as well as the symbol", () => {
    const log = decide(
      emptyDecisionLog(),
      proposal(),
      input({
        kind: "redirect",
        redirectTo: { symbolId: "ts:src/other.ts#helper:function", relationship: "supports" }
      })
    );
    expect(deriveLinkState(log)[0]!.relationship).toBe("supports");
  });

  it("carries the proposal's relationship onto an accepted link", () => {
    const log = decide(emptyDecisionLog(), proposal({ classification: "supports" }), input());
    expect(deriveLinkState(log)[0]!.relationship).toBe("supports");
  });

  it("records reviewer identity, timestamp, and repository commit on every decision", () => {
    const decision = recordDecision(proposal(), "suggest", input({ note: "checked by hand" }));
    expect(decision.reviewer).toBe("bp");
    expect(decision.timestamp).toBe("2026-08-05T12:00:00.000Z");
    expect(decision.repositoryCommit).toBe(COMMIT);
    expect(decision.note).toBe("checked by hand");
  });

  it("refuses a decision with no reviewer identity", () => {
    expect(() => recordDecision(proposal(), "suggest", input({ reviewer: "  " }))).toThrow(
      InvalidDecisionError
    );
  });

  it("refuses a redirect with no target, and a non-redirect that carries one", () => {
    expect(() => recordDecision(proposal(), "suggest", input({ kind: "redirect" }))).toThrow(
      /must name the symbol/
    );
    expect(() =>
      recordDecision(
        proposal(),
        "suggest",
        input({ kind: "accept", redirectTo: { symbolId: "x" } })
      )
    ).toThrow(/cannot carry a redirect target/);
  });

  it("AC2: decision records are exportable as JSON", () => {
    const log = decide(emptyDecisionLog(), proposal(), input());
    const json = serializeDecisionLog(log);
    const parsed = JSON.parse(json);

    expect(parsed.artifact).toBe(DECISION_LOG_ARTIFACT);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0].reviewer).toBe("bp");
    expect(json.endsWith("\n")).toBe(true);
    expect(() => structuredClone(log)).not.toThrow();
  });

  it("orders link state deterministically", () => {
    let log = emptyDecisionLog();
    log = decide(log, proposal({ requirementId: "REQ-X-002", symbolId: "z" }), input());
    log = decide(log, proposal({ requirementId: "REQ-X-001", symbolId: "b" }), input());
    log = decide(log, proposal({ requirementId: "REQ-X-001", symbolId: "a" }), input());

    expect(deriveLinkState(log).map((l) => `${l.requirementId}/${l.symbolId}`)).toEqual([
      "REQ-X-001/a",
      "REQ-X-001/b",
      "REQ-X-002/z"
    ]);
  });
});

describe("REQ-CORE-042 decision audit separation", () => {
  it("AC1: accepting then rejecting yields two audit entries and one final link state", () => {
    let log = emptyDecisionLog();
    log = decide(log, proposal(), input({ kind: "accept" }));
    log = decide(
      log,
      proposal(),
      input({ kind: "reject", timestamp: "2026-08-05T13:00:00.000Z", reviewer: "bp" })
    );

    expect(log.decisions).toHaveLength(2);
    expect(log.decisions.map((d) => d.kind)).toEqual(["accept", "reject"]);
    expect(deriveLinkState(log)).toEqual([]);
    expect(reviewStatistics(log).auditEntries).toBe(2);
    expect(reviewStatistics(log).decided).toBe(1);
  });

  it("is append-only: appending never mutates the log it was given", () => {
    const original = decide(emptyDecisionLog(), proposal(), input());
    const snapshot = structuredClone(original);

    const extended = appendDecision(
      original,
      recordDecision(proposal({ symbolId: "other" }), "suggest", input())
    );

    expect(original).toEqual(snapshot);
    expect(original.decisions).toHaveLength(1);
    expect(extended.decisions).toHaveLength(2);
  });

  it("a reversal supersedes rather than edits — the earlier entry survives verbatim", () => {
    let log = decide(emptyDecisionLog(), proposal(), input({ kind: "accept" }));
    const first = structuredClone(log.decisions[0]!);
    log = decide(log, proposal(), input({ kind: "reject", reviewer: "reviewer-2" }));

    expect(log.decisions[0]).toEqual(first);
    expect(log.decisions[1]!.reviewer).toBe("reviewer-2");
  });

  it("computes override rate without reconstructing history", () => {
    let log = emptyDecisionLog();
    // Rejected a suggestion — an override.
    log = decide(log, proposal({ symbolId: "a", confidence: 0.9 }), input({ kind: "reject" }));
    // Accepted a suggestion — agreement.
    log = decide(log, proposal({ symbolId: "b", confidence: 0.9 }), input({ kind: "accept" }));
    // Accepted something that would have been discarded — an override.
    log = decide(log, proposal({ symbolId: "c", confidence: 0.1 }), input({ kind: "accept" }));
    // Redirected — always an override; the model named the wrong symbol.
    log = decide(
      log,
      proposal({ symbolId: "d", confidence: 0.6 }),
      input({ kind: "redirect", redirectTo: { symbolId: "elsewhere" } })
    );

    const stats = reviewStatistics(log);
    expect(stats.decided).toBe(4);
    expect(stats.accepted).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(stats.redirected).toBe(1);
    expect(stats.overrides).toBe(3);
    expect(stats.overrideRate).toBeCloseTo(0.75);
    expect(stats.byBand.suggest).toEqual({ decided: 2, overrides: 1 });
    expect(stats.byBand.discard).toEqual({ decided: 1, overrides: 1 });
    expect(stats.byBand.review).toEqual({ decided: 1, overrides: 1 });
  });

  it("counts a reviewer who reverses themselves once, not twice", () => {
    let log = emptyDecisionLog();
    log = decide(log, proposal({ confidence: 0.9 }), input({ kind: "reject" }));
    log = decide(log, proposal({ confidence: 0.9 }), input({ kind: "accept" }));

    const stats = reviewStatistics(log);
    expect(stats.auditEntries).toBe(2);
    expect(stats.decided).toBe(1);
    expect(stats.overrides).toBe(0);
    expect(stats.overrideRate).toBe(0);
  });

  it("a reject after a redirect removes the redirected link", () => {
    let log = emptyDecisionLog();
    log = decide(
      log,
      proposal(),
      input({ kind: "redirect", redirectTo: { symbolId: "ts:src/other.ts#real:function" } })
    );
    expect(deriveLinkState(log)).toHaveLength(1);

    log = decide(log, proposal(), input({ kind: "reject" }));
    expect(deriveLinkState(log)).toEqual([]);
  });

  it("keys proposals on a separator that cannot collide with an ID or a path", () => {
    // The property that matters is injectivity, not the exact spelling: two
    // distinct (requirement, symbol) pairs must never share a key, however
    // spaces or slashes fall in the parts.
    expect(proposalKey("REQ-X-001", "a b")).not.toBe(proposalKey("REQ-X-001 a", "b"));
    expect(proposalKey("REQ-X-001", "src/a.ts#s")).toBe(proposalKey("REQ-X-001", "src/a.ts#s"));
    expect(proposalKey("REQ-X-001", "a")).not.toBe(proposalKey("REQ-X-002", "a"));
  });

  it("reports zero override rate on an empty log rather than dividing by zero", () => {
    const stats = reviewStatistics(emptyDecisionLog());
    expect(stats.overrideRate).toBe(0);
    expect(stats.decided).toBe(0);
  });
});
