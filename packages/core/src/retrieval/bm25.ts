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
  /**
   * Which `foldPlural` rule set to apply (only consulted when `foldPlurals`).
   * Revision 1 is retained solely so an earlier `configurationId` reproduces
   * its ranking bit-for-bit; revision 2 is the corrected rule set.
   */
  pluralFolderRevision: PluralFolderRevision;
  /**
   * Exempt stopwords that the corpus also uses as identifier morphemes from
   * stopword filtering, in documents and queries alike. The function-word
   * list is calibrated for prose, but identifiers carry those same words as
   * domain terms (`removeAllHooks`, `beforeEach`, `callHookWith` lose
   * `all`/`each`/`with`), and dropping them violates prelim §9.2's rule
   * against discarding domain vocabulary. Derived from the corpus so no
   * per-repository hand list is needed.
   */
  protectIdentifierStopwords: boolean;
  /**
   * Strength of the containment-derived aggregate prior; `null` disables it.
   * v2's kind prior covers file/module aggregates but misses container
   * classes — the largest aggregates in a typical corpus — whose
   * `normalizedSource` is the union of their members' text, letting term
   * repetition buried across members outscore the member that implements the
   * behavior. Deriving the prior from line-span containment covers every
   * aggregate without a per-kind allowlist. Invariant: a post-score
   * multiplier < 1 applied only to containers cannot reorder two leaves and
   * cannot promote a container.
   */
  containmentAlpha: number | null;
}

export type PluralFolderRevision = 1 | 2;

/**
 * Minimal plural folding (Harman "s-stemmer"): -ies → y, -es after a
 * sibilant → drop es, trailing -s otherwise → drop s. Never touches short
 * tokens or -ss/-us/-is endings, so "class", "status", "this" survive.
 *
 * Revision 1 is frozen as-shipped and must not be altered — it is what
 * `bm25f-v3` scores with. Revision 2 corrects two defects in it: the
 * sibilant class matched a bare `ses`, over-stripping 4-char stems so
 * `promises` → `promis` split from `promise`, hence `sses`; and the length
 * floor of 3 blocked short identifier plurals such as `fns` → `fn`, hence 2
 * (the `ss|us|is` guard plus the stopword list still protect `is`/`as`/`us`).
 */
export function foldPlural(term: string, revision: PluralFolderRevision): string {
  if (term.length <= (revision === 1 ? 3 : 2)) return term;
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(term)) return term;
  if (revision === 1 ? /(ches|shes|xes|zes|ses)$/.test(term) : /(ches|shes|xes|zes|sses)$/.test(term)) {
    return term.slice(0, -2);
  }
  if (term.endsWith("s")) return term.slice(0, -1);
  return term;
}

/**
 * Stopwords minus the ones this corpus also uses as identifier morphemes
 * (`config.protectIdentifierStopwords`). Only `name`/`qualifiedName` confer
 * protection: a function word appearing in a source body or a doc comment is
 * prose, which is exactly what the list exists to filter. Identifier tokens
 * get the same tokenize + fold treatment as document text so the comparison
 * happens in one term space; both the raw and the folded form are matched
 * because `tokenizeFiltered` filters before it folds.
 */
function effectiveStopwords(symbols: readonly CodeSymbol[], config: BM25FConfig): ReadonlySet<string> {
  const stopwords = new Set(config.stopwords);
  if (!config.protectIdentifierStopwords || stopwords.size === 0) return stopwords;

  for (const symbol of symbols) {
    for (const term of tokenize(`${symbol.name} ${symbol.qualifiedName}`)) {
      stopwords.delete(term);
      if (config.foldPlurals) stopwords.delete(foldPlural(term, config.pluralFolderRevision));
    }
  }
  return stopwords;
}

/**
 * How many other indexed symbols each symbol lexically contains, aligned
 * with `symbols` by position. Containment is same-file plus a spanning
 * [startLine, endLine] range whose length is strictly greater, so a symbol
 * never contains itself and two symbols sharing a span never contain each
 * other. Bucketed by `relativePath` to keep the comparison O(per-file n²).
 */
