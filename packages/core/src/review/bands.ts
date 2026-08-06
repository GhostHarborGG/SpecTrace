/**
 * Confidence bands (REQ-CORE-041) — SPEC-CORE-000 §7.
 *
 * Bands exist to triage reviewer attention, not to automate it. Nothing here
 * accepts anything: the highest band is named `suggest` because even a
 * proposal the model is certain about is still a suggestion until a human
 * decides (REQ-CORE-040). The only thing a band changes is how prominently a
 * proposal is put in front of someone.
 *
 * Thresholds are configuration (REQ-CORE-004) and the active values are
 * recorded in provenance, so a re-bucketing after a threshold change is
 * traceable to the values in force when it happened.
 */

import type { ConfidenceBands } from "../config/types.js";
import type { Proposal } from "../ranking/types.js";

/**
 * `suggest` — presented as a suggested link. `review` — queued for review.
 * `discard` — withheld, but retained and inspectable, which is why this is a
 * band rather than a filter. A proposal nobody can see is a proposal nobody
 * can find the tool wrong about.
 */
export type ConfidenceBand = "suggest" | "review" | "discard";

/**
 * Which band a classification and confidence fall into.
 *
 * An `unrelated` verdict lands in `discard` at any confidence, and that is not
 * a special case bolted on — it follows from what the band means. The bands
 * rank *link claims*; `unrelated` is the absence of one. Reading confidence
 * alone would put a model's most emphatic "these are unrelated" at 0.95 into
 * the `suggest` band and present it as a link, which inverts the answer.
 *
 * Boundaries are inclusive at the bottom of each band, matching the spec's
 * "above the suggest threshold (default 0.75)" and "between review thresholds
 * (0.50–0.74)": exactly 0.75 suggests, exactly 0.50 reviews.
 */
export function bandFor(
  confidence: number,
  classification: Proposal["classification"],
  bands: ConfidenceBands
): ConfidenceBand {
  if (classification === "unrelated") return "discard";
  if (confidence >= bands.suggest) return "suggest";
  if (confidence >= bands.review) return "review";
  return "discard";
}

/** A proposal with the band it currently falls into, and why that band is fixed or not. */
export interface BucketedProposal {
  proposal: Proposal;
  band: ConfidenceBand;
  /**
   * True when a reviewer has already decided this proposal. Such a proposal is
   * reported at the band recorded with its decision and is never re-bucketed
   * (REQ-CORE-041), because re-bucketing it would rewrite the context a person
   * decided in.
   */
  reviewed: boolean;
}

/** The band a decided proposal was in when it was decided, keyed by proposal identity. */
export type RecordedBands = ReadonlyMap<string, ConfidenceBand>;

/**
 * Separator for {@link proposalKey}. NUL cannot occur in a requirement ID or
 * in a POSIX path (CLAUDE.md rule 4), so no two distinct proposals can collide
 * on a shared key however a symbol ID is spelled. A separator that can appear
 * in the parts it separates is a collision waiting for the first path with a
 * space in it.
 */
const KEY_SEPARATOR = "\u0000";

/** Stable key for a proposal: a requirement and the symbol the model named. */
export function proposalKey(requirementId: string, symbolId: string): string {
  return `${requirementId}${KEY_SEPARATOR}${symbolId}`;
}

/**
 * Buckets proposals under the given thresholds (REQ-CORE-041).
 *
 * `recordedBands` carries the band each already-decided proposal was in at
 * decision time. Those proposals keep that band; everything else is bucketed
 * against the thresholds passed in. That is the whole of "threshold changes
 * re-bucket only unreviewed proposals and never alter past decisions" — a
 * reviewer who rejected something the tool had called a strong suggestion
 * should still see, a month and a threshold change later, that it *was* a
 * strong suggestion when they rejected it. Rewriting that band would quietly
 * revise the record of what they were shown.
 */
export function bucketProposals(
  proposals: readonly Proposal[],
  bands: ConfidenceBands,
  recordedBands: RecordedBands = new Map()
): BucketedProposal[] {
  return proposals.map((proposal) => {
    const recorded = recordedBands.get(proposalKey(proposal.requirementId, proposal.symbolId));
    if (recorded !== undefined) {
      return { proposal, band: recorded, reviewed: true };
    }
    return {
      proposal,
      band: bandFor(proposal.confidence, proposal.classification, bands),
      reviewed: false
    };
  });
}

export interface BandCounts {
  suggest: number;
  review: number;
  discard: number;
}

export function countByBand(bucketed: readonly BucketedProposal[]): BandCounts {
  const counts: BandCounts = { suggest: 0, review: 0, discard: 0 };
  for (const entry of bucketed) counts[entry.band] += 1;
  return counts;
}
