/**
 * Proposal generation (REQ-CORE-030) and malformed-response handling
 * (REQ-CORE-031).
 *
 * One model call per requirement, over the bounded payload REQ-CORE-023
 * assembled. Nothing here can widen that payload: {@link rankCandidates}
 * receives units, not a repository, not an index, not a symbol table.
 *
 * The governing rule is REQ-CORE-031's last clause — malformed responses never
 * crash a run. Every fault, from a provider timeout to a rationale that came
 * back blank, is caught, attributed, and tallied; the run continues to the next
 * requirement. A run whose model was having a bad afternoon should yield fewer
 * proposals and a full account of why, not a stack trace and nothing.
 */

import { createHash } from "node:crypto";
import type { TransmissionUnit } from "../transmission/bounded-payload.js";
import { RANKING_PROMPT_VERSION, buildRankingPrompt } from "./prompt.js";
import { estimateCostUsd, summarizeUsage } from "./usage.js";
import {
  TRACE_CLASSIFICATIONS,
  type Proposal,
  type RankOptions,
  type RankRunResult,
  type RankingFailure,
  type RankingFailureRule,
  type TraceClassification,
  type UsageRecord
} from "./types.js";

function digest(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}

/**
 * Removes a markdown code fence around an otherwise-complete JSON body.
 *
 * A fence is a formatting habit, not a schema violation: the model answered
 * the question and wrapped it. Counting that as a malformed response would
 * inflate REQ-CORE-031's failure tally with the one defect that is trivially
 * and losslessly recoverable, and the tally is meant to measure how often the
 * contract is actually broken. Anything past the fence is left alone.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```[A-Za-z0-9_-]*\s*\n?/, "");
  const close = withoutOpen.lastIndexOf("```");
  return (close === -1 ? withoutOpen : withoutOpen.slice(0, close)).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ParseContext {
  unit: TransmissionUnit;
  rawResponseRef: string;
  modelId: string;
}

/** One verdict's worth of validation. Returns a proposal, or the rule it broke. */
function readVerdict(
  raw: unknown,
  context: ParseContext,
  rankBySymbolId: ReadonlyMap<string, number>,
  seen: Set<string>
): Proposal | { rule: RankingFailureRule; message: string; symbolId?: string } {
  if (!isRecord(raw)) {
    return { rule: "schema-mismatch", message: "A verdict entry was not an object." };
  }

  const symbolId = raw["symbolId"];
  if (typeof symbolId !== "string" || symbolId.length === 0) {
    return { rule: "schema-mismatch", message: "A verdict entry had no usable symbolId." };
  }

  const rank = rankBySymbolId.get(symbolId);
  if (rank === undefined) {
    return {
      rule: "unknown-symbol",
      symbolId,
      message: `Verdict names ${symbolId}, which was not a candidate for ${context.unit.requirementId}.`
    };
  }
  if (seen.has(symbolId)) {
    return { rule: "duplicate-symbol", symbolId, message: `Two verdicts returned for ${symbolId}.` };
  }

  const classification = raw["classification"];
  if (
    typeof classification !== "string" ||
    !(TRACE_CLASSIFICATIONS as readonly string[]).includes(classification)
  ) {
    return {
      rule: "unknown-classification",
      symbolId,
      message: `Classification ${JSON.stringify(classification)} for ${symbolId} is not one of ${TRACE_CLASSIFICATIONS.join(", ")}.`
    };
  }

  const confidence = raw["confidence"];
  // `Number.isFinite` rather than `typeof === "number"`: NaN and Infinity are
  // numbers, and neither is a probability.
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return {
      rule: "confidence-out-of-range",
      symbolId,
      message: `Confidence ${JSON.stringify(confidence)} for ${symbolId} is not a number in [0,1].`
    };
  }

  const rationale = raw["rationale"];
  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    return {
      rule: "empty-rationale",
      symbolId,
      message: `Verdict for ${symbolId} carried no rationale; REQ-CORE-030 requires all three fields.`
    };
  }

  return {
    requirementId: context.unit.requirementId,
    symbolId,
    rank,
    classification: classification as TraceClassification,
    confidence,
    rationale: rationale.trim()
  };
}

export interface UnitOutcome {
  proposals: Proposal[];
  failures: RankingFailure[];
}

/**
 * Parses one response against the candidate set it was asked about.
 *
 * Faults are per-entry wherever the response gives enough structure to
 * attribute them: one unusable verdict among ten costs that candidate, not
 * the other nine. Only a response that cannot be read at all — not JSON, or
 * not the documented shape — costs the whole requirement.
 */
