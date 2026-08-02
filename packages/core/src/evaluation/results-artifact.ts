/**
 * Run artifacts (REQ-CORE-071): versioned, provenance-carrying persistence
 * formats for retrieval results and metrics reports.
 *
 * Pure string ↔ object transforms — the filesystem stays at the caller's
 * boundary. No timestamps anywhere, so identical inputs serialize to
 * identical bytes (REQ-CORE-071 AC1). Paths inside results are already
 * POSIX (CLAUDE.md rule 4); nothing here touches them.
 */

import type { CandidateSet } from "../retrieval/retrieve.js";
import type { RetrievalMetricsReport } from "./retrieval-metrics.js";

export const RETRIEVAL_RESULTS_ARTIFACT = "spectrace.retrieval-results";
export const RETRIEVAL_METRICS_ARTIFACT = "spectrace.retrieval-metrics";
export const ARTIFACT_VERSION = 1;

/** Provenance every persisted run artifact carries (REQ-CORE-071, REQ-CORE-063). */
export interface RunProvenance {
  repositoryCommit: string;
  configurationId: string;
  engineVersion: string;
}

interface ResultsHeader extends RunProvenance {
  artifact: typeof RETRIEVAL_RESULTS_ARTIFACT;
  version: number;
}

export interface MetricsArtifact {
  artifact: typeof RETRIEVAL_METRICS_ARTIFACT;
  version: number;
  /** Null when metrics were computed from a legacy results file with no header. */
  provenance: RunProvenance | null;
  report: RetrievalMetricsReport;
}

export class ArtifactFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactFormatError";
  }
}

/** JSONL: one header line carrying provenance, then one line per candidate set. */
export function serializeRetrievalResults(
  results: readonly CandidateSet[],
  provenance: RunProvenance
): string {
  const header: ResultsHeader = {
    artifact: RETRIEVAL_RESULTS_ARTIFACT,
    version: ARTIFACT_VERSION,
    ...provenance
  };
  return [header, ...results].map((record) => JSON.stringify(record)).join("\n") + "\n";
}

/**
 * Parses a results artifact. Files written before the header existed (the
 * Phase A harness wrote bare candidate-set lines) parse with null
 * provenance rather than failing, so pre-existing experiment runs stay
 * consumable.
 */
export function parseRetrievalResults(text: string): {
  provenance: RunProvenance | null;
  results: CandidateSet[];
} {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = lines.map((line, i) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new ArtifactFormatError(`Line ${i + 1} is not valid JSON: ${reason}`);
    }
  });

  let provenance: RunProvenance | null = null;
  let resultRecords = records;

  const first = records[0];
  if (first !== undefined && first["artifact"] === RETRIEVAL_RESULTS_ARTIFACT) {
    if (first["version"] !== ARTIFACT_VERSION) {
      throw new ArtifactFormatError(
        `Unsupported results artifact version ${JSON.stringify(first["version"])}; this engine reads version ${ARTIFACT_VERSION}.`
      );
    }
    const header = first as unknown as ResultsHeader;
    provenance = {
      repositoryCommit: header.repositoryCommit,
      configurationId: header.configurationId,
      engineVersion: header.engineVersion
    };
    resultRecords = records.slice(1);
  }

  const results = resultRecords.map((record, i) => {
    if (typeof record["requirementId"] !== "string" || !Array.isArray(record["candidates"])) {
      throw new ArtifactFormatError(
        `Record ${i + 1} is not a candidate set (expected \`requirementId\` and \`candidates\`).`
      );
    }
    return record as unknown as CandidateSet;
  });

  return { provenance, results };
}

export function serializeMetricsReport(
  report: RetrievalMetricsReport,
  provenance: RunProvenance | null
): string {
  const artifact: MetricsArtifact = {
    artifact: RETRIEVAL_METRICS_ARTIFACT,
    version: ARTIFACT_VERSION,
    provenance,
    report
  };
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
