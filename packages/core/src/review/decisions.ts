/**
 * Review decisions (REQ-CORE-040) and audit separation (REQ-CORE-042) —
 * SPEC-CORE-000 §7.
 *
 * "No path shall create an accepted link without an explicit human decision"
 * is the product's core claim, so it is enforced by the shape of the module
 * rather than by review discipline. {@link deriveLinkState} is the only
 * function in the engine that produces a link, and its only input is
 * decisions. It has no parameter a proposal could be passed through, so
 * "accidentally promote a high-confidence proposal straight to a link" is not
 * a mistake this codebase can make — it is not an expressible operation.
 *
 * That is also what makes REQ-CORE-040 AC1 checkable by grep, as the AC asks:
 * find the callers of `deriveLinkState`, and you have found every path to link
 * state. Compare with the alternative — a `promote(proposal)` helper with a
 * comment asking callers to check for a decision first — where the grep finds
 * nothing and the guarantee rests on everyone having read the comment.
 *
 * The audit trail and link state are separate artifacts (REQ-CORE-042): the
 * log is append-only and keeps every decision ever made, while link state is
 * *derived* from it and holds only the current answer. Neither is
 * reconstructible from the other, which is the point — override rate needs the
 * history, and the frontmatter needs the current answer, and a single
 * structure serving both would have to lose one of them.
 */

import type { LinkRelationship } from "../evaluation/ground-truth.js";
import type { Proposal, TraceClassification } from "../ranking/types.js";
import type { ConfidenceBand } from "./bands.js";
import { proposalKey } from "./bands.js";

export const DECISION_LOG_ARTIFACT = "spectrace.decisions";
export const DECISION_LOG_VERSION = 1;

/**
 * `accept` — the link is as proposed. `reject` — there is no link.
 * `redirect` — there is a link, but to a different symbol than the model
 * named. Redirect is its own kind rather than a reject-plus-accept because the
 * distinction is evaluation data: it says retrieval put the reviewer in the
 * right neighbourhood and ranking picked the wrong door, which is a different
 * failure from either stage being simply wrong.
 */
export type DecisionKind = "accept" | "reject" | "redirect";

/** What a reviewer supplies. Identity, time, and commit are required (REQ-CORE-040). */
export interface DecisionInput {
  kind: DecisionKind;
  /** Reviewer identity — recorded verbatim; core does not resolve or validate identities. */
  reviewer: string;
  /** ISO 8601. Passed in rather than read from the clock: core is deterministic (NFR-CORE-002). */
  timestamp: string;
  repositoryCommit: string;
  /** Required for `redirect`, forbidden otherwise. */
  redirectTo?: { symbolId: string; relationship?: LinkRelationship };
  /** Optional reviewer note, retained in the audit trail. */
  note?: string;
}

/**
 * One entry in the append-only audit trail.
 *
 * The model's verdict is carried alongside the reviewer's, never merged into
 * it (REQ-CORE-041 AC2). Keeping `modelClassification`, `modelConfidence`, and
 * `band` beside `kind` is exactly what makes override rate computable later:
 * collapse them into a single "final" field and the question "how often was
 * the model wrong in a way a human caught" becomes unanswerable without
 * re-running the model.
 */
export interface Decision {
  requirementId: string;
  /** The symbol the model named. */
  proposedSymbolId: string;
  /** The symbol the link targets; differs from `proposedSymbolId` only on redirect. */
  symbolId: string;
  kind: DecisionKind;
  /** The relationship the accepted link asserts. Carried so link state never needs the proposal. */
  relationship: LinkRelationship;
  modelClassification: TraceClassification;
  modelConfidence: number;
  band: ConfidenceBand;
  reviewer: string;
  timestamp: string;
  repositoryCommit: string;
  note?: string;
}

export class InvalidDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDecisionError";
  }
}

/**
 * Builds a decision from a proposal and a reviewer's input.
 *
 * This is the one place proposal data crosses into a decision, and it crosses
 * by being copied rather than referenced — so a decision remains readable, and
 * link state remains derivable, long after the run that produced the proposal
 * is gone.
 */
export function recordDecision(
  proposal: Proposal,
  band: ConfidenceBand,
  input: DecisionInput
): Decision {
  if (input.reviewer.trim().length === 0) {
    throw new InvalidDecisionError("A decision requires a reviewer identity (REQ-CORE-040).");
  }
  if (input.kind === "redirect" && input.redirectTo === undefined) {
    throw new InvalidDecisionError("A redirect decision must name the symbol it redirects to.");
  }
  if (input.kind !== "redirect" && input.redirectTo !== undefined) {
    throw new InvalidDecisionError(`A ${input.kind} decision cannot carry a redirect target.`);
  }

  // An accepted link has to assert *some* relationship. Where the model said
  // `unrelated` and a human accepted anyway, the human is asserting a link the
  // model denied; `implements` is the default claim, and a reviewer who means
  // `supports` says so through `redirectTo.relationship`.
  const fallback: LinkRelationship =
    proposal.classification === "supports" ? "supports" : "implements";

  return {
    requirementId: proposal.requirementId,
    proposedSymbolId: proposal.symbolId,
    symbolId: input.redirectTo?.symbolId ?? proposal.symbolId,
    kind: input.kind,
    relationship: input.redirectTo?.relationship ?? fallback,
    modelClassification: proposal.classification,
    modelConfidence: proposal.confidence,
    band,
    reviewer: input.reviewer,
    timestamp: input.timestamp,
    repositoryCommit: input.repositoryCommit,
    ...(input.note === undefined ? {} : { note: input.note })
  };
}