export function parseRankingResponse(text: string, context: ParseContext): UnitOutcome {
  const failures: RankingFailure[] = [];
  const fail = (
    rule: RankingFailureRule,
    scope: "response" | "entry",
    message: string,
    symbolId?: string
  ): void => {
    failures.push({
      rule,
      scope,
      requirementId: context.unit.requirementId,
      ...(symbolId === undefined ? {} : { symbolId }),
      message,
      rawResponseRef: context.rawResponseRef,
      promptVersion: RANKING_PROMPT_VERSION,
      modelId: context.modelId
    });
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (error) {
    fail(
      "invalid-json",
      "response",
      `Response for ${context.unit.requirementId} was not JSON: ${(error as Error).message}`
    );
    return { proposals: [], failures };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed["verdicts"])) {
    fail(
      "schema-mismatch",
      "response",
      `Response for ${context.unit.requirementId} had no \`verdicts\` array.`
    );
    return { proposals: [], failures };
  }

  const rankBySymbolId = new Map(context.unit.candidates.map((c) => [c.symbolId, c.rank]));
  const seen = new Set<string>();
  const proposals: Proposal[] = [];

  for (const entry of parsed["verdicts"]) {
    const result = readVerdict(entry, context, rankBySymbolId, seen);
    if ("rule" in result) {
      fail(result.rule, "entry", result.message, result.symbolId);
      // A named-but-rejected symbol is still spoken for; a second verdict on
      // it is a duplicate rather than a fresh chance to be well-formed.
      if (result.symbolId !== undefined) seen.add(result.symbolId);
      continue;
    }
    seen.add(result.symbolId);
    proposals.push(result);
  }

  for (const candidate of context.unit.candidates) {
    if (seen.has(candidate.symbolId)) continue;
    fail(
      "missing-verdict",
      "entry",
      `No verdict returned for ${candidate.symbolId}.`,
      candidate.symbolId
    );
  }

  return { proposals, failures };
}

/**
 * Ranks every requirement's bounded candidate set (REQ-CORE-030).
 *
 * Calls run one at a time and in the order given: ranking is not the stage
 * where throughput matters, and a deterministic order keeps a run's artifacts
 * diffable against the previous run (NFR-CORE-002).
 *
 * A unit with no candidates makes no call. Retrieval found nothing to ask
 * about, so there is nothing to spend a token on — and a model handed an empty
 * list has been invited to invent one.
 */
export async function rankCandidates(options: RankOptions): Promise<RankRunResult> {
  const { provider, units } = options;
  const proposals: Proposal[] = [];
  const failures: RankingFailure[] = [];
  const rawResponses: RankRunResult["rawResponses"] = [];
  const usage: UsageRecord[] = [...(options.priorUsage ?? [])];

  let completed = 0;
  let cancelled = false;
  for (const unit of units) {
    // Checked before the call, so a cancelled run stops without spending on a
    // request whose answer nobody is waiting for.
    if (options.signal?.aborted === true) {
      cancelled = true;
      break;
    }
    if (unit.candidates.length === 0) {
      options.onProgress?.(++completed, units.length);
      continue;
    }

    const request = buildRankingPrompt(unit);
    let text: string;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await provider.complete(request);
      text = response.text;
      inputTokens = response.inputTokens;
      outputTokens = response.outputTokens;
    } catch (error) {
      // The failed call's own message is the only payload there is to
      // reference, and it is the one a reader debugging the run wants.
      const body = `provider error: ${(error as Error).message}`;
      const ref = digest(body);
      rawResponses.push({ ref, requirementId: unit.requirementId, body });
      failures.push({
        rule: "provider-error",
        scope: "response",
        requirementId: unit.requirementId,
        message: `Ranking call for ${unit.requirementId} failed: ${(error as Error).message}`,
        rawResponseRef: ref,
        promptVersion: RANKING_PROMPT_VERSION,
        modelId: provider.modelId
      });
      options.onProgress?.(++completed, units.length);
      continue;
    }

    // A call that returned is a call that was billed, whatever the body said —
    // recording usage only for responses that parsed would understate the cost
    // of exactly the runs a reader most wants the cost of.
    usage.push({
      kind: "ranking",
      modelId: provider.modelId,
      requirementId: unit.requirementId,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens, options.pricing)
    });

    const ref = digest(text);
    rawResponses.push({ ref, requirementId: unit.requirementId, body: text });

    const outcome = parseRankingResponse(text, {
      unit,
      rawResponseRef: ref,
      modelId: provider.modelId
    });
    proposals.push(...outcome.proposals);
    failures.push(...outcome.failures);

    options.onProgress?.(++completed, units.length);
  }

  proposals.sort(
    (a, b) => a.requirementId.localeCompare(b.requirementId) || a.rank - b.rank
  );

  return {
    proposals,
    failures,
    rawResponses,
    usage: summarizeUsage(usage),
    promptVersion: RANKING_PROMPT_VERSION,
    modelId: provider.modelId,
    cancelled
  };
}
