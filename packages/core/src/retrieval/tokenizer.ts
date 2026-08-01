/**
 * Identifier-aware tokenizer for lexical retrieval (REQ-CORE-020;
 * normalization rules per specs/spectrace-prelim-spec.md §9.2). Deliberately
 * has no stopword list: §9.2 requires that domain terms are never dropped
 * merely for being uncommon, so the only reductions here are casing,
 * delimiter splitting, and punctuation stripping.
 */

const PATH_SEPARATORS = /[\\/]+/g;
const SNAKE_KEBAB_SEPARATORS = /[_-]+/g;
const LOWER_OR_DIGIT_TO_UPPER = /([a-z0-9])([A-Z])/g;
const ACRONYM_TO_WORD_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE = /\s+/g;

function splitCompoundIdentifiers(text: string): string {
  return text.replace(LOWER_OR_DIGIT_TO_UPPER, "$1 $2").replace(ACRONYM_TO_WORD_BOUNDARY, "$1 $2");
}

/**
 * Normalizes and tokenizes free text or source identifiers into lowercase
 * word tokens. Numbers are kept attached to adjacent letters (e.g. `sha256`)
 * rather than split out, since splitting digits from letters more often
 * destroys meaning (`utf8`, `base64`) than clarifies it.
 */
export function tokenize(text: string): string[] {
  let normalized = text;
  normalized = normalized.replace(PATH_SEPARATORS, " ");
  normalized = normalized.replace(SNAKE_KEBAB_SEPARATORS, " ");
  normalized = splitCompoundIdentifiers(normalized);
  normalized = normalized.replace(NON_ALPHANUMERIC, " ");
  normalized = normalized.toLowerCase();
  normalized = normalized.trim().replace(WHITESPACE, " ");
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Tokenizes several text fields and concatenates the resulting token streams, in order. */
export function tokenizeFields(fields: readonly string[]): string[] {
  return fields.flatMap(tokenize);
}
