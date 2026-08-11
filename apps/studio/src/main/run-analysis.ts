/**
 * The analysis run for the main process (REQ-APP-012).
 *
 * Every engine judgement here comes from core's shared pipeline —
 * `retrieveForMode`, `projectRankingCost`, `rankWithBands` — the same
 * functions `spectrace analyze` calls. AC1's byte-for-byte claim is a property
 * of there being one implementation, not of two being tested against each
 * other (SPEC-APP-000 §2, NFR-APP-007).
 *
 * What this module owns is what core deliberately refuses to: reading the
 * repository, constructing a provider from a credential, writing artifacts,
 * and deciding when to checkpoint. That last one is AC3 — the run writes each
 * stage's artifact as that stage finishes, so cancelling leaves everything
 * completed so far on disk and nothing half-written.
 *
 * Electron-free like `./vault.ts`, `./analysis.ts`, and `./coverage.ts`, so
 * the run tests in plain Node without booting a window. The IPC wiring that
 * streams these events to the renderer lives in `./index.ts`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  CORE_VERSION,
  RANKING_PROMPT_VERSION,
  buildTransmissionUnits,
  indexRepository,
  loadConfig,
  projectRankingCost,
  rankWithBands,
  retrieveForMode,
  serializeRetrievalResults,
  serializeSymbolIndex,
  toPosixPath,
  type CodeSymbol,
  type CostProjection,
  type EmbeddingProvider,
  type ModelPricing,
  type RankingProvider,
  type RetrievalMode,
  type UsageReport
} from "@spectrace/core";
import { headCommit } from "./coverage.js";
import type { AnalysisStage, RunProgress, RunResult } from "../shared/ipc.js";

export interface RunAnalysisOptions {
  /** Repository root holding `.spectrace/` and the vault. */
  root: string;
  /**
   * The requirements to retrieve for, already reduced to query text.
   *
   * Taken as input rather than derived here, because *how* a requirement
   * becomes query text is the one seam where Studio and the CLI still differ:
   * the CLI's `analyze` loads the evaluation-corpus format, whose `##
   * Statement` section feeds `buildRequirementQueryText`, while core's vault
   * schema (REQ-CORE-001) does not carry a statement at all. Until that is
   * reconciled, the difference belongs in one visible place instead of being
   * buried inside the run. See the REQ-APP-012 note.
   */
  queries: readonly { requirementId: string; text: string }[];
  /**
   * Ranking provider. Absent, the run stops after retrieval — the same
   * behaviour as `analyze` with no model configured, and the reason a Studio
   * user with no key still gets an index and candidates.
   */
  rankingProvider?: RankingProvider;
  /** Required for semantic and hybrid retrieval; absent, those modes throw. */
  embeddingProvider?: EmbeddingProvider;
  pricing?: ModelPricing;
  /** Overrides `retrieval.mode` from configuration, as the CLI's `--mode` does. */
  mode?: RetrievalMode;
  onProgress?: (progress: RunProgress) => void;
  signal?: { readonly aborted: boolean };
}

/** Where each stage checkpoints. Stable paths, so a cancelled run is resumable by hand. */
export function artifactPaths(root: string): Record<"index" | "retrieval" | "proposals", string> {
  const dir = join(resolve(root), ".spectrace");
  return {
    index: join(dir, "index.jsonl"),
    retrieval: join(dir, "retrieval.json"),
    proposals: join(dir, "proposals.json")
  };
}

