/**
 * Normalization at the YAML boundary (CLAUDE.md rule 3, REQ-CORE-004 AC3).
 *
 * Every value the engine returns has to survive `structuredClone`, because
 * Studio moves those values across an Electron IPC boundary. YAML's default
 * schema already yields plain JS, but tagged timestamps, explicit maps, and
 * `undefined` can slip through, so normalize rather than trust.
 */
export function toPlainValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), toPlainValue(v)]));
  if (value instanceof Set) return [...value].map(toPlainValue);
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlainValue(v)]));
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return String(value);
  return value;
}
