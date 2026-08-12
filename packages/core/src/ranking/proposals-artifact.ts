/**
 * The `spectrace.proposals` artifact envelope (REQ-CORE-030…032 provenance;
 * REQ-APP-012 AC1).
 *
 * This module exists for the reason `pipeline/analysis.ts` exists. Until it,
 * the CLI's `analyze` and Studio's run each assembled this envelope by hand —
 * two implementations of a cross-client artifact, which is precisely the
 * drift NFR-APP-007 exists to prevent. With one serializer, byte-for-byte
 * parity at the proposal level is a property of the code; the recorded
 * snapshot in `packages/cli/test/snapshots/` freezes the shape so a change
 * to it is a visible contract change in both suites, never an accident.
 *
 * Core serializes; it does not write. Where the file goes, and whether one
 * is written at all, stays a client decision (the CLI writes on
 * `--proposals`, Studio checkpoints every run).
 */

import type { ConfidenceBands } from "../config/types.js";
import type {
  Proposal,
  RankingFailure,
  RawResponseRecord,
  UsageReport
} from "./types.js";

export const PROPOSALS_ARTIFACT = "spectrace.proposals";

export interface ProposalsArtifactParams {
  repositoryCommit: string;
  configurationId: string;
  engineVersion: string;
  promptVersion: string;
  modelId: string;
  /** The thresholds in force for this run — consumers score against these, not today's config. */
  bands: ConfidenceBands;
  proposals: readonly Proposal[];
  failures: readonly RankingFailure[];
  /** The raw bodies behind every failure's rawResponseRef (REQ-CORE-031). */
  rawResponses: readonly RawResponseRecord[];
  usage: UsageReport;
  /** True when the run was cancelled mid-ranking; omitted entirely for a complete run. */
  partial?: boolean;
}

/** Serializes the proposals artifact. Key order is part of the byte-level contract. */
export function serializeProposalsArtifact(params: ProposalsArtifactParams): string {
  return `${JSON.stringify(
    {
      artifact: PROPOSALS_ARTIFACT,
      version: 1,
      repositoryCommit: params.repositoryCommit,
      configurationId: params.configurationId,
      engineVersion: params.engineVersion,
      promptVersion: params.promptVersion,
      modelId: params.modelId,
      bands: params.bands,
      proposals: params.proposals,
      failures: params.failures,
      rawResponses: params.rawResponses,
      usage: params.usage,
      ...(params.partial === true ? { partial: true } : {})
    },
    null,
    2
  )}\n`;
}
