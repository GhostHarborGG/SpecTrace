import ts from "typescript";

const MAX_NORMALIZED_SOURCE_LENGTH = 4000;
const TYPE_NAME_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/g;

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncate(text: string, maxLength = MAX_NORMALIZED_SOURCE_LENGTH): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

export function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

export function hasStaticModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
}

export function hasAsyncModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

/**
 * Leading `/** ... *\/` or `//` comment immediately above `node` (or above
 * position 0 for a file-level comment), with comment markers stripped.
 * Heuristic text stripping, not a JSDoc parse — sufficient for feeding a
 * lexical retrieval field (spec §9.1).
 */
export function extractLeadingComment(sourceFile: ts.SourceFile, position: number): string {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, position) ?? [];
  if (ranges.length === 0) return "";

  const stripped = ranges
    .map((range) => fullText.slice(range.pos, range.end))
    .map((comment) =>
      comment
        .replace(/^\/\*\*?/, "")
        .replace(/\*\/$/, "")
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, "").replace(/^\/\/\s?/, "").trimEnd())
        .join("\n")
        .trim()
    )
    .filter((text) => text.length > 0);

  return stripped.join("\n");
}

export function extractLeadingDocComment(node: ts.Node, sourceFile: ts.SourceFile): string {
  return extractLeadingComment(sourceFile, node.getFullStart());
}

interface FunctionSignatureParts {
  parameters: readonly ts.ParameterDeclaration[];
  returnType: ts.TypeNode | undefined;
  isAsync: boolean;
  isStatic: boolean;
}

export function parameterTypeTexts(
  parameters: readonly ts.ParameterDeclaration[],
  sourceFile: ts.SourceFile
): string[] {
  return parameters
    .map((p) => (p.type ? collapseWhitespace(p.type.getText(sourceFile)) : ""))
    .filter((text) => text.length > 0);
}

/** Extracts likely PascalCase type-name tokens referenced by a signature, used for the interface-inclusion rule (spec §8.1). */
export function collectReferencedTypeNames(texts: readonly string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(TYPE_NAME_PATTERN)) {
      names.add(match[0]);
    }
  }
  return [...names];
}

function buildParameterList(parameters: readonly ts.ParameterDeclaration[], sourceFile: ts.SourceFile): string {
  return parameters.map((p) => collapseWhitespace(p.getText(sourceFile))).join(", ");
}

export function buildFunctionSignature(
  kind: "function" | "method" | "constructor",
  name: string,
  parts: FunctionSignatureParts,
  sourceFile: ts.SourceFile
): string {
  const params = buildParameterList(parts.parameters, sourceFile);
  const returnType = parts.returnType ? `: ${collapseWhitespace(parts.returnType.getText(sourceFile))}` : "";
  const modifiers = [parts.isStatic ? "static" : null, parts.isAsync ? "async" : null].filter(
    (m): m is string => m !== null
  );
  const prefix = modifiers.length > 0 ? `${modifiers.join(" ")} ` : "";

  if (kind === "constructor") return `${prefix}constructor(${params})`;
  if (kind === "method") return `${prefix}${name}(${params})${returnType}`;
  return `${prefix}function ${name}(${params})${returnType}`;
}

export function buildClassSignature(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string {
  const name = node.name ? node.name.getText(sourceFile) : "";
  const heritage = (node.heritageClauses ?? [])
    .map((h) => collapseWhitespace(h.getText(sourceFile)))
    .join(" ");
  return heritage ? `class ${name} ${heritage}` : `class ${name}`;
}

export function buildInterfaceSignature(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): string {
  const name = node.name.getText(sourceFile);
  const heritage = (node.heritageClauses ?? [])
    .map((h) => collapseWhitespace(h.getText(sourceFile)))
    .join(" ");
  return heritage ? `interface ${name} ${heritage}` : `interface ${name}`;
}

export function lineRange(node: ts.Node, sourceFile: ts.SourceFile): { startLine: number; endLine: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { startLine: start, endLine: end };
}
