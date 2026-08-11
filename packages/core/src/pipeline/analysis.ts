/**
 * The analysis pipeline every client runs: retrieve → assemble → project →
 * rank (SPEC-CORE-000 §6; REQ-CLI-004, REQ-APP-012).
 *
 * This module exists for the reason `reporting/coverage-report.ts` exists.
 * REQ-APP-012 AC1 requires Studio's run to match the CLI's byte-for-byte at
 * the proposal level, and a parity test over two implementations can tell you
 * they have diverged but cannot stop them diverging. With one implementation,
 * parity is a property of the code and the test only confirms the wiring.
 *
 * ## What stays outside
 *
 * Providers are injected, never constructed here: core names no vendor, reads
 * no environment, and holds no credential (CLAUDE.md rule 2). Nothing here
 * touches the filesystem either — the caller reads the symbol index and writes
 * whatever artifacts it wants, because *when* to checkpoint is a client
 * decision (the CLI writes on flags, Studio writes per stage to satisfy
 * REQ-APP-012 AC3) and only the client knows where its files go.
 *
 * Credential errors, consent prompts, and flag-specific wording also stay with
 * the caller. What a missing key means differs between a command that should
 * exit 2 and a window that should show a dialog, and phrasing that names
 * `--accept-corpus-transmission` would be wrong in a GUI.
 */

import { DEFAULT_MERGE_STRATEGY, mergeCandidateSets, mergePoolSize } from "../retrieval/hybrid.js";
import { retrieveCandidates } from "../retrieval/retrieve.js";
import { retrieveSemanticCandidates } from "../retrieval/semantic.js";
import { buildRankingPrompt } from "../ranking/prompt.js";
import { rankCandidates } from "../ranking/rank.js";
import { estimateCostUsd } from "../ranking/usage.js";
import { bandFor, countByBand } from "../review/bands.js";
import type { EmbeddingCache } from "../retrieval/embedding-cache.js";
import type { CandidateSet } from "../retrieval/retrieve.js";
import type { CodeSymbol } from "../indexer/types.js";
import type { ConfidenceBand } from "../review/bands.js";
import type { ConfidenceBands, RetrievalMode } from "../config/types.js";
import type { EmbeddingProvider } from "../retrieval/semantic.js";
import type { MergeConfig } from "../retrieval/hybrid.js";
import type { TransmissionUnit } from "../transmission/bounded-payload.js";
import type {
  ModelPricing,
  Proposal,
  RankingProvider,
  RankRunResult,
  UsageRecord
} from "../ranking/types.js";

/**
 * Rough token estimate, used only where a real count cannot exist: the cost
 * projection, which by definition has made no call and so has no `usage` block
 * to read.
 *
 * Four characters per token is the widely used English approximation. It is
 * reported as an estimate everywhere it surfaces and never substituted for a
 * measured count — REQ-CORE-032's ledger records what the provider reported,
 * and this number never enters it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Retrieval query text for a requirement: title, statement, and acceptance
 * criteria, space-joined.
 *
 * The join is part of the contract, not a formatting detail — BM25F tokenizes
 * whatever it is handed, so two clients joining differently would score
 * differently and retrieve different candidates from identical requirements.
 * One definition, so that cannot happen.
 */
export function buildRequirementQueryText(requirement: {
  title: string;
  statement: string;
  acceptanceCriteria: readonly string[];
}): string {
  return [requirement.title, requirement.statement, ...requirement.acceptanceCriteria].join(" ");
}

// ---------- Retrieval dispatch (REQ-CORE-020…022) ----------

export interface RetrieveForModeOptions {
  queries: readonly { requirementId: string; text: string }[];
  symbols: readonly CodeSymbol[];
  repositoryCommit: string;
  mode: RetrievalMode;
  topK: number;
  merge?: MergeConfig;
  /** Required for `semantic` and `hybrid`; ignored by `lexical`. */
  provider?: EmbeddingProvider;
  cache?: EmbeddingCache;
}

export interface RetrieveForModeResult {
  results: CandidateSet[];
  configurationId: string;
  /** Present only when a model was involved, i.e. semantic and hybrid. */
  embedding?: {
    modelId: string;
    dimensions: number;
    embedded: number;
    cached: number;
    cache: EmbeddingCache;
  };
}

/**
 * Runs retrieval in whichever configuration is selected (REQ-CORE-022 AC1).
 *
 * The single dispatch point: `analyze`, `evaluate sweep`, and Studio all reach
 * retrieval through here, so a sweep's numbers always describe the command a
 * user actually invokes.
 *
 * Throws if a semantic or hybrid run is asked for without a provider. That is
 * a programming error rather than an operator error — deciding whether a
 * missing credential is an exit code or a dialog belongs to the caller, which
 * is why this refuses to guess instead of returning a soft failure.
 */
