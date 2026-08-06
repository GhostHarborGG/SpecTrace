/**
 * Ranking contracts (REQ-CORE-030/031/032) — SPEC-CORE-000 §6.
 *
 * The model's job is narrow by design: given a requirement and a bounded
 * candidate set, classify and score, with a rationale a reviewer can read. It
 * never sees the repository, never writes a link, and its failures are
 * recorded rather than raised.
 *
 * As with embeddings (REQ-CORE-021), the provider is injected: the engine
 * constructs no API client and reads no key (CLAUDE.md rule 2), so nothing in
 * this module names a vendor. That is also what makes the whole stage testable
 * without a network — a provider that returns a canned string exercises every
 * parse and failure path directly.
 */

import type { TransmissionUnit } from "../transmission/bounded-payload.js";

/**
 * What the model may say about a (requirement, symbol) pair.
 *
 * `implements` and `supports` are spelled exactly as {@link
 * ../evaluation/ground-truth.js#LinkRelationship} spells them, so a proposal
 * and a label can be compared without a translation table standing between
 * them — a mismatch here would silently depress every precision figure the
 * capstone reports. `unrelated` has no ground-truth counterpart because
 * ground truth records links that exist; it is the verdict that produces no
 * link, and it is retained rather than dropped (REQ-CORE-041: withheld
 * proposals stay inspectable).
 */
export const TRACE_CLASSIFICATIONS = ["implements", "supports", "unrelated"] as const;
export type TraceClassification = (typeof TRACE_CLASSIFICATIONS)[number];

/**
 * One classified candidate: the three fields REQ-CORE-030 requires, plus the
 * identity and provenance needed to act on it.
 *
 * Every field is populated or the record is not a proposal at all — an entry
 * that arrives without a usable classification, confidence, or rationale
 * becomes a {@link RankingFailure} instead (AC1).
 */
export interface Proposal {
  requirementId: string;
  symbolId: string;
  /** Where the candidate placed in retrieval, so a reviewer can see what put it in front of the model. */
  rank: number;
  classification: TraceClassification;
  /** In [0,1]; anything else is a failure, not a clamped proposal. */
  confidence: number;
  rationale: string;
}

/**
 * Why a response, or part of one, could not become a proposal.
 *
 * The taxonomy separates faults of the whole response from faults of one
 * entry within it, because the remedy differs: a response that is not JSON
 * yields nothing for that requirement, whereas one bad entry among ten costs
 * only that candidate. Recording them under one type with a `scope` keeps the
 * tally in REQ-CORE-031 whole — a run's failure count should not depend on
 * which layer noticed.
 */
export type RankingFailureRule =
  /** The provider call itself threw or timed out. */
  | "provider-error"
  /** Response body was not parseable JSON. */
  | "invalid-json"
  /** Parsed, but not the documented shape. */
  | "schema-mismatch"
  /** A verdict for a symbol that was never in this requirement's candidate set. */
  | "unknown-symbol"
  /** Two verdicts for the same symbol. */
  | "duplicate-symbol"
  /** A submitted candidate the response never ruled on. */
  | "missing-verdict"
  /** Classification outside {@link TRACE_CLASSIFICATIONS}. */
  | "unknown-classification"
  /** Confidence absent, non-numeric, or outside [0,1]. */
  | "confidence-out-of-range"
  /** Rationale absent or blank — REQ-CORE-030 AC1 requires all three fields. */
  | "empty-rationale";

export interface RankingFailure {
  rule: RankingFailureRule;
  /** `response` faults cost the whole requirement; `entry` faults cost one candidate. */
  scope: "response" | "entry";
  requirementId: string;
  /** Present when the fault is attributable to a specific candidate. */
  symbolId?: string;
  message: string;
  /**
   * Digest of the raw response this fault came from, keyed into
   * {@link RankRunResult.rawResponses} (REQ-CORE-031: "provenance and raw
   * payload reference"). A reference rather than the payload so a failure
   * record stays small enough to sit in a report; the payload itself is
   * returned once per response, however many faults it produced.
   */
  rawResponseRef: string;
  /** Prompt version in force when the response was produced (REQ-CORE-030). */
  promptVersion: string;
  modelId: string;
}

/** A raw response body, retained so a caller can persist what the model actually said. */
export interface RawResponseRecord {
  /** sha256 of `body`, truncated — the value {@link RankingFailure.rawResponseRef} carries. */
  ref: string;
  requirementId: string;
  body: string;
}

/**
 * What one call to a model cost, in tokens and money (REQ-CORE-032).
 *
 * `kind` distinguishes ranking from embedding because the requirement covers
 * "every model and embedding call" and a run may make both; a single total
 * that silently blended them would hide which stage the money went to.
 */
export interface UsageRecord {
  kind: "ranking" | "embedding";
  modelId: string;
  /** Absent for embedding calls, which are corpus-wide rather than per-requirement. */
  requirementId?: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Estimated, not billed: derived from the token counts and the rates the
   * caller supplied. Zero when no rates were supplied — an honest "not
   * priced" rather than a guess at a vendor's price list, which core has no
   * business hardcoding and which goes stale the week it is written.
   */
  estimatedCostUsd: number;
}

/** Token rates in US dollars per million tokens, supplied by the caller (REQ-CORE-004 `model`). */
export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Per-run and per-requirement totals (REQ-CORE-032). `run` is the sum over
 * `records`, and the AC is exactly that identity — asserted by test rather
 * than assumed, since a totals field that drifts from its records is worse
 * than no totals field.
 */
export interface UsageReport {
  records: UsageRecord[];
  run: UsageTotals;
  /** Keyed by requirement ID, in the order requirements were ranked. */
  byRequirement: Array<{ requirementId: string; totals: UsageTotals }>;
}

/** What the engine hands a provider: a fully assembled, already-bounded prompt. */
export interface RankingRequest {
  system: string;
  user: string;
}

/** What a provider hands back. Token counts come from the provider's own accounting. */
export interface RankingResponse {
  /** The model's reply text, verbatim — parsing is the engine's job, not the adapter's. */
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Calls a ranking model. Implemented by the client (the CLI's adapter,
 * Studio's IPC bridge, a test double), never by the engine.
 */
export interface RankingProvider {
  /** Recorded in provenance and on every usage record. */
  readonly modelId: string;
  complete(request: RankingRequest): Promise<RankingResponse>;
}

export interface RankOptions {
  /** Bounded payloads from REQ-CORE-023 — the only thing that may reach a model. */
  units: readonly TransmissionUnit[];
  provider: RankingProvider;
  /** Omitted, every `estimatedCostUsd` is 0 and the run is reported as unpriced. */
  pricing?: ModelPricing;
  /** Usage from earlier stages (embedding) folded into this run's totals. */
  priorUsage?: readonly UsageRecord[];
  /** Progress callback — the engine writes no console output (CLAUDE.md rule 2). */
  onProgress?: (completed: number, total: number) => void;
}

export interface RankRunResult {
  /** Sorted by requirement, then by candidate rank. Deterministic for fixed input (NFR-CORE-002). */
  proposals: Proposal[];
  failures: RankingFailure[];
  /** One per response received, including those that parsed cleanly. */
  rawResponses: RawResponseRecord[];
  usage: UsageReport;
  promptVersion: string;
  modelId: string;
}
