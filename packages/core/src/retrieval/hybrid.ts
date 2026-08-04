/**
 * Hybrid retrieval — Configuration C (REQ-CORE-022).
 *
 * Merges a lexical and a semantic candidate list into one. Two strategies
 * ship behind a versioned registry, per BP's 2026-08-03 resolution of the
 * Phase C open item: implement both, measure both on the frozen corpus, then
 * choose the default from the numbers rather than from an argument.
 *
 * - `rrf-v1` — reciprocal rank fusion. Merges on *ranks*, so it needs no
 *   calibration between unbounded BM25 scores and cosine similarities bounded
 *   to [-1, 1]. That scale mismatch is exactly what makes a naive weighted
 *   sum fragile, which is why this is the one to beat.
 * - `weighted-v1` — per-requirement min-max normalization, then an α-weighted
 *   sum. More expressive, and able to express "lexical is mostly right here",
 *   but it introduces a tunable that counts against the same overfitting
 *   budget the Phase A measured-version cap protects.
 *
 * Strategy identifiers share the namespace with the lexical scoring versions,
 * so a merge strategy is burned the same way a BM25F revision is if it
 * regresses.
 *
 * **The candidate pool is deliberately wider than the output.** A merge whose
 * two inputs are each truncated to k can only ever see k items per list, and
 * the entire premise of hybrid retrieval is that the lists disagree — so each
 * configuration retrieves `poolK` (default 2k) and the merged list is
 * truncated to k afterwards. Semantic retrieval pays per symbol embedded, not
 * per k, so a wider pool is free there; lexical is local.
 */

import type { CandidateSet, RankedCandidate } from "./retrieve.js";

export type MergeStrategyId = "rrf-v1" | "weighted-v1";

export const MERGE_STRATEGY_IDS: readonly MergeStrategyId[] = ["rrf-v1", "weighted-v1"];

/**
 * Default merge strategy. `rrf-v1` until the frozen-corpus comparison says
 * otherwise (BP decides; see REQ-CORE-022 notes).
 */
export const DEFAULT_MERGE_STRATEGY: MergeStrategyId = "rrf-v1";

export interface MergeConfig {
  strategy: MergeStrategyId;
  /**
   * `rrf-v1` rank damping. 60 is the value from the original RRF paper and
   * the usual default; it flattens the difference between ranks 1 and 2 so a
   * single confident list cannot dominate outright.
   */
  rrfK?: number;
  /** `weighted-v1` lexical share, in [0, 1]. The semantic share is 1 − α. Default 0.5. */
  alpha?: number;
}

export const DEFAULT_RRF_K = 60;
export const DEFAULT_ALPHA = 0.5;

export interface MergeOptions {
  lexical: readonly CandidateSet[];
  semantic: readonly CandidateSet[];
  /** Candidates retained per requirement after merging. */
  topK: number;
  config?: MergeConfig;
}

/** Identifier recorded on merged results (REQ-CORE-063), naming both inputs and the strategy. */
export function hybridConfigurationId(
  lexicalId: string,
  semanticId: string,
  config: MergeConfig
): string {
  const parameters =
    config.strategy === "rrf-v1"
      ? `k=${config.rrfK ?? DEFAULT_RRF_K}`
      : `a=${config.alpha ?? DEFAULT_ALPHA}`;
  return `hybrid(${config.strategy};${parameters})[${lexicalId}+${semanticId}]`;
}

/**
 * Min-max normalizes scores to [0, 1] within one candidate list.
 *
 * When every score is identical the range is zero and there is no meaningful
 * spread to preserve; all entries normalize to 1, since they are equally the
 * best this list has to offer. Mapping them to 0 instead would silently
 * delete a whole configuration's opinion.
 */
function normalizeScores(candidates: readonly RankedCandidate[]): Map<string, number> {
  const normalized = new Map<string, number>();
  if (candidates.length === 0) return normalized;

  let min = Infinity;
  let max = -Infinity;
  for (const candidate of candidates) {
    if (candidate.score < min) min = candidate.score;
    if (candidate.score > max) max = candidate.score;
  }

  const range = max - min;
  for (const candidate of candidates) {
    normalized.set(candidate.symbolId, range === 0 ? 1 : (candidate.score - min) / range);
  }
  return normalized;
}

function mergeOne(
  lexical: CandidateSet | undefined,
  semantic: CandidateSet | undefined,
  topK: number,
  config: MergeConfig
): RankedCandidate[] {
  const lexicalCandidates = lexical?.candidates ?? [];
  const semanticCandidates = semantic?.candidates ?? [];

  const scores = new Map<string, number>();
  const add = (symbolId: string, contribution: number) => {
    scores.set(symbolId, (scores.get(symbolId) ?? 0) + contribution);
  };

  if (config.strategy === "rrf-v1") {
    const rrfK = config.rrfK ?? DEFAULT_RRF_K;
    for (const candidate of lexicalCandidates) add(candidate.symbolId, 1 / (rrfK + candidate.rank));
    for (const candidate of semanticCandidates) add(candidate.symbolId, 1 / (rrfK + candidate.rank));
  } else {
    const alpha = config.alpha ?? DEFAULT_ALPHA;
    const lexicalNormalized = normalizeScores(lexicalCandidates);
    const semanticNormalized = normalizeScores(semanticCandidates);
    // A symbol absent from a list contributes nothing from it, rather than
    // being penalized — absence is "not retrieved", not "scored zero".
    for (const [symbolId, score] of lexicalNormalized) add(symbolId, alpha * score);
    for (const [symbolId, score] of semanticNormalized) add(symbolId, (1 - alpha) * score);
  }

  return [...scores.entries()]
    .map(([symbolId, score]) => ({ symbolId, score }))
    .sort((a, b) => b.score - a.score || a.symbolId.localeCompare(b.symbolId))
    .slice(0, topK)
    .map((entry, i) => ({ rank: i + 1, symbolId: entry.symbolId, score: entry.score }));
}

/**
 * Merges lexical and semantic candidate lists per requirement (REQ-CORE-022).
 *
 * The requirement set is taken from the lexical run and extended with any
 * requirement only the semantic run produced, so a requirement is never
 * silently dropped because one configuration returned nothing for it.
 * Deterministic for fixed inputs: ties break on symbol ID.
 */
export function mergeCandidateSets(options: MergeOptions): CandidateSet[] {
  const config: MergeConfig = options.config ?? { strategy: DEFAULT_MERGE_STRATEGY };
  const lexicalById = new Map(options.lexical.map((set) => [set.requirementId, set]));
  const semanticById = new Map(options.semantic.map((set) => [set.requirementId, set]));

  const requirementIds = [
    ...options.lexical.map((set) => set.requirementId),
    ...options.semantic.map((set) => set.requirementId).filter((id) => !lexicalById.has(id))
  ];

  const lexicalId = options.lexical[0]?.configurationId ?? "none";
  const semanticId = options.semantic[0]?.configurationId ?? "none";
  const configurationId = hybridConfigurationId(lexicalId, semanticId, config);

  return requirementIds.map((requirementId) => {
    const lexical = lexicalById.get(requirementId);
    const semantic = semanticById.get(requirementId);
    return {
      requirementId,
      configurationId,
      repositoryCommit: lexical?.repositoryCommit ?? semantic?.repositoryCommit ?? "",
      candidates: mergeOne(lexical, semantic, options.topK, config)
    };
  });
}

/**
 * Pool size each configuration should retrieve before merging. Wider than the
 * output on purpose — see this module's header.
 */
export function mergePoolSize(topK: number): number {
  return topK * 2;
}
