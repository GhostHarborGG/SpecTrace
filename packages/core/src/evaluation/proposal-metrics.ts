/**
 * Proposal evaluation metrics (REQ-CLI-009 AC4; Phase D gate).
 *
 * Scores the ranking stage the way retrieval-metrics.ts scores retrieval:
 * proposals, requirements, and ground truth in; a structuredClone-safe
 * report out. The predicted set is the artifact's `implements`-classified
 * proposals; the relevant set is the ground truth's `implements` links —
 * the same relevance rule as REQ-CORE-070 AC2, applied one stage later.
 *
 * ## Aggregate-only by construction
 *
 * The report carries totals, never rows: no requirement ID and no
 * (requirement, symbol) pair appears anywhere in it. This is the
 * experimental-blinding wall (CLAUDE.md rule 1) enforced by the output
 * shape rather than by reader discipline — output that never existed
 * cannot be read back. Requirements lacking ground truth are *counted*
 * where retrieval-metrics.ts lists their IDs, deliberately: which
 * requirements have no true link is itself label content.
 */

import { bandFor, proposalKey } from "../review/bands.js";
import type { ConfidenceBands } from "../config/types.js";
import type { ConfidenceBand } from "../review/bands.js";
import type { TraceClassification } from "../ranking/types.js";
import type { GroundTruthFile, LabelPass } from "./ground-truth.js";
import type { EvaluationRequirement } from "./retrieval-metrics.js";

/** The slice of a proposal metrics actually consume (structural subset of Proposal). */
export interface EvaluatedProposal {
  requirementId: string;
  symbolId: string;
  classification: TraceClassification;
  confidence: number;
}

export interface ProposalMetricsBreakdown {
  label: string;
  /** Bands whose proposals count as predicted links in this row. */
  bands: ConfidenceBand[];
  /** Requirements in scope for this row. */
  requirementCount: number;
  /** Scoped requirements with no relevant link — counted, never named (the blinding wall). */
  requirementsWithoutGroundTruthCount: number;
  /** Distinct (requirement, symbol) pairs predicted as links. */
  predicted: number;
  /** Distinct pairs the ground truth marks relevant in scope. */
  relevant: number;
  truePositives: number;
  /** TP / predicted; 0 when nothing was predicted — read it beside `predicted`. */
  precision: number;
  /** TP / relevant; 0 when nothing is relevant — read it beside `relevant`. */
  recall: number;
  /** Harmonic mean of the two; 0 whenever both are 0. */
  f1: number;
}

export interface ProposalMetricsReport {
  breakdowns: ProposalMetricsBreakdown[];
  /** Proposals for requirements outside the evaluated set — counted so a subset run cannot read as full coverage. */
  proposalsOutsideScope: number;
}

/** Provenance echoed from the proposals artifact being scored — what run these numbers describe. */
export interface ProposalRunProvenance {
  repositoryCommit: string | null;
  configurationId: string | null;
  engineVersion: string | null;
  promptVersion: string | null;
  modelId: string | null;
}

export const PROPOSAL_METRICS_ARTIFACT = "spectrace.proposal-metrics";

/**
 * The metrics artifact, mirroring `serializeMetricsReport` for retrieval
 * (REQ-CORE-071's convention): the report plus the provenance and band
 * thresholds of the run it scores, so a number in a report is always
 * traceable to the run that produced it.
 */
export function serializeProposalMetricsReport(
  report: ProposalMetricsReport,
  provenance: ProposalRunProvenance | null,
  bands: ConfidenceBands
): string {
  return `${JSON.stringify(
    { artifact: PROPOSAL_METRICS_ARTIFACT, version: 1, provenance, bands, report },
    null,
    2
  )}\n`;
}

/** Difficulty rows in stratum order (prelim spec §6.2), then any other labels alphabetically. */
const CANONICAL_DIFFICULTY_ORDER: readonly string[] = ["high-overlap", "partial-overlap", "domain-vocabulary"];

function relevantPairs(
  groundTruth: GroundTruthFile,
  scope: ReadonlySet<string>,
  labelPasses: readonly LabelPass[]
): Set<string> {
  const pairs = new Set<string>();
  for (const link of groundTruth.links) {
    if (
      link.relationship === "implements" &&
      labelPasses.includes(link.labelPass) &&
      scope.has(link.requirementId)
    ) {
      pairs.add(proposalKey(link.requirementId, link.symbolId));
    }
  }
  return pairs;
}

