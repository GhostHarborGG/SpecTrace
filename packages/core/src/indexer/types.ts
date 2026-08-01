import type { SymbolKind } from "./symbol-id.js";

export type { SymbolKind };

/** Matches spec §8.2. */
export interface CodeSymbol {
  symbolId: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  documentation: string;
  normalizedSource: string;
  exported: boolean;
  repositoryCommit: string;
}
