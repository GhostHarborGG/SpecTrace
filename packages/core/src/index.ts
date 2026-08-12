/**
 * @spectrace/core — public API surface.
 *
 * Contract source: specs/spectrace-core-spec.md (SPEC-CORE-000), with
 * requirement bodies in specs/requirements/REQ-CORE-*.md.
 * Design rules (CLAUDE.md): no console output, no env reads, no
 * process.exit; all returns structuredClone-safe; POSIX paths in
 * all stored artifacts and symbol identifiers.
 *
 * Status: implementations land per phase:
 *   REQ-CORE-010 indexing, REQ-CORE-020 lexical retrieval, and
 *   REQ-CORE-070/071 evaluation are implemented (promoted from the Phase A
 *   feasibility harness after review). REQ-CORE-011 exclusions is partial:
 *   pattern matching holds, stale-proposal flagging waits on Phase D.
 *   REQ-CORE-001/002 schema and validation, REQ-CORE-003/004 templates and
 *   config, and REQ-CORE-012 the local index artifact are implemented.
 *   REQ-CORE-023 bounded candidate sets is implemented — the gate every
 *   model payload passes through, which Phase D's ranking consumes.
 *   REQ-CORE-021/022 semantic and hybrid retrieval are implemented.
 *   REQ-CORE-030/031/032 ranking, malformed-response handling, and usage
 *   accounting are implemented; the ranking provider is injected, so nothing
 *   here names a model vendor.
 *   Remaining:
 *   Phase D: review + storage                   (REQ-CORE-040..052)
 *   Phase F: drift                              (REQ-CORE-060..063)
 */

// ---------- Requirement schema and validation (REQ-CORE-001/002) ----------

export type {
  Requirement,
  RequirementId,
  RequirementStatus,
  RequirementPriority,
  TraceLinkRecord,
  SchemaViolation,
  SchemaViolationRule,
  SchemaWarning,
  SchemaWarningRule
} from "./schema/types.js";
export {
  REQUIREMENT_STATUSES,
  REQUIREMENT_PRIORITIES,
  DEFAULT_REQUIREMENT_PRIORITY
} from "./schema/types.js";
export {
  parseRequirementDocument,
  type RequirementDocument,
  type ParsedRequirement
} from "./schema/parse.js";
export { validateRequirements, type ValidationReport } from "./schema/validate.js";
export { readRequirementDocuments, type LoadOptions } from "./schema/load.js";

// ---------- Specification templates (REQ-CORE-003) ----------

export type { TemplateKind, TemplateDefinition } from "./templates/types.js";
export { TEMPLATE_KINDS, TEMPLATES } from "./templates/types.js";
export {
  instantiateTemplate,
  instantiateAllTemplates,
  nextRequirementId,
  type InstantiateOptions
} from "./templates/instantiate.js";

// ---------- Configuration (REQ-CORE-004) ----------

export type {
  SpectraceConfig,
  RetrievalConfig,
  ModelConfig,
  ConfidenceBands,
  RetrievalMode,
  ConfigWarning,
  ConfigWarningRule,
  ConfigLoadResult
} from "./config/types.js";
export {
  DEFAULT_CONFIG,
  DEFAULT_CONFIDENCE_BANDS,
  CONFIG_FILE_RELATIVE_PATH,
  CONFIG_VERSION,
  RETRIEVAL_MODES,
  renderDefaultConfig
} from "./config/types.js";
export { parseConfig } from "./config/parse.js";
export { loadConfig } from "./config/load.js";

// ---------- Indexing (REQ-CORE-010/011/012) ----------

export type { CodeSymbol, SymbolKind } from "./indexer/types.js";
export {
  indexRepository,
  DuplicateSymbolIdIndexError,
  type IndexerConfig,
  type IndexResult
} from "./indexer/typescript-indexer.js";
export {
  assignSymbolIds,
  hashSignature,
  symbolIdPath,
  type OverloadSignature
} from "./indexer/symbol-id.js";
export { ExclusionMatcher, type ExclusionConfig } from "./indexer/exclusions.js";
export {
  serializeSymbolIndex,
  parseSymbolIndex,
  isIndexCurrent,
  IndexArtifactFormatError,
  SYMBOL_INDEX_ARTIFACT,
  SYMBOL_INDEX_VERSION,
  type SymbolIndexProvenance,
  type SymbolIndexHeader,
  type ParsedSymbolIndex
} from "./indexer/index-artifact.js";

// ---------- Lexical retrieval (REQ-CORE-020, Configuration A) ----------

