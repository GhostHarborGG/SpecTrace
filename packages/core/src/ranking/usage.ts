/**
 * Usage accounting (REQ-CORE-032).
 *
 * The requirement's acceptance criterion is an identity — run totals equal the
 * sum of per-call records — so totals are never accumulated alongside the
 * records they describe. {@link summarizeUsage} derives them from the records
 * in one pass, which makes the two incapable of drifting apart rather than
 * merely unlikely to.
 *
 * Cost is estimated from token counts and caller-supplied rates. Core does not
 * know what any vendor charges and should not: a hardcoded price list is wrong
 * the week a vendor changes it, and wrong silently, in a number a user is
 * being invited to trust.
 */

import type { ModelPricing, UsageRecord, UsageReport, UsageTotals } from "./types.js";

/** Cost is rounded to the microdollar at the record, so totals are exact sums of stored values. */
const COST_PRECISION = 1e6;

/**
 * Estimated dollar cost of one call. Returns 0 when no rates were supplied —
 * see {@link UsageRecord.estimatedCostUsd} for why that is the honest answer
 * rather than a guess.
 */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing?: ModelPricing
): number {
  if (pricing === undefined) return 0;
  const raw =
    (inputTokens * pricing.inputPerMillionTokens + outputTokens * pricing.outputPerMillionTokens) /
    1_000_000;
  return Math.round(raw * COST_PRECISION) / COST_PRECISION;
}

function emptyTotals(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
}

function add(totals: UsageTotals, record: UsageRecord): void {
  totals.calls += 1;
  totals.inputTokens += record.inputTokens;
  totals.outputTokens += record.outputTokens;
  totals.estimatedCostUsd += record.estimatedCostUsd;
}

/**
 * Per-run and per-requirement totals over a set of call records.
 *
 * Records without a `requirementId` — embedding calls, which are corpus-wide
 * rather than per-requirement — count toward the run total and toward no
 * requirement. That asymmetry is the point: a per-requirement cost that
 * quietly absorbed a share of the corpus embedding would misreport the very
 * thing the architecture's central claim is about (cost scaling with
 * requirements, not repository size).
 */
export function summarizeUsage(records: readonly UsageRecord[]): UsageReport {
  const run = emptyTotals();
  const byRequirement = new Map<string, UsageTotals>();

  for (const record of records) {
    add(run, record);
    if (record.requirementId === undefined) continue;
    let totals = byRequirement.get(record.requirementId);
    if (totals === undefined) {
      totals = emptyTotals();
      byRequirement.set(record.requirementId, totals);
    }
    add(totals, record);
  }

  return {
    records: [...records],
    run,
    byRequirement: [...byRequirement].map(([requirementId, totals]) => ({ requirementId, totals }))
  };
}