function computeRow(params: {
  label: string;
  scopeIds: readonly string[];
  proposals: readonly EvaluatedProposal[];
  groundTruth: GroundTruthFile;
  bands: ConfidenceBands;
  rowBands: readonly ConfidenceBand[];
  labelPasses: readonly LabelPass[];
}): ProposalMetricsBreakdown {
  const scope = new Set(params.scopeIds);

  const predicted = new Set<string>();
  for (const proposal of params.proposals) {
    if (proposal.classification !== "implements") continue;
    if (!scope.has(proposal.requirementId)) continue;
    if (!params.rowBands.includes(bandFor(proposal.confidence, proposal.classification, params.bands))) continue;
    predicted.add(proposalKey(proposal.requirementId, proposal.symbolId));
  }

  const relevant = relevantPairs(params.groundTruth, scope, params.labelPasses);

  let truePositives = 0;
  for (const pair of predicted) if (relevant.has(pair)) truePositives += 1;

  const requirementsWithRelevant = new Set<string>();
  for (const link of params.groundTruth.links) {
    if (link.relationship === "implements" && params.labelPasses.includes(link.labelPass) && scope.has(link.requirementId)) {
      requirementsWithRelevant.add(link.requirementId);
    }
  }

  const precision = predicted.size === 0 ? 0 : truePositives / predicted.size;
  const recall = relevant.size === 0 ? 0 : truePositives / relevant.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    label: params.label,
    bands: [...params.rowBands],
    requirementCount: scope.size,
    requirementsWithoutGroundTruthCount: scope.size - requirementsWithRelevant.size,
    predicted: predicted.size,
    relevant: relevant.size,
    truePositives,
    precision,
    recall,
    f1
  };
}

/**
 * Computes precision, recall, and F1 for a ranked proposal set
 * (REQ-CLI-009 AC4), with rows mirroring `evaluateRetrieval`'s breakdowns:
 * "overall" (suggest + review bands, independent labels), one row per
 * difficulty stratum present, "suggest-only" (the band-cutoff comparison
 * REQ-CORE-041's threshold review reads), and
 * "independent-plus-candidate-review".
 *
 * Band membership is computed here from the supplied thresholds — the same
 * `bandFor` every client uses — so callers hand in the *run's* bands from
 * the proposals artifact and the score describes the run that was made.
 */
export function evaluateProposals(params: {
  proposals: readonly EvaluatedProposal[];
  groundTruth: GroundTruthFile;
  requirements: readonly EvaluationRequirement[];
  bands: ConfidenceBands;
}): ProposalMetricsReport {
  const allIds = params.requirements.map((r) => r.id);
  const known = new Set(allIds);
  const proposalsOutsideScope = params.proposals.filter((p) => !known.has(p.requirementId)).length;

  const present = new Set(
    params.requirements.map((r) => r.difficulty).filter((d): d is string => typeof d === "string" && d.length > 0)
  );
  const difficulties = [
    ...CANONICAL_DIFFICULTY_ORDER.filter((d) => present.has(d)),
    ...[...present].filter((d) => !CANONICAL_DIFFICULTY_ORDER.includes(d)).sort()
  ];
  const idsForDifficulty = (difficulty: string): string[] =>
    params.requirements.filter((r) => r.difficulty === difficulty).map((r) => r.id);

  const row = (
    label: string,
    scopeIds: readonly string[],
    rowBands: readonly ConfidenceBand[],
    labelPasses: readonly LabelPass[]
  ): ProposalMetricsBreakdown =>
    computeRow({
      label,
      scopeIds,
      proposals: params.proposals,
      groundTruth: params.groundTruth,
      bands: params.bands,
      rowBands,
      labelPasses
    });

  const breakdowns: ProposalMetricsBreakdown[] = [
    row("overall", allIds, ["suggest", "review"], ["independent"]),
    ...difficulties.map((d) => row(d, idsForDifficulty(d), ["suggest", "review"], ["independent"])),
    row("suggest-only", allIds, ["suggest"], ["independent"]),
    row("independent-plus-candidate-review", allIds, ["suggest", "review"], ["independent", "candidate_review"])
  ];

  return { breakdowns, proposalsOutsideScope };
}
