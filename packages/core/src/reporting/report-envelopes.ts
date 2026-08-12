/**
 * The `spectrace.init-report` and `spectrace.validation-report` envelopes
 * (SPEC-CLI-000 §3 AC1; NFR-APP-007).
 *
 * Carried from the Phase B gate: both envelopes lived in the CLI, with the
 * note that they move to core when Phase D records the parity snapshots —
 * which is this change. Like `buildCoverageReport`, the envelope is built
 * here and *printed* by the client, so a second client (Studio's validation
 * surface) consumes the same shape rather than approximating it, and the
 * recorded contract in `packages/cli/test/snapshots/` freezes it for both.
 */

import type { SchemaViolation } from "../schema/types.js";

export const INIT_REPORT_ARTIFACT = "spectrace.init-report";
export const INIT_REPORT_VERSION = 1;

export interface InitReportEnvelope {
  artifact: typeof INIT_REPORT_ARTIFACT;
  version: typeof INIT_REPORT_VERSION;
  /** POSIX path of the scaffolded root. */
  repositoryRoot: string;
  created: string[];
  skipped: string[];
  overwritten: string[];
}

export function buildInitReport(params: {
  repositoryRoot: string;
  created: readonly string[];
  skipped: readonly string[];
  overwritten: readonly string[];
}): InitReportEnvelope {
  return {
    artifact: INIT_REPORT_ARTIFACT,
    version: INIT_REPORT_VERSION,
    repositoryRoot: params.repositoryRoot,
    created: [...params.created],
    skipped: [...params.skipped],
    overwritten: [...params.overwritten]
  };
}

export const VALIDATION_REPORT_ARTIFACT = "spectrace.validation-report";
export const VALIDATION_REPORT_VERSION = 1;

/** A warning with its origin attached, so config noise and schema noise stay tellable apart. */
export interface ReportedWarning {
  source: "config" | "schema";
  rule: string;
  message: string;
  /** Config key at fault, for `config` warnings that have one. */
  key?: string;
  /** Document at fault, for `schema` warnings. */
  path?: string;
}

export interface ValidationReportEnvelope {
  artifact: typeof VALIDATION_REPORT_ARTIFACT;
  version: typeof VALIDATION_REPORT_VERSION;
  valid: boolean;
  specPaths: string[];
  requirementCount: number;
  documentCount: number;
  violations: SchemaViolation[];
  warnings: ReportedWarning[];
}

export function buildValidationReport(params: {
  valid: boolean;
  specPaths: readonly string[];
  requirementCount: number;
  documentCount: number;
  violations: readonly SchemaViolation[];
  warnings: readonly ReportedWarning[];
}): ValidationReportEnvelope {
  return {
    artifact: VALIDATION_REPORT_ARTIFACT,
    version: VALIDATION_REPORT_VERSION,
    valid: params.valid,
    specPaths: [...params.specPaths],
    requirementCount: params.requirementCount,
    documentCount: params.documentCount,
    violations: [...params.violations],
    warnings: [...params.warnings]
  };
}