function writeArtifact(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

/**
 * Runs index → retrieve → rank, checkpointing each stage (REQ-APP-012).
 *
 * Cancellation is cooperative and checked at stage boundaries and, inside
 * ranking, between provider calls. A cancelled run returns what it completed
 * with `cancelled: true` rather than throwing: AC3 is precisely that the last
 * completed stage's artifacts survive, and an exception would invite the
 * caller to discard them.
 */
export async function runAnalysis(options: RunAnalysisOptions): Promise<RunResult> {
  const root = resolve(options.root);
  const paths = artifactPaths(root);
  const { config } = loadConfig(root);
  const repositoryCommit = headCommit(root);
  const written: string[] = [];

  const report = (stage: AnalysisStage, completed: number, total: number, detail?: string): void => {
    options.onProgress?.({
      stage,
      completed,
      total,
      ...(detail === undefined ? {} : { detail })
    });
  };

  const cancelled = (): boolean => options.signal?.aborted === true;
  const stop = (stage: AnalysisStage): RunResult => ({
    cancelled: true,
    cancelledDuring: stage,
    repositoryCommit,
    artifactsWritten: written
  });

  // ---------- Stage 1: index (REQ-CORE-010, REQ-CORE-012) ----------

  if (cancelled()) return stop("index");
  report("index", 0, 1, "Reading source files");

  const indexed = indexRepository({
    repositoryRoot: root,
    repositoryCommit,
    additionalExcludePatterns: config.exclude
  });
  const symbols: CodeSymbol[] = indexed.symbols;

  writeArtifact(
    paths.index,
    serializeSymbolIndex(symbols, {
      repositoryCommit,
      engineVersion: CORE_VERSION,
      excludePatterns: [...config.exclude]
    })
  );
  written.push(toPosixPath(paths.index));
  report("index", 1, 1, `${symbols.length} symbol(s)`);

  // ---------- Stage 2: retrieval (REQ-CORE-020…022) ----------

  if (cancelled()) return stop("retrieve");

  const queries = options.queries;
  report("retrieve", 0, queries.length, `${queries.length} requirement(s)`);

  const mode = options.mode ?? config.retrieval.mode;
  const topK = config.retrieval.topK;

  const retrieval = await retrieveForMode({
    queries,
    symbols,
    repositoryCommit,
    mode,
    topK,
    ...(options.embeddingProvider ? { provider: options.embeddingProvider } : {})
  });

  const provenance = {
    repositoryCommit,
    configurationId: retrieval.configurationId,
    engineVersion: CORE_VERSION
  };
  writeArtifact(paths.retrieval, serializeRetrievalResults(retrieval.results, provenance));
  written.push(toPosixPath(paths.retrieval));
  report("retrieve", queries.length, queries.length, `configuration ${retrieval.configurationId}`);

  // ---------- Stage 3: the bounded payload and its projected cost ----------

  if (cancelled()) return stop("estimate");

  const units = buildTransmissionUnits({
    requirementTexts: new Map(queries.map((query) => [query.requirementId, query.text])),
    candidateSets: retrieval.results,
    symbols,
    topK
  });

  // AC2's first half: the estimate is emitted before the ranking stage starts,
  // computed from the exact payload the model will receive rather than from
  // one of the same shape.
  const projection: CostProjection = projectRankingCost(
    units,
    options.pricing === undefined ? undefined : options.pricing
  );
  report("estimate", 1, 1, `${projection.calls} call(s) projected`);

  if (options.rankingProvider === undefined) {
    // No model configured: retrieval is the whole run, exactly as `analyze`
    // stops after retrieval rather than erroring.
    return {
      cancelled: false,
      repositoryCommit,
      configurationId: retrieval.configurationId,
      symbolCount: symbols.length,
      requirementCount: queries.length,
      projection,
      artifactsWritten: written
    };
  }

  // ---------- Stage 4: ranking (REQ-CORE-030…032, REQ-CORE-041) ----------

  if (cancelled()) return stop("rank");
  report("rank", 0, units.length);

  const ranked = await rankWithBands({
    units,
    provider: options.rankingProvider,
    bands: config.bands,
    ...(options.pricing === undefined ? {} : { pricing: options.pricing }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    onProgress: (completed, total) => report("rank", completed, total)
  });

  // Written whether or not the run was cancelled: proposals produced before
  // the stop are real work, and AC3's promise is that completed work survives.
  writeArtifact(
    paths.proposals,
    `${JSON.stringify(
      {
        artifact: "spectrace.proposals",
        version: 1,
        repositoryCommit,
        configurationId: retrieval.configurationId,
        engineVersion: CORE_VERSION,
        promptVersion: ranked.promptVersion,
        modelId: ranked.modelId,
        bands: config.bands,
        proposals: ranked.proposals,
        failures: ranked.failures,
        rawResponses: ranked.rawResponses,
        usage: ranked.usage,
        ...(ranked.cancelled ? { partial: true } : {})
      },
      null,
      2
    )}\n`
  );
  written.push(toPosixPath(paths.proposals));

  // AC2's second half: measured usage, from REQ-CORE-032's ledger — what the
  // provider reported, never the estimate restated.
  const usage: UsageReport = ranked.usage;
  report("rank", units.length, units.length, `${usage.run.calls} call(s) made`);

  return {
    cancelled: ranked.cancelled,
    ...(ranked.cancelled ? { cancelledDuring: "rank" as const } : {}),
    repositoryCommit,
    configurationId: retrieval.configurationId,
    symbolCount: symbols.length,
    requirementCount: queries.length,
    projection,
    proposalCount: ranked.proposals.length,
    bandCounts: ranked.bandCounts,
    failureCount: ranked.failures.length,
    usage,
    promptVersion: RANKING_PROMPT_VERSION,
    modelId: ranked.modelId,
    artifactsWritten: written
  };
}
