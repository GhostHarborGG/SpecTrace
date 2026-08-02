/**
 * @spectrace/core — public API surface.
 *
 * Contract source: specs/spectrace-cli-spec.md (REQ-CORE-xxx).
 * Design rules (CLAUDE.md): no console output, no env reads, no
 * process.exit; all returns structuredClone-safe; POSIX paths in
 * all stored artifacts and symbol identifiers.
 *
 * Status: implementations land per phase:
 *   REQ-CORE-010/011 indexing and REQ-CORE-020 lexical retrieval are
 *   implemented (promoted from the Phase A feasibility harness after
 *   review). Remaining:
 *   Phase B: schema/validation/templates/config (REQ-CORE-001..004)
 *   Phase C: semantic/hybrid retrieval + index artifact (REQ-CORE-012, 021..023)
 *   Phase D: ranking + review + storage         (REQ-CORE-030..052)
 *   Phase F: drift                              (REQ-CORE-060..063)
 */

// ---------- Indexing (REQ-CORE-010/011) ----------

export type { CodeSymbol, SymbolKind } from "./indexer/types.js";
export {
  indexRepository,
  DuplicateSymbolIdIndexError,
  type IndexerConfig,
  type IndexResult
} from "./indexer/typescript-indexer.js";
export { assignSymbolIds, hashSignature, type OverloadSignature } from "./indexer/symbol-id.js";
export { ExclusionMatcher, type ExclusionConfig } from "./indexer/exclusions.js";

// ---------- Lexical retrieval (REQ-CORE-020, Configuration A) ----------

export {
  retrieveCandidates,
  type RetrievalQuery,
  type RankedCandidate,
  type CandidateSet,
  type RetrieveOptions
} from "./retrieval/retrieve.js";
export { DEFAULT_BM25F_CONFIG, DEFAULT_STOPWORDS, type BM25FConfig, type BM25FField } from "./retrieval/bm25.js";
export { tokenize } from "./retrieval/tokenizer.js";

// ---------- Shared types ----------

/** Opaque, stable requirement identifier (REQ-CORE-001 AC3). */
export type RequirementId = string;
/** Opaque, stable symbol identifier; POSIX paths only (REQ-CORE-010 AC1/AC2). */
export type SymbolId = string;

export type RequirementStatus = "Proposed" | "Implemented" | "Verified" | "Deprecated";

export interface TraceLinkRecord {
  symbol: SymbolId;
  reviewer: string;
  timestamp: string; // ISO 8601
  commit: string;    // SHA the decision was made at
}

export interface Requirement {
  id: RequirementId;
  title: string;
  rationale: string;
  status: RequirementStatus;
  priority: "P0" | "P1" | "P2";
  acceptanceCriteria: string[]; // >= 1 enforced by validation (REQ-CORE-001)
  traceLinks: TraceLinkRecord[];
  /** Vault-relative POSIX path of the source document. */
  path: string;
}

export interface SchemaViolation {
  path: string;
  requirementId?: RequirementId;
  rule: "missing-field" | "duplicate-id" | "no-acceptance-criteria";
  message: string;
}

/** Provenance attached to every generated result (REQ-CORE-063). */
export interface Provenance {
  commit: string;
  coreVersion: string;
  retrievalConfig: RetrievalMode;
  modelSnapshot?: string;
  promptVersion?: string;
  confidenceBands: ConfidenceBands;
}

export type RetrievalMode = "lexical" | "semantic" | "hybrid"; // Configs A/B/C

export interface ConfidenceBands {
  suggest: number;  // default 0.75 (REQ-CORE-041)
  review: number;   // default 0.50
}

// ---------- Stage interfaces (stubs; implemented per phase) ----------

export interface VaultApi {
  loadRequirements(vaultDir: string): Promise<Requirement[]>;
  validate(requirements: Requirement[]): SchemaViolation[];
}

const notYet = (req: string) => new Error(`Not implemented yet — lands with ${req}`);

/** Phase B — REQ-CORE-001..002. */
export const vault: VaultApi = {
  async loadRequirements() { throw notYet("REQ-CORE-001 (Phase B)"); },
  validate() { throw notYet("REQ-CORE-002 (Phase B)"); },
};

/** Default bands per REQ-CORE-041; tuned values replace these post-evaluation. */
export const DEFAULT_CONFIDENCE_BANDS: ConfidenceBands = { suggest: 0.75, review: 0.5 };

/** Convert an OS path to the POSIX form used in all stored artifacts (CLAUDE.md rule 4). */
export function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}
