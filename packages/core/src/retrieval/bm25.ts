import { tokenize } from "./tokenizer.js";
import type { CodeSymbol } from "../indexer/types.js";

/**
 * Field-weighted BM25 lexical retrieval — Configuration A (REQ-CORE-020).
 * Ranks symbols over names, signatures, documentation, and normalized
 * source text with no network access of any kind. Field groups and
 * starting weights per specs/spectrace-prelim-spec.md §9.1/§9.3.
 *
 * "Symbol and qualified name" is one weighted field even though it draws
 * from two CodeSymbol properties.
 */
export type BM25FField = "nameAndQualifiedName" | "signature" | "documentation" | "relativePath" | "normalizedSource";

const FIELD_NAMES: readonly BM25FField[] = [
  "nameAndQualifiedName",
  "signature",
  "documentation",
  "relativePath",
  "normalizedSource"
];

export interface BM25FConfig {
  /** Identifies this configuration in retrieval output and provenance (REQ-CORE-063) and must change whenever weights or constants change. */
  configurationId: string;
  k1: number;
  b: number;
  fieldWeights: Record<BM25FField, number>;
}

/** Starting configuration from prelim spec §9.3. Not a tuned default — record any change as a new `configurationId`. */
export const DEFAULT_BM25F_CONFIG: BM25FConfig = {
  configurationId: "bm25f-v1",
  k1: 1.2,
  b: 0.75,
  fieldWeights: {
    nameAndQualifiedName: 4,
    signature: 3,
    documentation: 2,
    relativePath: 2,
    normalizedSource: 1
  }
};

export interface RetrievedCandidate {
  symbolId: string;
  score: number;
}

function extractFieldText(symbol: CodeSymbol): Record<BM25FField, string> {
  return {
    nameAndQualifiedName: `${symbol.name} ${symbol.qualifiedName}`,
    signature: symbol.signature,
    documentation: symbol.documentation,
    relativePath: symbol.relativePath,
    normalizedSource: symbol.normalizedSource
  };
}

interface IndexedDocument {
  symbolId: string;
  fieldTermCounts: Record<BM25FField, Map<string, number>>;
  fieldLength: Record<BM25FField, number>;
}

function emptyFieldRecord<T>(fill: () => T): Record<BM25FField, T> {
  const record = {} as Record<BM25FField, T>;
  for (const field of FIELD_NAMES) {
    record[field] = fill();
  }
  return record;
}

/**
 * Field-weighted BM25 (BM25F) over the symbol corpus. Deterministic: given
 * the same symbols and config, `search` always returns the same ranking,
 * including tie-break order (NFR-CORE-002 determinism boundary).
 */
export class BM25FIndex {
  readonly config: BM25FConfig;
  private readonly documents: IndexedDocument[] = [];
  private readonly documentFrequency = new Map<string, number>();
  private readonly averageFieldLength: Record<BM25FField, number>;

  constructor(symbols: readonly CodeSymbol[], config: BM25FConfig = DEFAULT_BM25F_CONFIG) {
    this.config = config;

    for (const symbol of symbols) {
      const fieldText = extractFieldText(symbol);
      const fieldTermCounts = emptyFieldRecord<Map<string, number>>(() => new Map());
      const fieldLength = emptyFieldRecord<number>(() => 0);
      const termsSeenInDocument = new Set<string>();

      for (const field of FIELD_NAMES) {
        const terms = tokenize(fieldText[field]);
        fieldLength[field] = terms.length;
        for (const term of terms) {
          fieldTermCounts[field].set(term, (fieldTermCounts[field].get(term) ?? 0) + 1);
          termsSeenInDocument.add(term);
        }
      }

      for (const term of termsSeenInDocument) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }

      this.documents.push({ symbolId: symbol.symbolId, fieldTermCounts, fieldLength });
    }

    this.averageFieldLength = emptyFieldRecord<number>(() => 0);
    for (const field of FIELD_NAMES) {
      const total = this.documents.reduce((sum, doc) => sum + doc.fieldLength[field], 0);
      this.averageFieldLength[field] = this.documents.length > 0 ? total / this.documents.length : 0;
    }
  }

  get documentCount(): number {
    return this.documents.length;
  }

  private idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    if (df === 0) return 0;
    const n = this.documents.length;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  private scoreDocument(doc: IndexedDocument, queryTermCounts: Map<string, number>): number {
    const { k1, b, fieldWeights } = this.config;
    let score = 0;

    for (const [term, queryTermFrequency] of queryTermCounts) {
      const idf = this.idf(term);
      if (idf === 0) continue;

      let pseudoTermFrequency = 0;
      for (const field of FIELD_NAMES) {
        const avgLength = this.averageFieldLength[field];
        if (avgLength === 0) continue;
        const termFrequency = doc.fieldTermCounts[field].get(term) ?? 0;
        if (termFrequency === 0) continue;
        const lengthNorm = 1 - b + b * (doc.fieldLength[field] / avgLength);
        pseudoTermFrequency += (fieldWeights[field] * termFrequency) / lengthNorm;
      }

      if (pseudoTermFrequency === 0) continue;
      score += idf * queryTermFrequency * ((pseudoTermFrequency * (k1 + 1)) / (k1 + pseudoTermFrequency));
    }

    return score;
  }

  /** Returns up to `topK` candidates, ranked by score descending, ties broken by ascending `symbolId` for determinism. */
  search(queryText: string, topK: number): RetrievedCandidate[] {
    const queryTermCounts = new Map<string, number>();
    for (const term of tokenize(queryText)) {
      queryTermCounts.set(term, (queryTermCounts.get(term) ?? 0) + 1);
    }

    const scored = this.documents
      .map((doc) => ({ symbolId: doc.symbolId, score: this.scoreDocument(doc, queryTermCounts) }))
      .filter((candidate) => candidate.score > 0);

    scored.sort((a, b) => b.score - a.score || (a.symbolId < b.symbolId ? -1 : a.symbolId > b.symbolId ? 1 : 0));

    return scored.slice(0, topK);
  }
}
