/**
 * The coverage report envelope (REQ-CLI-007, REQ-APP-020, NFR-APP-007).
 *
 * This lives in core rather than in either client for one reason: NFR-APP-007
 * requires Studio and the CLI to produce identical output, and the only way to
 * *guarantee* that is for both to call the same function. A parity test over
 * two independent implementations can tell you they have diverged; it cannot
 * stop them diverging. Here there is one implementation, and the parity test
 * confirms the wiring rather than policing two copies of the logic.
 *
 * The envelope is data only — no filesystem, no clock, no environment. The
 * clients read the vault and the symbol index; this assembles what they found
 * into the shape both must emit.
 */

import type { LinkIndex } from "../links/link-index.js";
import { coverageSummary, type RequirementCoverage } from "../links/link-index.js";
import type { LinkResolution } from "../links/staleness.js";

export const COVERAGE_REPORT_ARTIFACT = "spectrace.coverage-report";
export const COVERAGE_REPORT_VERSION = 1;

export interface CoverageReportTotals {
  total: number;
  linked: number;
  stale: number;
  unlinked: number;
  linkTotal: number;
  brokenLinkTotal: number;
}

export interface CoverageReport {
  artifact: typeof COVERAGE_REPORT_ARTIFACT;
  version: number;
  repositoryCommit: string;
  engineVersion: string;
  /**
   * Whether links were resolved against a symbol index. `false` is a
   * meaningful answer, not a default: without an index there is no honest way
   * to say whether a link still resolves, and reporting coverage as though
   * every link were live would be a green dashboard over a repository that has
   * moved on (REQ-CORE-052).
   */
  stalenessChecked: boolean;
  summary: CoverageReportTotals;
  requirements: RequirementCoverage[];
  /** Present only when staleness was checked; absent, not empty, when it was not. */
  brokenLinks?: LinkResolution[];
}

export interface BuildCoverageReportOptions {
  index: LinkIndex;
  requirementIds: readonly string[];
  engineVersion: string;
  repositoryCommit: string;
  /** Omitted, `stalenessChecked` is false and no link is reported broken. */
  resolution?: { broken: readonly LinkResolution[]; brokenSymbolIds: ReadonlySet<string> };
}

/**
 * Assembles the coverage report both clients emit.
 *
 * Totals come from {@link coverageSummary}, which folds them out of the
 * per-requirement rows in one pass, so the summary cannot disagree with the
 * rows beneath it (REQ-CORE-051 AC2).
 */
export function buildCoverageReport(options: BuildCoverageReportOptions): CoverageReport {
  const summary = coverageSummary(
    options.index,
    options.requirementIds,
    options.resolution?.brokenSymbolIds ?? new Set()
  );

  return {
    artifact: COVERAGE_REPORT_ARTIFACT,
    version: COVERAGE_REPORT_VERSION,
    repositoryCommit: options.repositoryCommit,
    engineVersion: options.engineVersion,
    stalenessChecked: options.resolution !== undefined,
    summary: {
      total: summary.total,
      linked: summary.linked,
      stale: summary.stale,
      unlinked: summary.unlinked,
      linkTotal: summary.linkTotal,
      brokenLinkTotal: summary.brokenLinkTotal
    },
    requirements: summary.byRequirement,
    ...(options.resolution ? { brokenLinks: [...options.resolution.broken] } : {})
  };
}
