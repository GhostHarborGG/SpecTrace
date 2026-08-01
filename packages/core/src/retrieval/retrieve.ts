/**
 * Public lexical-retrieval surface (REQ-CORE-020, Configuration A).
 *
 * Plain data in, plain data out: callers pass requirement-derived query
 * text and the symbol set from the index artifact; results are ranked
 * candidate lists that survive `structuredClone` (CLAUDE.md rule 3). The
 * BM25F index is built once per call over all queries, so retrieval cost
 * is independent of repository size beyond index lookup (REQ-CORE-020
 * AC2) — no per-run source-file rescans are possible from here: this
 * module never receives a repository path.
 */

import type { CodeSymbol } from "../indexer/types.js";
import { BM25FIndex, DEFAULT_BM25F_CONFIG, type BM25FConfig } from "./bm25.js";

/** One retrieval query: a requirement ID plus the text to match against symbols. */
export interface RetrievalQuery {
  requirementId: string;
  /** Typically the requirement's title, statement, and acceptance criteria joined together. */
  text: string;
}

export interface RankedCandidate {
  rank: number;
  symbolId: string;
  score: number;
}

/** Ranked candidates for one requirement, with the provenance fields results must carry (REQ-CORE-063). */
export interface CandidateSet {
  requirementId: string;
  configurationId: string;
  repositoryCommit: string;
  candidates: RankedCandidate[];
}

export interface RetrieveOptions {
  queries: readonly RetrievalQuery[];
  symbols: readonly CodeSymbol[];
  /** Top-k candidates to retain per requirement (k from configuration per REQ-CORE-020). */
  topK: number;
  repositoryCommit: string;
  config?: BM25FConfig;
}

/**
 * Ranks symbols for every query by field-weighted BM25 (REQ-CORE-020).
 * Requires no network access of any kind; deterministic for fixed inputs
 * and configuration (NFR-CORE-002).
 */
export function retrieveCandidates(options: RetrieveOptions): CandidateSet[] {
  const config = options.config ?? DEFAULT_BM25F_CONFIG;
  const index = new BM25FIndex(options.symbols, config);

  return options.queries.map((query) => ({
    requirementId: query.requirementId,
    configurationId: config.configurationId,
    repositoryCommit: options.repositoryCommit,
    candidates: index.search(query.text, options.topK).map((candidate, i) => ({
      rank: i + 1,
      symbolId: candidate.symbolId,
      score: candidate.score
    }))
  }));
}
