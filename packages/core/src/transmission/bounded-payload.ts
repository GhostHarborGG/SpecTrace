/**
 * Bounded candidate sets (REQ-CORE-023) — the single gate every byte that
 * leaves this machine for a model must pass through.
 *
 * The architecture's central bet is that cost scales with the number of
 * requirements rather than the size of the repository. That only holds if
 * nothing can quietly widen a payload, so the guarantee is structural rather
 * than a convention:
 *
 * - This module never receives a repository path, exactly as the retrieval
 *   module does not (REQ-CORE-020). Excerpt text can only come from symbols
 *   that were already indexed, so "read one more file while we're here" is
 *   not an expressible operation.
 * - A candidate that is not in its requirement's retrieved set cannot be
 *   built into a payload — {@link buildTransmissionUnits} resolves symbols
 *   through the candidate list, never through the symbol table directly.
 * - Every excerpt field is length-bounded, so payload size is bounded by
 *   (requirements x k x budget) and not by what happens to be in any one file.
 *
 * {@link auditTransmissionLog} is the other half: given a log and the run it
 * claims to describe, it re-derives what should have been transmitted and
 * reports any excess. That is what makes REQ-CORE-023 AC1 checkable after
 * the fact rather than only by inspection, and what lets clients show a user
 * exactly what would be or was sent (NFR-CORE-005).
 *
 * **The bounded payload is not the only thing a run transmits.** Retrieval
 * itself transmits in Configurations B and C: semantic and hybrid retrieval
 * embed every symbol in the repository, which is corpus-wide and therefore
 * outside the bound this module enforces. A log that reported only the
 * bounded payload would satisfy AC1 while leaving a reader with a materially
 * false picture of what left the machine, so {@link TransmissionLog} carries
 * a {@link RetrievalTransmission} record alongside the units and the audit
 * treats its absence in a transmitting mode as a violation. Disclosing that
 * transmission is a separate question from whether REQ-CORE-023's bound is
 * meant to cover it — the log states the fact either way.
 *
 * No model call lives here. Ranking (REQ-CORE-030, Phase D) consumes these
 * units; it does not assemble its own.
 */

import type { RetrievalMode } from "../config/types.js";
import type { CodeSymbol } from "../indexer/types.js";
import type { CandidateSet } from "../retrieval/retrieve.js";

export const TRANSMISSION_LOG_ARTIFACT = "spectrace.transmitted-content";
/** 2 added the mandatory `retrieval` section; a v1 log cannot describe Configuration B or C honestly. */
export const TRANSMISSION_LOG_VERSION = 2;

/** Per-field character budgets. Chosen to bound payload size, not to fit any particular model's context. */
export interface ExcerptBudget {
  /** Requirement text (title + statement + acceptance criteria). Default 4000. */
  requirementText: number;
  /** Symbol signature. Default 500. */
  signature: number;
  /** Doc comment. Default 1000. */
  documentation: number;
  /** Normalized source. Default 2000 — under the indexer's own 4000-character cap. */
  source: number;
}

export const DEFAULT_EXCERPT_BUDGET: ExcerptBudget = {
  requirementText: 4000,
  signature: 500,
  documentation: 1000,
  source: 2000
};

/**
 * One candidate as it would be transmitted. Every field is copied from the
 * index — nothing here is re-read from the repository.
 */
export interface CandidateExcerpt {
  rank: number;
  symbolId: string;
  kind: string;
  qualifiedName: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  documentation: string;
  source: string;
}

/** Everything that would be transmitted for a single requirement, and nothing else. */
export interface TransmissionUnit {
  requirementId: string;
  requirementText: string;
  candidates: CandidateExcerpt[];
}

/**
 * What retrieval sent to an embedding model, which in Configurations B and C
 * is the whole corpus rather than any bounded set.
 *
 * Counts are of *texts*, not requests: batching is a transport detail, and a
 * reader asking "what left this machine" is asking how much content, not how
 * many HTTP calls. `embedded` is the number that went to the provider over
 * the network this run; `cached` is the number resolved from the local vector
 * cache, which by definition did not leave the machine this run — though it
 * did on the run that populated the cache, which is why the model is named
 * even when `embedded` is zero.
 */
