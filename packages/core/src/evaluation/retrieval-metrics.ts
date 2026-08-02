/**
 * Retrieval evaluation metrics (REQ-CORE-070; prelim spec §10).
 *
 * Promoted from the retired Phase A feasibility harness so experiments
 * measure the shipped engine. Pure computation: results, requirements, and
 * ground truth in; a structuredClone-safe report out (REQ-CORE-070 AC3).
 */

import type { GroundTruthFile, LabelPass } from "./ground-truth.js";

/**
 * The requirement facts evaluation needs — deliberately narrower than the
 * full requirement schema (REQ-CORE-001) so callers outside the experiment
 * can evaluate without difficulty strata.
 */
export interface EvaluationRequirement {
  id: string;
  /** Difficulty stratum label (prelim spec §6.2); omit outside the experiment. */
  difficulty?: string;
}

/** The slice of a retrieval result metrics actually consume (structural subset of CandidateSet). */
export interface ScoredResult {
  requirementId: string;
  candidates: readonly { rank: number; symbolId: string }[];
}

export interface RetrievalMetricsBreakdown {
  label: string;
  /** Requirements actually included in the averages below (i.e. have at least one `implements` link in scope). */
  requirementCount: number;
  /** Requirements in this slice with no `implements` link in scope, excluded from the averages rather than silently scored as zero. */
  requirementsWithoutGroundTruth: string[];
  /** Macro-averaged Recall@k, keyed by k as a string (prelim spec §10.1). */
  recallAtK: Record<string, number>;
  /** Percentage (0-100) of requirements with a hit in the top k (prelim spec §10.2). */
  hitAtK: Record<string, number>;
  /** Mean reciprocal rank, zero contributed by requirements with no correct candidate retained (prelim spec §10.3). */
  meanReciprocalRank: number;
}

export interface RetrievalMetricsReport {
  ks: number[];
  breakdowns: RetrievalMetricsBreakdown[];
}

/** REQ-CORE-070 AC1. */
export const DEFAULT_METRIC_KS: readonly number[] = [1, 3, 5, 10];

/** Difficulty rows are reported in stratum order (prelim spec §6.2), then any other labels alphabetically. */
const CANONICAL_DIFFICULTY_ORDER: readonly string[] = ["high-overlap", "partial-overlap", "domain-vocabulary"];

interface RequirementMetrics {
  requirementId: string;
  recallAtK: Map<number, number>;
  hitAtK: Map<number, number>;
  reciprocalRank: number;
  hasGroundTruth: boolean;
}

/** Only `implements` links count as relevant (REQ-CORE-070 AC2; prelim spec §7.3); `supports` links never do. */
function relevantSymbolIds(
  groundTruth: GroundTruthFile,
  requirementId: string,
  labelPasses: readonly LabelPass[]
): Set<string> {
  const ids = new Set<string>();
  for (const link of groundTruth.links) {
    if (
      link.requirementId === requirementId &&
      link.relationship === "implements" &&
      labelPasses.includes(link.labelPass)
    ) {
      ids.add(link.symbolId);
    }
  }
  return ids;
}

function computeForRequirement(
  requirementId: string,
  candidates: readonly { rank: number; symbolId: string }[],
  relevant: ReadonlySet<string>,
  ks: readonly number[]
): RequirementMetrics {
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const recallAtK = new Map<number, number>();
  const hitAtK = new Map<number, number>();

  for (const k of ks) {
    const topK = sorted.filter((c) => c.rank <= k);
    const hits = topK.filter((c) => relevant.has(c.symbolId)).length;
    recallAtK.set(k, relevant.size > 0 ? hits / relevant.size : 0);
    hitAtK.set(k, topK.some((c) => relevant.has(c.symbolId)) ? 1 : 0);
  }

  let reciprocalRank = 0;
  for (const candidate of sorted) {
    if (relevant.has(candidate.symbolId)) {
      reciprocalRank = 1 / candidate.rank;
      break;
    }
  }

  return { requirementId, recallAtK, hitAtK, reciprocalRank, hasGroundTruth: relevant.size > 0 };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function aggregate(
  label: string,
  perRequirement: readonly RequirementMetrics[],
  ks: readonly number[]
): RetrievalMetricsBreakdown {
  const scored = perRequirement.filter((r) => r.hasGroundTruth);
  const unscored = perRequirement.filter((r) => !r.hasGroundTruth).map((r) => r.requirementId);

  const recallAtK: Record<string, number> = {};
  const hitAtK: Record<string, number> = {};
  for (const k of ks) {
    recallAtK[String(k)] = average(scored.map((r) => r.recallAtK.get(k) ?? 0));
    hitAtK[String(k)] = average(scored.map((r) => r.hitAtK.get(k) ?? 0)) * 100;
  }

  return {
    label,
    requirementCount: scored.length,
    requirementsWithoutGroundTruth: unscored,
    recallAtK,
    hitAtK,
    meanReciprocalRank: average(scored.map((r) => r.reciprocalRank))
  };
}

/**
 * Computes Recall@k, Hit@k, and MRR (prelim spec §10) with the required
 * breakdowns (§10.4): "overall" and "independent-only" both use only
 * `independent`-pass links and are numerically identical — reported as
 * separate rows anyway because the spec names them as distinct required
 * breakdowns; "independent-plus-candidate-review" is the paired comparison
 * showing how much recall depends on the pass-two additions. A difficulty
 * row appears for each distinct difficulty label present among the
 * requirements; requirements without a difficulty appear only in the
 * whole-set rows.
 */
export function evaluateRetrieval(params: {
  results: readonly ScoredResult[];
  groundTruth: GroundTruthFile;
  requirements: readonly EvaluationRequirement[];
  ks?: readonly number[];
}): RetrievalMetricsReport {
  const ks = params.ks ?? DEFAULT_METRIC_KS;
  const candidatesByRequirement = new Map(params.results.map((r) => [r.requirementId, r.candidates]));

  function computeAll(requirementIds: readonly string[], labelPasses: readonly LabelPass[]): RequirementMetrics[] {
    return requirementIds.map((id) => {
      const candidates = candidatesByRequirement.get(id) ?? [];
      const relevant = relevantSymbolIds(params.groundTruth, id, labelPasses);
      return computeForRequirement(id, candidates, relevant, ks);
    });
  }

  const allIds = params.requirements.map((r) => r.id);

  const present = new Set(
    params.requirements.map((r) => r.difficulty).filter((d): d is string => typeof d === "string" && d.length > 0)
  );
  const difficulties = [
    ...CANONICAL_DIFFICULTY_ORDER.filter((d) => present.has(d)),
    ...[...present].filter((d) => !CANONICAL_DIFFICULTY_ORDER.includes(d)).sort()
  ];
  const idsForDifficulty = (difficulty: string): string[] =>
    params.requirements.filter((r) => r.difficulty === difficulty).map((r) => r.id);

  const breakdowns: RetrievalMetricsBreakdown[] = [
    aggregate("overall", computeAll(allIds, ["independent"]), ks),
    ...difficulties.map((d) => aggregate(d, computeAll(idsForDifficulty(d), ["independent"]), ks)),
    aggregate("independent-only", computeAll(allIds, ["independent"]), ks),
    aggregate(
      "independent-plus-candidate-review",
      computeAll(allIds, ["independent", "candidate_review"]),
      ks
    )
  ];

  return { ks: [...ks], breakdowns };
}
