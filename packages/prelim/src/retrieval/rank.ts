/**
 * Experiment-side retrieval wrapper. The engine itself — tokenizer, BM25F,
 * and the ranked-candidate API — lives in @spectrace/core (REQ-CORE-020);
 * this module only adapts the experiment's ParsedRequirement shape onto the
 * core query surface, matching prelim spec §9.4 output.
 */
import {
  retrieveCandidates,
  DEFAULT_BM25F_CONFIG,
  type BM25FConfig,
  type CandidateSet,
  type CodeSymbol
} from "@spectrace/core";
import type { ParsedRequirement } from "../requirements/types.js";

export type RetrievalCandidateRecord = CandidateSet["candidates"][number];

/** Matches prelim spec §9.4 (same shape as core's CandidateSet). */
export type RetrievalResult = CandidateSet;

/** Query text drawn from the requirement's title, statement, and acceptance criteria. */
export function buildRequirementQueryText(requirement: ParsedRequirement): string {
  return [requirement.title, requirement.statement, ...requirement.acceptanceCriteria].join(" ");
}

export function retrieveForAllRequirements(
  symbols: readonly CodeSymbol[],
  requirements: readonly ParsedRequirement[],
  topK: number,
  repositoryCommit: string,
  config: BM25FConfig = DEFAULT_BM25F_CONFIG
): RetrievalResult[] {
  return retrieveCandidates({
    queries: requirements.map((requirement) => ({
      requirementId: requirement.id,
      text: buildRequirementQueryText(requirement)
    })),
    symbols,
    topK,
    repositoryCommit,
    config
  });
}