export {
  retrieveCandidates,
  type RetrievalQuery,
  type RankedCandidate,
  type CandidateSet,
  type RetrieveOptions
} from "./retrieval/retrieve.js";
export {
  DEFAULT_BM25F_CONFIG,
  BM25F_V4_CONFIG,
  BM25F_V3_CONFIG,
  DEFAULT_STOPWORDS,
  type BM25FConfig,
  type BM25FField,
  type PluralFolderRevision
} from "./retrieval/bm25.js";
export { tokenize } from "./retrieval/tokenizer.js";

// ---------- Semantic retrieval (REQ-CORE-021, Configuration B) ----------

export {
  retrieveSemanticCandidates,
  symbolEmbeddingText,
  semanticConfigurationId,
  DEFAULT_EMBEDDING_BATCH_SIZE,
  SEMANTIC_CONFIGURATION_VERSION,
  type EmbeddingProvider,
  type SemanticRetrieveOptions,
  type SemanticRetrieveResult
} from "./retrieval/semantic.js";
export {
  EmbeddingCache,
  EmbeddingCacheFormatError,
  embeddingKey,
  serializeEmbeddingCache,
  EMBEDDING_CACHE_ARTIFACT,
  EMBEDDING_CACHE_VERSION,
  type EmbeddingCacheFile
} from "./retrieval/embedding-cache.js";

// ---------- Hybrid retrieval (REQ-CORE-022, Configuration C) ----------

export {
  mergeCandidateSets,
  hybridConfigurationId,
  mergePoolSize,
  MERGE_STRATEGY_IDS,
  DEFAULT_MERGE_STRATEGY,
  DEFAULT_RRF_K,
  DEFAULT_ALPHA,
  type MergeStrategyId,
  type MergeConfig,
  type MergeOptions
} from "./retrieval/hybrid.js";

// ---------- Bounded candidate sets (REQ-CORE-023) ----------

export {
  buildTransmissionUnits,
  auditTransmissionLog,
  serializeTransmissionLog,
  transmitsCorpusWide,
  requiresCorpusTransmissionConsent,
  type CorpusTransmissionConsent,
  UnresolvedCandidateError,
  DEFAULT_EXCERPT_BUDGET,
  TRANSMISSION_LOG_ARTIFACT,
  TRANSMISSION_LOG_VERSION,
  type ExcerptBudget,
  type CandidateExcerpt,
  type TransmissionUnit,
  type TransmissionLog,
  type RetrievalTransmission,
  type EmbeddingTransmission,
  type BuildTransmissionOptions,
  type TransmissionAudit,
  type TransmissionViolation,
  type TransmissionViolationRule,
  type AuditOptions
} from "./transmission/bounded-payload.js";

// ---------- Ranking (REQ-CORE-030/031/032) ----------

export {
  rankCandidates,
  parseRankingResponse,
  type ParseContext,
  type UnitOutcome
} from "./ranking/rank.js";
export {
  buildRankingPrompt,
  rankingPromptDigest,
  RANKING_PROMPT_VERSION,
  RANKING_SYSTEM_PROMPT,
  RECORDED_PROMPT_DIGEST
} from "./ranking/prompt.js";
export { estimateCostUsd, summarizeUsage } from "./ranking/usage.js";
export {
  serializeProposalsArtifact,
  PROPOSALS_ARTIFACT,
  type ProposalsArtifactParams
} from "./ranking/proposals-artifact.js";

// ---------- The shared analysis pipeline (REQ-CLI-004, REQ-APP-012) ----------

export {
  estimateTokens,
  buildRequirementQueryText,
  retrieveForMode,
  projectRankingCost,
  rankWithBands,
  OUTPUT_TOKENS_PER_CANDIDATE,
  type RetrieveForModeOptions,
  type RetrieveForModeResult,
  type CostProjection,
  type BandedProposal,
  type RankWithBandsOptions,
  type RankWithBandsResult
} from "./pipeline/analysis.js";
export {
  TRACE_CLASSIFICATIONS,
  type TraceClassification,
  type Proposal,
  type RankingFailure,
  type RankingFailureRule,
  type RawResponseRecord,
  type UsageRecord,
  type UsageTotals,
  type UsageReport,
  type ModelPricing,
  type RankingRequest,
  type RankingResponse,
  type RankingProvider,
  type RankOptions,
  type RankRunResult
} from "./ranking/types.js";

// ---------- Review and confidence bands (REQ-CORE-040/041/042) ----------

export {
  bandFor,
  bucketProposals,
  countByBand,
  proposalKey,
  type ConfidenceBand,
  type BucketedProposal,
  type RecordedBands,
  type BandCounts
} from "./review/bands.js";
export {
  recordDecision,
  appendDecision,
  emptyDecisionLog,
  deriveLinkState,
  recordedBands,
  reviewStatistics,
  serializeDecisionLog,
  InvalidDecisionError,
  DECISION_LOG_ARTIFACT,
  DECISION_LOG_VERSION,
  type DecisionKind,
  type DecisionInput,
  type Decision,
  type DecisionLog,
  type AcceptedLink,
  type BandOverrides,
  type ReviewStatistics
} from "./review/decisions.js";