/**
 * The audit trail: every decision ever made, in the order made (REQ-CORE-042).
 *
 * Append-only in normal operation. Nothing in this module removes or rewrites
 * an entry — {@link appendDecision} returns a new array rather than mutating,
 * so a caller holding an earlier log still holds exactly what it held.
 */
export interface DecisionLog {
  artifact: typeof DECISION_LOG_ARTIFACT;
  version: number;
  decisions: Decision[];
}

export function emptyDecisionLog(): DecisionLog {
  return { artifact: DECISION_LOG_ARTIFACT, version: DECISION_LOG_VERSION, decisions: [] };
}

/** Appends without mutating. A reversal is a new entry, never an edit to the old one. */
export function appendDecision(log: DecisionLog, decision: Decision): DecisionLog {
  return { ...log, decisions: [...log.decisions, decision] };
}

/** A link that exists because someone decided it does. */
export interface AcceptedLink {
  requirementId: string;
  symbolId: string;
  relationship: LinkRelationship;
  /** Who and when, carried through from the decision that created it. */
  reviewer: string;
  timestamp: string;
  repositoryCommit: string;
}

/**
 * Folds the audit trail into current link state (REQ-CORE-040, REQ-CORE-042).
 *
 * **The only function in the engine that produces a link, and it takes only
 * decisions.** A proposal cannot reach link state because there is no
 * parameter to pass one through.
 *
 * The latest decision on a proposal wins, which is what makes "accept then
 * reject" yield two audit entries and one final state (REQ-CORE-042 AC1). A
 * redirect supersedes the proposal's own symbol, so accepting `A` and later
 * redirecting to `B` leaves a link to `B` and none to `A`.
 */
export function deriveLinkState(log: DecisionLog): AcceptedLink[] {
  const latest = new Map<string, Decision>();
  for (const decision of log.decisions) {
    // Keyed by what was *proposed*, not by what was accepted: a redirect and
    // a later reject are decisions about the same proposal, and the reject has
    // to be able to find and supersede the redirect's link.
    latest.set(proposalKey(decision.requirementId, decision.proposedSymbolId), decision);
  }

  const links: AcceptedLink[] = [];
  for (const decision of latest.values()) {
    if (decision.kind === "reject") continue;
    links.push({
      requirementId: decision.requirementId,
      symbolId: decision.symbolId,
      relationship: decision.relationship,
      reviewer: decision.reviewer,
      timestamp: decision.timestamp,
      repositoryCommit: decision.repositoryCommit
    });
  }

  links.sort(
    (a, b) => a.requirementId.localeCompare(b.requirementId) || a.symbolId.localeCompare(b.symbolId)
  );
  return links;
}

/** Bands recorded at decision time, for {@link bucketProposals} (REQ-CORE-041). */
export function recordedBands(log: DecisionLog): Map<string, ConfidenceBand> {
  const bands = new Map<string, ConfidenceBand>();
  for (const decision of log.decisions) {
    bands.set(proposalKey(decision.requirementId, decision.proposedSymbolId), decision.band);
  }
  return bands;
}

export interface BandOverrides {
  /** Decisions taken on proposals in this band. */
  decided: number;
  /** Of those, decisions that contradicted what the band implied. */
  overrides: number;
}

/**
 * Override rate and review effort, computed from the audit trail alone
 * (REQ-CORE-042: "without reconstructing history").
 *
 * An override is a reviewer contradicting the band: rejecting what was
 * suggested, or accepting what would have been withheld. Redirects always
 * count — the model named the wrong symbol whatever confidence it had. Only
 * the latest decision on a proposal counts, so a reviewer who reverses
 * themselves contributes one override, not two.
 */
export interface ReviewStatistics {
  decided: number;
  accepted: number;
  rejected: number;
  redirected: number;
  overrides: number;
  /** Overrides ÷ decided; 0 when nothing has been decided. */
  overrideRate: number;
  byBand: Record<ConfidenceBand, BandOverrides>;
  /** Entries in the trail, including superseded ones — the review-effort figure. */
  auditEntries: number;
}

export function reviewStatistics(log: DecisionLog): ReviewStatistics {
  const latest = new Map<string, Decision>();
  for (const decision of log.decisions) {
    latest.set(proposalKey(decision.requirementId, decision.proposedSymbolId), decision);
  }

  const byBand: Record<ConfidenceBand, BandOverrides> = {
    suggest: { decided: 0, overrides: 0 },
    review: { decided: 0, overrides: 0 },
    discard: { decided: 0, overrides: 0 }
  };
  let accepted = 0;
  let rejected = 0;
  let redirected = 0;
  let overrides = 0;

  for (const decision of latest.values()) {
    if (decision.kind === "accept") accepted += 1;
    else if (decision.kind === "reject") rejected += 1;
    else redirected += 1;

    const overridden =
      decision.kind === "redirect" ||
      (decision.kind === "reject" && decision.band === "suggest") ||
      (decision.kind === "accept" && decision.band === "discard");

    byBand[decision.band].decided += 1;
    if (overridden) {
      byBand[decision.band].overrides += 1;
      overrides += 1;
    }
  }

  const decided = latest.size;
  return {
    decided,
    accepted,
    rejected,
    redirected,
    overrides,
    overrideRate: decided === 0 ? 0 : overrides / decided,
    byBand,
    auditEntries: log.decisions.length
  };
}

/** REQ-CORE-040 AC2 — decision records are exportable as JSON. */
export function serializeDecisionLog(log: DecisionLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}