export interface EmbeddingTransmission {
  /** The embedding model the texts went to, from the provider or the cache header. */
  modelId: string;
  dimensions: number;
  /** Symbol texts this run required — one per indexed symbol, so: corpus-wide. */
  symbolTexts: number;
  /** Requirement query texts this run required. */
  queryTexts: number;
  /** Texts sent to the provider over the network this run. */
  embedded: number;
  /** Texts served from the local vector cache, so not transmitted this run. */
  cached: number;
}

/**
 * What retrieval transmitted, as distinct from what the bounded payload would
 * transmit to a ranking model.
 *
 * `embedding` is absent in lexical mode, which computes entirely locally and
 * so has nothing to disclose.
 */
export interface RetrievalTransmission {
  mode: RetrievalMode;
  embedding?: EmbeddingTransmission;
}

export interface TransmissionLog {
  artifact: typeof TRANSMISSION_LOG_ARTIFACT;
  version: number;
  /** The k this run was bounded to (REQ-CORE-020, from configuration). */
  topK: number;
  repositoryCommit: string;
  configurationId: string;
  engineVersion: string;
  /** What retrieval itself transmitted before any payload was assembled. */
  retrieval: RetrievalTransmission;
  units: TransmissionUnit[];
}

export interface BuildTransmissionOptions {
  /** Requirement query text by requirement ID — the same text retrieval was run on. */
  requirementTexts: ReadonlyMap<string, string>;
  /** Retrieval output; one entry per requirement to be analyzed. */
  candidateSets: readonly CandidateSet[];
  /** The indexed symbols the candidate IDs refer to. */
  symbols: readonly CodeSymbol[];
  /** Bound retained per requirement; candidate lists longer than this are truncated. */
  topK: number;
  budget?: Partial<ExcerptBudget>;
}

/**
 * Whether a retrieval configuration sends the whole corpus to a model.
 *
 * Semantic and hybrid retrieval embed every indexed symbol (REQ-CORE-021,
 * REQ-CORE-022), which is repository content outside any candidate set.
 * Exported so every client asks the same question the same way: a Studio that
 * decided "hybrid is mostly lexical, close enough" would put a hole in the
 * consent gate REQ-CORE-023 AC3 requires.
 */
export function transmitsCorpusWide(mode: RetrievalMode): boolean {
  return mode === "semantic" || mode === "hybrid";
}

export interface CorpusTransmissionConsent {
  mode: RetrievalMode;
  /**
   * Texts that would go to the provider over the network. Zero when every
   * vector is already cached, which is why a fully cached run is not gated:
   * consent is about content leaving the machine, not about configuration.
   */
  pendingTextCount: number;
  /** Whether the operator has explicitly accepted corpus-wide transmission for this run. */
  acknowledged: boolean;
}

/**
 * Whether a run must be refused pending explicit acceptance (REQ-CORE-023 AC3).
 *
 * The bound in REQ-CORE-023 covers any model, embedding models included
 * (decided 2026-08-04, BP delegated), so Configurations B and C are a
 * documented exception rather than an oversight — and an exception is only
 * meaningful if choosing it is a deliberate act. Selecting `retrieval.mode:
 * semantic` does not on its own tell an operator that every symbol in the
 * repository is about to be sent to a third party; this is what makes that
 * consequence something they have to accept rather than discover.
 *
 * A pure predicate rather than a check buried in a command, so the matrix it
 * defines is testable without a network and identical across clients.
 */
export function requiresCorpusTransmissionConsent(check: CorpusTransmissionConsent): boolean {
  if (!transmitsCorpusWide(check.mode)) return false;
  if (check.pendingTextCount <= 0) return false;
  return !check.acknowledged;
}

