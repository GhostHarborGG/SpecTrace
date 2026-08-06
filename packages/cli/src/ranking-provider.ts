/**
 * OpenAI ranking adapter (REQ-CORE-030).
 *
 * Sibling to `embedding-provider.ts`, and here for the same reason: the engine
 * declares a `RankingProvider` interface and reads no environment variable,
 * constructs no client, and names no vendor (CLAUDE.md rule 2). Everything
 * vendor-shaped — endpoint, key, request body, retry policy, token accounting
 * — is in this file. Studio satisfies the same interface over IPC without
 * touching core, and swapping providers is a change to one file in one
 * package.
 *
 * Provider decided 2026-08-05 (BP): OpenAI, the same key that already serves
 * embeddings (`OPENAI_API_KEY`). This supersedes the setup plan's original
 * `ANTHROPIC_API_KEY` line, which was written before the choice was settled.
 *
 * The concrete model is configuration (`model.ranking`), with **no built-in
 * default**. A wrong-but-plausible default model ID fails at the first API
 * call with a vendor error rather than at startup with an actionable one, and
 * hardcoding a name here would go stale on the vendor's schedule rather than
 * on this project's.
 */

import type { RankingProvider, RankingRequest, RankingResponse } from "@spectrace/core";

const CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAIRankingOptions {
  apiKey: string;
  /** Required — see the module note on why there is no default. */
  model: string;
  /** Ceiling on the reply. Ranking replies are small and bounded by k. Default 4096. */
  maxOutputTokens?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Attempts per call on a retryable failure. Default 4. */
  maxAttempts?: number;
  /** Base backoff in milliseconds, doubled per attempt. Default 500. */
  retryBaseMs?: number;
}

export class RankingRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RankingRequestError";
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429 and 5xx are transient; other 4xx means the request is wrong and will not improve. */
const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/**
 * Rough token estimate for a text, used only where a real count is
 * unavailable: the `--dry-run` cost projection, which by definition has made
 * no call and therefore has no `usage` block to read.
 *
 * Four characters per token is the widely used English approximation. It is
 * reported as an estimate everywhere it surfaces and never substituted for a
 * measured count — REQ-CORE-032's ledger records what the provider reported,
 * and this number never enters it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function createOpenAIRankingProvider(options: OpenAIRankingOptions): RankingProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 4;
  const retryBaseMs = options.retryBaseMs ?? 500;
  const maxOutputTokens = options.maxOutputTokens ?? 4096;

  return {
    modelId: options.model,
    async complete(request: RankingRequest): Promise<RankingResponse> {
      let lastError: RankingRequestError | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await doFetch(CHAT_COMPLETIONS_ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
              model: options.model,
              max_completion_tokens: maxOutputTokens,
              // The engine's prompt already demands bare JSON; asking the API
              // to enforce it too removes the most common malformed-response
              // cause rather than merely recording it (REQ-CORE-031). The
              // parser stays strict regardless — a provider that ignores this
              // still gets audited, not trusted.
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: request.system },
                { role: "user", content: request.user }
              ]
            })
          });
        } catch (cause) {
          lastError = new RankingRequestError(
            `Ranking request failed: ${cause instanceof Error ? cause.message : String(cause)}`
          );
          if (attempt === maxAttempts) break;
          await sleep(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastError = new RankingRequestError(
            `Ranking request failed with ${response.status}${body ? `: ${body.slice(0, 400)}` : ""}`,
            response.status
          );
          if (!isRetryableStatus(response.status) || attempt === maxAttempts) break;
          await sleep(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        const payload = (await response.json()) as ChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          // Not thrown as a transport failure: the call succeeded and was
          // billed. Returning an empty body lets core record it as a malformed
          // response with its usage intact (REQ-CORE-031), which is the honest
          // account of what happened.
          return {
            text: "",
            inputTokens: payload.usage?.prompt_tokens ?? 0,
            outputTokens: payload.usage?.completion_tokens ?? 0
          };
        }

        return {
          text: content,
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0
        };
      }

      throw lastError ?? new RankingRequestError("Ranking request failed for an unknown reason.");
    }
  };
}
