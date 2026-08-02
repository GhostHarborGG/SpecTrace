import { tokenize } from "./tokenizer.js";
import type { CodeSymbol, SymbolKind } from "../indexer/types.js";

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
  /**
   * Terms removed from documents and queries after tokenization. Restricted
   * to English function words: prelim spec §9.2 forbids dropping domain
   * terms, and in a small code corpus function words appear only in the few
   * symbols with prose comments, giving them high IDF and letting
   * comment-rich symbols outscore the implementing symbol on "a"/"the"/"or".
   */
  stopwords: readonly string[];
  /**
   * Score multiplier per symbol kind (absent kinds default to 1). Used to
   * down-weight aggregate symbols (file/module) whose text is the union of
   * their members' text, so they systematically outrank the member that
   * actually implements the behavior on identical evidence.
   */
  kindWeights: Partial<Record<SymbolKind, number>>;
  /**
   * Fold plural terms to singular (minimal Harman-style s-stemmer) in both
   * documents and queries. Requirement prose pluralizes what identifiers
   * keep singular ("removes all hooks" vs `removeHook`), so without folding
   * those terms never match. Deliberately not full stemming: suffix rules
   * beyond plurals mangle domain terms (§9.2).
   */
  foldPlurals: boolean;
}

/**
 * Minimal plural folding (Harman "s-stemmer"): -ies → y, -es after a
 * sibilant → drop es, trailing -s otherwise → drop s. Never touches short
 * tokens or -ss/-us/-is endings, so "class", "status", "this" survive.
 */
function foldPlural(term: string): string {
  if (term.length <= 3) return term;
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(term)) return term;
  if (/(ches|shes|xes|zes|ses)$/.test(term)) return term.slice(0, -2);
  if (term.endsWith("s")) return term.slice(0, -1);
  return term;
}

/**
 * English function words only — articles, conjunctions, prepositions,
 * pronouns, auxiliaries, copulas. Deliberately excludes anything that can
 * carry meaning in an event/hook domain (`before`, `after`, `once`, `call`).
 */
export const DEFAULT_STOPWORDS: readonly string[] = [
  "a", "an", "the", "and", "or", "nor", "but", "so", "if", "then", "else",
  "than", "that", "this", "these", "those", "there", "here", "it", "its",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
  "did", "have", "has", "had", "having", "will", "would", "shall", "should",
  "may", "might", "can", "could", "must", "of", "in", "on", "at", "by",
  "for", "with", "without", "from", "to", "into", "onto", "as", "not", "no",
  "such", "via", "when", "while", "where", "which", "who", "whom", "whose",
  "also", "any", "all", "each", "per", "own", "same", "too", "very", "s"
];

/**
 * Configuration A, revision 3. Field weights, k1, and b are unchanged from
 * prelim spec §9.3's starting values. Relative to v1: v2 added
 * function-word stopwords, a 0.5 prior on file/module aggregate symbols
 * (rationale on the config fields above), and the length-normalization fix
 * that averages field length over documents where the field is non-empty —
 * previously ~95% empty documentation fields deflated the average so far
 * that documented symbols got no usable credit from the weight-2 field.
 * v3 adds plural folding. Each revision is a new `configurationId` per
 * §9.3; earlier results remain in their original run directories.
 */
export const DEFAULT_BM25F_CONFIG: BM25FConfig = {
  configurationId: "bm25f-v3",
  k1: 1.2,
  b: 0.75,
  fieldWeights: {
    nameAndQualifiedName: 4,
    signature: 3,
    documentation: 2,
    relativePath: 2,
    normalizedSource: 1
  },
  stopwords: DEFAULT_STOPWORDS,
  // Cast needed: "constructor" in SymbolKind makes TS reject fresh object
  // literals against Partial<Record<SymbolKind, number>> (clash with
  // Object.prototype.constructor).
  kindWeights: {
    file: 0.5,
    module: 0.5
  } as Partial<Record<SymbolKind, number>>,
  foldPlurals: true
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
  kind: SymbolKind;
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
  private readonly stopwords: ReadonlySet<string>;

  constructor(symbols: readonly CodeSymbol[], config: BM25FConfig = DEFAULT_BM25F_CONFIG) {
    this.config = config;
    this.stopwords = new Set(config.stopwords);

    for (const symbol of symbols) {
      const fieldText = extractFieldText(symbol);
      const fieldTermCounts = emptyFieldRecord<Map<string, number>>(() => new Map());
      const fieldLength = emptyFieldRecord<number>(() => 0);
      const termsSeenInDocument = new Set<string>();

      for (const field of FIELD_NAMES) {
        const terms = this.tokenizeFiltered(fieldText[field]);
        fieldLength[field] = terms.length;
        for (const term of terms) {
          fieldTermCounts[field].set(term, (fieldTermCounts[field].get(term) ?? 0) + 1);
          termsSeenInDocument.add(term);
        }
      }

      for (const term of termsSeenInDocument) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }

      this.documents.push({ symbolId: symbol.symbolId, kind: symbol.kind, fieldTermCounts, fieldLength });
    }

    // Average over documents where the field is present: most symbols have
    // no documentation, so averaging over the whole corpus deflates that
    // field's average length to near zero and the length ratio then erases
    // any documented symbol's credit from the field.
    this.averageFieldLength = emptyFieldRecord<number>(() => 0);
    for (const field of FIELD_NAMES) {
      let total = 0;
      let populated = 0;
      for (const doc of this.documents) {
        if (doc.fieldLength[field] > 0) {
          total += doc.fieldLength[field];
          populated += 1;
        }
      }
      this.averageFieldLength[field] = populated > 0 ? total / populated : 0;
    }
  }

  private tokenizeFiltered(text: string): string[] {
    let terms = tokenize(text);
    if (this.stopwords.size > 0) {
      terms = terms.filter((term) => !this.stopwords.has(term));
    }
    if (this.config.foldPlurals) {
      terms = terms.map(foldPlural);
    }
    return terms;
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

    return score * (this.config.kindWeights[doc.kind] ?? 1);
  }

  /** Returns up to `topK` candidates, ranked by score descending, ties broken by ascending `symbolId` for determinism. */
  search(queryText: string, topK: number): RetrievedCandidate[] {
    const queryTermCounts = new Map<string, number>();
    for (const term of this.tokenizeFiltered(queryText)) {
      queryTermCounts.set(term, (queryTermCounts.get(term) ?? 0) + 1);
    }

    const scored = this.documents
      .map((doc) => ({ symbolId: doc.symbolId, score: this.scoreDocument(doc, queryTermCounts) }))
      .filter((candidate) => candidate.score > 0);

    scored.sort((a, b) => b.score - a.score || (a.symbolId < b.symbolId ? -1 : a.symbolId > b.symbolId ? 1 : 0));

    return scored.slice(0, topK);
  }
}