/** A candidate ID with no matching indexed symbol — a stale index, not a transmission fault. */
export class UnresolvedCandidateError extends Error {
  constructor(public readonly requirementId: string, public readonly symbolId: string) {
    super(`Candidate ${symbolId} for ${requirementId} is not in the index; re-run \`spectrace index\`.`);
    this.name = "UnresolvedCandidateError";
  }
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * Assembles the bounded payload for each requirement: its own text, plus at
 * most `topK` candidate excerpts drawn from its retrieved set.
 *
 * Requirements with no retrieved candidates still produce a unit, with an
 * empty candidate list — "nothing to send for this requirement" is a fact a
 * transmitted-content log should record, not one it should omit.
 */
export function buildTransmissionUnits(options: BuildTransmissionOptions): TransmissionUnit[] {
  const budget: ExcerptBudget = { ...DEFAULT_EXCERPT_BUDGET, ...options.budget };
  const byId = new Map(options.symbols.map((symbol) => [symbol.symbolId, symbol]));

  return options.candidateSets.map((set) => ({
    requirementId: set.requirementId,
    requirementText: clip(options.requirementTexts.get(set.requirementId) ?? "", budget.requirementText),
    candidates: set.candidates.slice(0, options.topK).map((candidate) => {
      const symbol = byId.get(candidate.symbolId);
      if (symbol === undefined) throw new UnresolvedCandidateError(set.requirementId, candidate.symbolId);
      return {
        rank: candidate.rank,
        symbolId: symbol.symbolId,
        kind: symbol.kind,
        qualifiedName: symbol.qualifiedName,
        relativePath: symbol.relativePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        signature: clip(symbol.signature, budget.signature),
        documentation: clip(symbol.documentation, budget.documentation),
        source: clip(symbol.normalizedSource, budget.source)
      };
    })
  }));
}

export interface TransmissionAudit {
  /** Total candidate excerpts across every unit. */
  excerptCount: number;
  /** The maximum this run was permitted: sum over requirements of min(k, retrieved). */
  permittedExcerptCount: number;
  requirementCount: number;
  /**
   * Texts retrieval sent to an embedding model over the network this run, from
   * the log's own disclosure. Zero in lexical mode and on a fully cached run —
   * and, note, also zero for a semantic run that failed to disclose, which is
   * what `disclosed` is for.
   */
  embeddedTextCount: number;
  violations: TransmissionViolation[];
  /** True when nothing outside the bound was transmitted (REQ-CORE-023 AC1). */
  bounded: boolean;
  /**
   * True when the log accounts for everything the run transmitted, including
   * retrieval-time embedding (NFR-CORE-005). Independent of `bounded`: a log
   * can carry a perfectly bounded payload and still be silent about having
   * embedded the corpus, which is exactly the defect this check exists for.
   */
  disclosed: boolean;
}

export type TransmissionViolationRule =
  | "excess-candidates"
  | "unretrieved-candidate"
  | "unknown-requirement"
  | "duplicate-requirement"
  | "missing-requirement"
  | "oversized-field"
  | "undisclosed-embedding"
  | "unexpected-embedding"
  | "mode-mismatch";

export interface TransmissionViolation {
  rule: TransmissionViolationRule;
  /** Absent on log-level violations, which concern the run rather than one requirement. */
  requirementId?: string;
  message: string;
  symbolId?: string;
}

export interface AuditOptions {
  log: TransmissionLog;
  /** The retrieval output the log claims to describe. */
  candidateSets: readonly CandidateSet[];
  /**
   * The mode the run actually used. Supplied, the audit checks the log's own
   * account against it; omitted, the log is taken at its word about the mode
   * and only checked for internal consistency.
   */
  mode?: RetrievalMode;
  budget?: Partial<ExcerptBudget>;
}

/**
 * Re-derives what a run was permitted to transmit and reports everything the
 * log carries beyond it (REQ-CORE-023 AC1), plus everything the run
 * transmitted that the log fails to account for (NFR-CORE-005).
 *
 * Reports all violations in one pass rather than throwing on the first, so a
 * client can show a reviewer the whole picture — the same convention the
 * schema validator follows (REQ-CORE-002).
 */
export function auditTransmissionLog(options: AuditOptions): TransmissionAudit {
  const budget: ExcerptBudget = { ...DEFAULT_EXCERPT_BUDGET, ...options.budget };
  const { log } = options;
  const violations: TransmissionViolation[] = [];

  const retrievedByRequirement = new Map(
    options.candidateSets.map((set) => [set.requirementId, new Set(set.candidates.map((c) => c.symbolId))])
  );

  let permittedExcerptCount = 0;
  for (const set of options.candidateSets) {
    permittedExcerptCount += Math.min(log.topK, set.candidates.length);
  }

  const seen = new Set<string>();
  let excerptCount = 0;

  for (const unit of log.units) {
    if (seen.has(unit.requirementId)) {
      violations.push({
        rule: "duplicate-requirement",
        requirementId: unit.requirementId,
        message: `Requirement ${unit.requirementId} appears more than once in the log.`
      });
    }
    seen.add(unit.requirementId);

    const retrieved = retrievedByRequirement.get(unit.requirementId);
    if (retrieved === undefined) {
      violations.push({
        rule: "unknown-requirement",
        requirementId: unit.requirementId,
        message: `Requirement ${unit.requirementId} was transmitted but was not part of this run.`
      });
    }

    excerptCount += unit.candidates.length;

    if (unit.candidates.length > log.topK) {
      violations.push({
        rule: "excess-candidates",
        requirementId: unit.requirementId,
        message: `Requirement ${unit.requirementId} transmitted ${unit.candidates.length} excerpts; k is ${log.topK}.`
      });
    }

    if (unit.requirementText.length > budget.requirementText + 1) {
      violations.push({
        rule: "oversized-field",
        requirementId: unit.requirementId,
        message: `Requirement text for ${unit.requirementId} exceeds its ${budget.requirementText}-character budget.`
      });
    }

    for (const excerpt of unit.candidates) {
      if (retrieved !== undefined && !retrieved.has(excerpt.symbolId)) {
        violations.push({
          rule: "unretrieved-candidate",
          requirementId: unit.requirementId,
          symbolId: excerpt.symbolId,
          message: `${excerpt.symbolId} was transmitted for ${unit.requirementId} but was never retrieved for it.`
        });
      }
      // `+ 1` allows for the ellipsis `clip` appends when it truncates.
      for (const [field, limit] of [
        ["signature", budget.signature],
        ["documentation", budget.documentation],
        ["source", budget.source]
      ] as const) {
        if (excerpt[field].length > limit + 1) {
          violations.push({
            rule: "oversized-field",
            requirementId: unit.requirementId,
            symbolId: excerpt.symbolId,
            message: `${excerpt.symbolId}.${field} exceeds its ${limit}-character budget.`
          });
        }
      }
    }
  }

  for (const set of options.candidateSets) {
    if (!seen.has(set.requirementId)) {
      violations.push({
        rule: "missing-requirement",
        requirementId: set.requirementId,
        message: `Requirement ${set.requirementId} was part of this run but has no entry in the log.`
      });
    }
  }

  // Retrieval-time transmission. Semantic and hybrid retrieval embed every
  // symbol in the corpus; a log that omits that is silent about the largest
  // thing the run sent, which is the failure NFR-CORE-005 forbids.
  const { retrieval } = log;
  const transmittingMode = transmitsCorpusWide(retrieval.mode);

  if (options.mode !== undefined && options.mode !== retrieval.mode) {
    violations.push({
      rule: "mode-mismatch",
      message: `The log describes a ${retrieval.mode} run, but the run was ${options.mode}.`
    });
  }
  if (transmittingMode && retrieval.embedding === undefined) {
    violations.push({
      rule: "undisclosed-embedding",
      message:
        `A ${retrieval.mode} run embeds every indexed symbol, but the log records no embedding ` +
        `transmission. Clients cannot reveal what was sent (NFR-CORE-005).`
    });
  }
  if (!transmittingMode && retrieval.embedding !== undefined) {
    violations.push({
      rule: "unexpected-embedding",
      message: `The log records embedding transmission for a ${retrieval.mode} run, which computes locally.`
    });
  }

  const disclosureRules: TransmissionViolationRule[] = [
    "undisclosed-embedding",
    "unexpected-embedding",
    "mode-mismatch"
  ];

  return {
    excerptCount,
    permittedExcerptCount,
    requirementCount: log.units.length,
    embeddedTextCount: retrieval.embedding?.embedded ?? 0,
    violations,
    // A log that omits a requirement is incomplete, but it did not transmit
    // anything it should not have — boundedness is about excess only. Nor do
    // the disclosure rules bear on it: they concern retrieval, which is not
    // what the (requirements × ≤k) bound governs.
    bounded: !violations.some((v) => v.rule !== "missing-requirement" && !disclosureRules.includes(v.rule)),
    disclosed: !violations.some((v) => disclosureRules.includes(v.rule))
  };
}

export function serializeTransmissionLog(log: TransmissionLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}
