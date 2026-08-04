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
 *   model payload passes through; Phase D's ranking consumes it.
 *   Remaining:
 *   Phase C: semantic/hybrid retrieval          (REQ-CORE-021/022)
 *   Phase D: ranking + review + storage         (REQ-CORE-030..052)
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
export { assignSymbolIds, hashSignature, type OverloadSignature } from "./indexer/symbol-id.js";
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
  UnresolvedCandidateError,
  DEFAULT_EXCERPT_BUDGET,
  TRANSMISSION_LOG_ARTIFACT,
  TRANSMISSION_LOG_VERSION,
  type ExcerptBudget,
  type CandidateExcerpt,
  type TransmissionUnit,
  type TransmissionLog,
  type BuildTransmissionOptions,
  type TransmissionAudit,
  type TransmissionViolation,
  type TransmissionViolationRule,
  type AuditOptions
} from "./transmission/bounded-payload.js";

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