// ---------- Link storage and queries (REQ-CORE-050/051/052) ----------

export {
  buildLinkIndex,
  reconcileLinkIndex,
  toTraceLinkRecords,
  symbolsForRequirement,
  requirementsForSymbol,
  unlinkedRequirements,
  coverageSummary,
  serializeLinkIndex,
  LINK_INDEX_ARTIFACT,
  LINK_INDEX_VERSION,
  LINK_INDEX_RELATIVE_PATH,
  type StoredLink,
  type LinkIndex,
  type RequirementLinks,
  type IndexDisagreement,
  type IndexDisagreementRule,
  type IndexReconciliation,
  type RequirementLinkState,
  type RequirementCoverage,
  type CoverageSummary
} from "./links/link-index.js";
export {
  resolveLinks,
  resolveProposals,
  type LinkResolution,
  type ResolutionReport,
  type ResolveLinksOptions,
  type ProposalReference,
  type ProposalStaleness,
  type ProposalStaleReason,
  type ProposalStalenessReport,
  type ResolveProposalsOptions
} from "./links/staleness.js";

// ---------- Shared report envelopes (REQ-CLI-007, NFR-APP-007) ----------

export {
  buildCoverageReport,
  COVERAGE_REPORT_ARTIFACT,
  COVERAGE_REPORT_VERSION,
  type CoverageReport,
  type CoverageReportTotals,
  type BuildCoverageReportOptions
} from "./reporting/coverage-report.js";
export {
  buildInitReport,
  buildValidationReport,
  INIT_REPORT_ARTIFACT,
  INIT_REPORT_VERSION,
  VALIDATION_REPORT_ARTIFACT,
  VALIDATION_REPORT_VERSION,
  type InitReportEnvelope,
  type ReportedWarning,
  type ValidationReportEnvelope
} from "./reporting/report-envelopes.js";

// ---------- Evaluation (REQ-CORE-070/071) ----------

export type {
  LabelPass,
  LinkRelationship,
  LinkConfidence,
  GroundTruthLink,
  GroundTruthFile
} from "./evaluation/ground-truth.js";
export { ALLOWED_LABEL_PASSES } from "./evaluation/ground-truth.js";
export {
  evaluateRetrieval,
  DEFAULT_METRIC_KS,
  type EvaluationRequirement,
  type ScoredResult,
  type RetrievalMetricsBreakdown,
  type RetrievalMetricsReport
} from "./evaluation/retrieval-metrics.js";
export {
  evaluateProposals,
  serializeProposalMetricsReport,
  PROPOSAL_METRICS_ARTIFACT,
  type EvaluatedProposal,
  type ProposalMetricsBreakdown,
  type ProposalMetricsReport,
  type ProposalRunProvenance
} from "./evaluation/proposal-metrics.js";
export {
  compareMetricsReports,
  serializeMetricsComparison,
  ComparisonError,
  METRICS_COMPARISON_ARTIFACT,
  METRICS_COMPARISON_VERSION,
  type ConfigurationRun,
  type ComparisonCell,
  type ComparisonRow,
  type MetricsComparison,
  type ComparisonOmission,
  type ComparisonOmissionRule
} from "./evaluation/comparison.js";
export {
  serializeRetrievalResults,
  parseRetrievalResults,
  serializeMetricsReport,
  ArtifactFormatError,
  RETRIEVAL_RESULTS_ARTIFACT,
  RETRIEVAL_METRICS_ARTIFACT,
  ARTIFACT_VERSION,
  type RunProvenance,
  type MetricsArtifact
} from "./evaluation/results-artifact.js";

// ---------- Shared types ----------

import type { ConfidenceBands, RetrievalMode } from "./config/types.js";

/** Engine version recorded in run-artifact provenance (REQ-CORE-071); keep in lockstep with package.json. */
export const CORE_VERSION = "0.1.0";

/** Opaque, stable symbol identifier; POSIX paths only (REQ-CORE-010 AC1/AC2). */
export type SymbolId = string;

/** Provenance attached to every generated result (REQ-CORE-063). */
export interface Provenance {
  commit: string;
  coreVersion: string;
  retrievalConfig: RetrievalMode;
  modelSnapshot?: string;
  promptVersion?: string;
  confidenceBands: ConfidenceBands;
}

/** Convert an OS path to the POSIX form used in all stored artifacts (CLAUDE.md rule 4). */
export function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}