function containedCounts(symbols: readonly CodeSymbol[]): number[] {
  const byPath = new Map<string, number[]>();
  symbols.forEach((symbol, position) => {
    const bucket = byPath.get(symbol.relativePath);
    if (bucket) bucket.push(position);
    else byPath.set(symbol.relativePath, [position]);
  });

  const counts = new Array<number>(symbols.length).fill(0);
  for (const bucket of byPath.values()) {
    for (const outer of bucket) {
      const container = symbols[outer]!;
      const containerSpan = container.endLine - container.startLine;
      let count = 0;
      for (const inner of bucket) {
        const candidate = symbols[inner]!;
        if (candidate.endLine - candidate.startLine >= containerSpan) continue;
        if (container.startLine <= candidate.startLine && container.endLine >= candidate.endLine) {
          count += 1;
        }
      }
      counts[outer] = count;
    }
  }
  return counts;
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
 * Configuration A, revision 5. Field weights, k1, and b are unchanged from
 * prelim spec §9.3's starting values. Relative to v1: v2 added
 * function-word stopwords, a 0.5 prior on file/module aggregate symbols
 * (rationale on the config fields above), and the length-normalization fix
 * that averages field length over documents where the field is non-empty —
 * previously ~95% empty documentation fields deflated the average so far
 * that documented symbols got no usable credit from the weight-2 field.
 * v3 adds plural folding. v4 stops v2's stopword list from swallowing
 * function words the corpus uses as identifier morphemes, and takes the
 * corrected plural folder (rationales on `protectIdentifierStopwords` and
 * `foldPlural`). v5 adds the containment-derived aggregate prior, which
 * generalizes v2's file/module kind prior to container symbols of any kind
 * (rationale on `containmentAlpha`); both multipliers apply. Each revision
 * is a new `configurationId` per §9.3; earlier results remain in their
 * original run directories.
 */
export const DEFAULT_BM25F_CONFIG: BM25FConfig = {
  configurationId: "bm25f-v5",
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
  foldPlurals: true,
  pluralFolderRevision: 2,
  protectIdentifierStopwords: true,
  containmentAlpha: 0.15
};

/**
 * Configuration A, revision 4, kept selectable for A/B runs against v5.
 * Frozen: with this config `BM25FIndex` reproduces the v4 ranking
 * bit-for-bit, so it must keep the pre-v5 field values (no containment
 * prior) whatever the defaults become.
 */
export const BM25F_V4_CONFIG: BM25FConfig = Object.freeze({
  configurationId: "bm25f-v4",
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
  kindWeights: {
    file: 0.5,
    module: 0.5
  } as Partial<Record<SymbolKind, number>>,
  foldPlurals: true,
  pluralFolderRevision: 2,
  protectIdentifierStopwords: true,
  containmentAlpha: null
});

/**
 * Configuration A, revision 3, kept selectable for A/B runs against later
 * revisions. Frozen: with this config `BM25FIndex` reproduces the v3 ranking
 * bit-for-bit, so it must keep the pre-v4 field values (folder revision 1,
 * no identifier protection, no containment prior) whatever the defaults
 * become.
 */
export const BM25F_V3_CONFIG: BM25FConfig = Object.freeze({
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
  kindWeights: {
    file: 0.5,
    module: 0.5
  } as Partial<Record<SymbolKind, number>>,
  foldPlurals: true,
  pluralFolderRevision: 1,
  protectIdentifierStopwords: false,
  containmentAlpha: null
});

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
  /** 1 for a leaf; < 1 in proportion to how many symbols this one contains. */
  containmentPrior: number;
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
    // Computed once, before any tokenization: documents and queries must be
    // filtered against the same stopword set.
    this.stopwords = effectiveStopwords(symbols, config);
    const { containmentAlpha } = config;
    const contained = containmentAlpha === null ? null : containedCounts(symbols);

    for (const [position, symbol] of symbols.entries()) {
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

      const containmentPrior =
        contained === null || containmentAlpha === null ? 1 : 1 / (1 + containmentAlpha * contained[position]!);

      this.documents.push({
        symbolId: symbol.symbolId,
        kind: symbol.kind,
        fieldTermCounts,
        fieldLength,
        containmentPrior
      });
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
      terms = terms.map((term) => foldPlural(term, this.config.pluralFolderRevision));
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

    return score * (this.config.kindWeights[doc.kind] ?? 1) * doc.containmentPrior;
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
