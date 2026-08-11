/**
 * @spectrace/providers — the vendor adapters both clients share.
 *
 * Core declares `EmbeddingProvider` and `RankingProvider` as interfaces and
 * constructs neither: the engine reads no environment, holds no credential,
 * and names no vendor (CLAUDE.md rule 2). Something still has to speak HTTP to
 * a real API, and this package is that something.
 *
 * It sits beside the CLI rather than inside it. Studio needs the same adapter
 * at runtime (REQ-APP-012), and the two ways to share one from the CLI were
 * both worse: an Electron app importing `@spectrace/cli` would make the "thin
 * command surface over core" a library as well, and a second copy in Studio
 * would leave the retry and backoff policy in two places to drift — the same
 * argument that moved the coverage envelope and the analysis pipeline into
 * core. Package added 2026-08-10 (BP).
 *
 * Nothing here is imported by core, so the engine stays vendor-free.
 */

export {
  createOpenAIEmbeddingProvider,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingRequestError,
  type OpenAIEmbeddingOptions
} from "./openai-embedding.js";

export {
  createOpenAIRankingProvider,
  estimateTokens,
  RankingRequestError,
  type OpenAIRankingOptions
} from "./openai-ranking.js";