export async function retrieveForMode(
  options: RetrieveForModeOptions
): Promise<RetrieveForModeResult> {
  // Hybrid retrieves a wider pool per configuration and merges down to topK;
  // a merge of two already-truncated lists has little disagreement to exploit.
  const retrievalK = options.mode === "hybrid" ? mergePoolSize(options.topK) : options.topK;

  const runLexical = (): CandidateSet[] =>
    retrieveCandidates({
      queries: options.queries,
      symbols: options.symbols,
      topK: retrievalK,
      repositoryCommit: options.repositoryCommit
    });

  if (options.mode === "lexical") {
    const results = runLexical();
    return { results, configurationId: results[0]?.configurationId ?? "bm25f" };
  }

  if (options.provider === undefined) {
    throw new Error(`Retrieval mode "${options.mode}" needs an embedding provider.`);
  }

  const semantic = await retrieveSemanticCandidates({
    queries: options.queries,
    symbols: options.symbols,
    topK: retrievalK,
    repositoryCommit: options.repositoryCommit,
    provider: options.provider,
    ...(options.cache ? { cache: options.cache } : {})
  });

  const embedding = {
    modelId: options.provider.modelId,
    dimensions: options.provider.dimensions,
    embedded: semantic.embeddedCount,
    cached: semantic.cachedCount,
    cache: semantic.cache
  };

  if (options.mode === "semantic") {
    return {
      results: semantic.results,
      configurationId: semantic.results[0]?.configurationId ?? "embed",
      embedding
    };
  }

  const results = mergeCandidateSets({
    lexical: runLexical(),
    semantic: semantic.results,
    topK: options.topK,
    config: options.merge ?? { strategy: DEFAULT_MERGE_STRATEGY }
  });
  return {
    results,
    configurationId: results[0]?.configurationId ?? "hybrid",
    embedding
  };
}

// ---------- Cost projection (REQ-CLI-004 AC3, REQ-APP-012 AC2) ----------

/**
 * Output tokens budgeted per candidate for the pre-run projection.
 *
 * Output length is unknowable before the call, but modelling it as zero would
 * read low by exactly the expensive half, so the projection budgets a fixed
 * allowance and reports itself as an estimate. Tuned against observed runs; a
 * projection that is wrong in the same direction every time is worse than one
 * that is merely imprecise.
 */
export const OUTPUT_TOKENS_PER_CANDIDATE = 60;

export interface CostProjection {
  /** Provider calls the run would make. Units with no candidates make none. */
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Zero when no pricing was supplied — such a run is unpriced, not free. */
  estimatedCostUsd: number;
  /** False when no pricing was supplied, so a reader can tell the two apart. */
  priced: boolean;
}

/**
 * What the ranking stage would cost, computed from the assembled payload with
 * zero calls (REQ-CLI-004 AC3).
 *
 * Projected from the exact {@link TransmissionUnit}s the model will be handed,
 * not from a payload of the same shape, so the estimate describes this run.
 */
export function projectRankingCost(
  units: readonly TransmissionUnit[],
  pricing?: ModelPricing
): CostProjection {
  const totals = units.reduce(
    (acc, unit) => {
      if (unit.candidates.length === 0) return acc;
      const prompt = buildRankingPrompt(unit);
      return {
        calls: acc.calls + 1,
        inputTokens: acc.inputTokens + estimateTokens(prompt.system) + estimateTokens(prompt.user),
        outputTokens: acc.outputTokens + unit.candidates.length * OUTPUT_TOKENS_PER_CANDIDATE
      };
    },
    { calls: 0, inputTokens: 0, outputTokens: 0 }
  );

  return {
    ...totals,
    estimatedCostUsd: estimateCostUsd(totals.inputTokens, totals.outputTokens, pricing),
    priced: pricing !== undefined
  };
}

// ---------- Ranking with bands (REQ-CORE-030, REQ-CORE-041) ----------

/** A proposal carrying the band it falls into — what both clients render. */
export interface BandedProposal extends Proposal {
  band: ConfidenceBand;
}

export interface RankWithBandsOptions {
  units: readonly TransmissionUnit[];
  provider: RankingProvider;
  bands: ConfidenceBands;
  pricing?: ModelPricing;
  /** Usage from earlier stages (embedding) folded into this run's totals. */
  priorUsage?: readonly UsageRecord[];
  onProgress?: (completed: number, total: number) => void;
  signal?: { readonly aborted: boolean };
}

export interface RankWithBandsResult extends Omit<RankRunResult, "proposals"> {
  proposals: BandedProposal[];
  bandCounts: ReturnType<typeof countByBand>;
}

/**
 * Ranks the assembled payload and assigns each proposal its band
 * (REQ-CORE-030, REQ-CORE-041).
 *
 * The pairing lives here rather than in each client because the band is not
 * cosmetic — it decides what reaches a reviewer's queue at all, so two clients
 * banding independently could show different queues from identical proposals.
 */
export async function rankWithBands(
  options: RankWithBandsOptions
): Promise<RankWithBandsResult> {
  const result = await rankCandidates({
    units: options.units,
    provider: options.provider,
    ...(options.pricing === undefined ? {} : { pricing: options.pricing }),
    ...(options.priorUsage === undefined ? {} : { priorUsage: options.priorUsage }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });

  const proposals: BandedProposal[] = result.proposals.map((proposal) => ({
    ...proposal,
    band: bandFor(proposal.confidence, proposal.classification, options.bands)
  }));

  return {
    ...result,
    proposals,
    bandCounts: countByBand(
      proposals.map((proposal) => ({ proposal, band: proposal.band, reviewed: false }))
    )
  };
}
