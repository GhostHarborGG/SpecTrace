import type { RetrievalResult } from "../retrieval/rank.js";
import type { ParsedRequirement } from "../requirements/types.js";
import type { GroundTruthFile, LabelPass } from "./ground-truth.js";

export interface RetrievalMetricsBreakdown {
  label: string;
  /** Requirements actually included in the averages below (i.e. have at least one `implements` link in scope). */
  requirementCount: number;
  /** Requirements in this slice with no `implements` link in scope, excluded from the averages rather than silently scored as zero. */
  requirementsWithoutGroundTruth: string[];
  /** Macro-averaged Recall@k, keyed by k as a string (spec §10.1). */
  recallAtK: Record<string, number>;
  /** Percentage (0-100) of requirements with a hit in the top k (spec §10.2). */
  hitAtK: Record<string, number>;
  /** Mean reciprocal rank, zero contributed by requirements with no correct candidate retained (spec §10.3). */
  meanReciprocalRank: number;
}

export interface RetrievalMetricsReport {
  ks: number[];
  breakdowns: RetrievalMetricsBreakdown[];
}

interface RequirementMetrics {
  requirementId: string;
  recallAtK: Map<number, number>;
  hitAtK: Map<number, number>;
  reciprocalRank: number;
  hasGroundTruth: boolean;
}

/** Only `implements` links count as primary relevant results (spec §7.3); `supports` links are out of scope here. */
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
 * Computes Recall@k, Hit@k, and MRR (spec §10) with the required breakdowns
 * (§10.4). "Overall" and "Independent ground truth only" are numerically
 * identical — both use only `independent`-pass links — and are reported as
 * separate rows anyway because the spec names them as distinct required
 * breakdowns; "Independent plus candidate-review" is the paired comparison
 * that shows how much recall depends on the pass-two threat-to-validity
 * additions.
 */
export function evaluateRetrieval(params: {
  results: readonly RetrievalResult[];
  groundTruth: GroundTruthFile;
  requirements: readonly ParsedRequirement[];
  ks?: readonly number[];
}): RetrievalMetricsReport {
  const ks = params.ks ?? [1, 3, 5, 10];
  const candidatesByRequirement = new Map(params.results.map((r) => [r.requirementId, r.candidates]));

  function computeAll(requirementIds: readonly string[], labelPasses: readonly LabelPass[]): RequirementMetrics[] {
    return requirementIds.map((id) => {
      const candidates = candidatesByRequirement.get(id) ?? [];
      const relevant = relevantSymbolIds(params.groundTruth, id, labelPasses);
      return computeForRequirement(id, candidates, relevant, ks);
    });
  }

  const allIds = params.requirements.map((r) => r.id);
  const idsForDifficulty = (difficulty: ParsedRequirement["difficulty"]): string[] =>
    params.requirements.filter((r) => r.difficulty === difficulty).map((r) => r.id);

  const breakdowns: RetrievalMetricsBreakdown[] = [
    aggregate("overall", computeAll(allIds, ["independent"]), ks),
    aggregate("high-overlap", computeAll(idsForDifficulty("high-overlap"), ["independent"]), ks),
    aggregate("partial-overlap", computeAll(idsForDifficulty("partial-overlap"), ["independent"]), ks),
    aggregate("domain-vocabulary", computeAll(idsForDifficulty("domain-vocabulary"), ["independent"]), ks),
    aggregate("independent-only", computeAll(allIds, ["independent"]), ks),
    aggregate(
      "independent-plus-candidate-review",
      computeAll(allIds, ["independent", "candidate_review"]),
      ks
    )
  ];

  return { ks: [...ks], breakdowns };
}
