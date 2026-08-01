import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ExclusionMatcher } from "./exclusions.js";
import { collectSourceFiles } from "./source-files.js";
import {
  assignSymbolIds,
  type DuplicateSymbolIdError,
  type OverloadSignature,
  type SymbolIdCandidate
} from "./symbol-id.js";
import type { CodeSymbol, SymbolKind } from "./types.js";
import {
  buildClassSignature,
  buildFunctionSignature,
  buildInterfaceSignature,
  collapseWhitespace,
  collectReferencedTypeNames,
  extractLeadingComment,
  extractLeadingDocComment,
  hasAsyncModifier,
  hasExportModifier,
  hasStaticModifier,
  lineRange,
  parameterTypeTexts,
  truncate
} from "./ast-helpers.js";

export interface IndexerConfig {
  repositoryRoot: string;
  repositoryCommit: string;
  /** Extra gitignore-style patterns beyond the repository's own `.gitignore` (REQ-CORE-011). */
  additionalExcludePatterns?: readonly string[];
  /** Interface names to include even when no extracted function/method/constructor references them — prelim spec §8.1's "referenced by name in the source documentation for a requirement" path. Populate this from requirement text before indexing if that inclusion path is needed. */
  additionalInterfaceNames?: ReadonlySet<string>;
}

export interface IndexResult {
  symbols: CodeSymbol[];
}

export class DuplicateSymbolIdIndexError extends Error {
  constructor(public readonly duplicates: readonly DuplicateSymbolIdError[]) {
    super(
      `Indexing produced ${duplicates.length} duplicate symbol ID(s): ${duplicates
        .map((d) => d.symbolId)
        .join(", ")}`
    );
    this.name = "DuplicateSymbolIdIndexError";
  }
}

interface PendingSymbol {
  relativePath: string;
  qualifiedName: string;
  kind: SymbolKind;
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  documentation: string;
  normalizedSource: string;
  exported: boolean;
  overloadSignature?: OverloadSignature;
}

/**
 * Extracts source symbols with the TypeScript Compiler API (REQ-CORE-010;
 * extraction rules detailed in specs/spectrace-prelim-spec.md §8).
 * Parses each file syntactically (`ts.createSourceFile`) rather than
 * building a full type-checked `ts.Program`: this tool only needs the
 * syntactic shape of declarations (names, parameter/return type text,
 * doc comments), not resolved semantic types, and skipping program
 * construction means indexing never depends on the target repository's
 * dependencies being installed or resolvable.
 *
 * Extraction is intentionally scoped to module-level declarations and
 * direct class members — nested/local functions are not indexed as
 * separate symbols, matching the granularity requirements are expected to
 * target (prelim spec §8.1's file/module/class/interface/function/method/
 * constructor kinds, none of which is "local closure").
 *
 * Core design rules (CLAUDE.md 2-4): no console output, no env reads, no
 * process.exit; returns plain structuredClone-safe data; POSIX paths only.
 */
export function indexRepository(config: IndexerConfig): IndexResult {
  const matcher = new ExclusionMatcher({
    repositoryRoot: config.repositoryRoot,
    ...(config.additionalExcludePatterns ? { additionalPatterns: config.additionalExcludePatterns } : {})
  });
  const relativeFilePaths = collectSourceFiles(config.repositoryRoot, matcher);

  const pending: PendingSymbol[] = [];
  const pendingInterfaces: PendingSymbol[] = [];
  const referencedTypeNames = new Set<string>();

  for (const relativePath of relativeFilePaths) {
    indexSourceFile({
      repositoryRoot: config.repositoryRoot,
      relativePath,
      pending,
      pendingInterfaces,
      referencedTypeNames
    });
  }

  const includedInterfaceNames = new Set<string>([
    ...referencedTypeNames,
    ...(config.additionalInterfaceNames ?? [])
  ]);
  for (const iface of pendingInterfaces) {
    if (includedInterfaceNames.has(iface.name)) {
      pending.push(iface);
    }
  }

  // Explicit final sort so output order never depends on filesystem
  // enumeration order, satisfying the byte-equivalent determinism
  // requirement (REQ-CORE-010 AC1, REQ-CORE-012 AC1; prelim spec §8.5).
  pending.sort(
    (a, b) =>
      a.relativePath.localeCompare(b.relativePath) ||
      a.qualifiedName.localeCompare(b.qualifiedName) ||
      a.kind.localeCompare(b.kind)
  );

  const idCandidates: SymbolIdCandidate[] = pending.map((p) => ({
    relativePath: p.relativePath,
    qualifiedName: p.qualifiedName,
    kind: p.kind,
    ...(p.overloadSignature ? { signature: p.overloadSignature } : {})
  }));
  const { ids, duplicates } = assignSymbolIds(idCandidates);
  if (duplicates.length > 0) {
    throw new DuplicateSymbolIdIndexError(duplicates);
  }

  const symbols: CodeSymbol[] = pending.map((p, index) => ({
    symbolId: ids[index]!,
    kind: p.kind,
    name: p.name,
    qualifiedName: p.qualifiedName,
    relativePath: p.relativePath,
    startLine: p.startLine,
    endLine: p.endLine,
    signature: p.signature,
    documentation: p.documentation,
    normalizedSource: p.normalizedSource,
    exported: p.exported,
    repositoryCommit: config.repositoryCommit
  }));

  return { symbols };
}

function scriptKindFor(relativePath: string): ts.ScriptKind {
  if (relativePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (relativePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (relativePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function indexSourceFile(args: {
  repositoryRoot: string;
  relativePath: string;
  pending: PendingSymbol[];
  pendingInterfaces: PendingSymbol[];
  referencedTypeNames: Set<string>;
}): void {
  const { repositoryRoot, relativePath, pending, pendingInterfaces, referencedTypeNames } = args;
  const absolutePath = join(repositoryRoot, relativePath);
  const text = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(relativePath)
  );

  let fileHasExport = false;

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) {
      fileHasExport = true;
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      const exported = hasExportModifier(statement);
      fileHasExport = fileHasExport || exported;
      indexClass(statement, sourceFile, relativePath, pending, referencedTypeNames, exported);
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      const exported = hasExportModifier(statement);
      fileHasExport = fileHasExport || exported;
      indexFunctionDeclaration(statement, sourceFile, relativePath, pending, referencedTypeNames, exported);
      continue;
    }

    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      const exported = hasExportModifier(statement);
      fileHasExport = fileHasExport || exported;
      pendingInterfaces.push(buildInterfacePendingSymbol(statement, sourceFile, relativePath, exported));
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          fileHasExport = fileHasExport || exported;
          indexVariableFunction(
            declaration,
            declaration.initializer,
            sourceFile,
            relativePath,
            pending,
            referencedTypeNames,
            exported
          );
        }
      }
      continue;
    }
  }

  pending.push(buildFileSymbol(sourceFile, relativePath, fileHasExport));
  if (fileHasExport) {
    pending.push(buildModuleSymbol(sourceFile, relativePath));
  }
}

function indexClass(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  relativePath: string,
  pending: PendingSymbol[],
  referencedTypeNames: Set<string>,
  exported: boolean
): void {
  const className = node.name!.getText(sourceFile);
  const { startLine, endLine } = lineRange(node, sourceFile);

  pending.push({
    relativePath,
    qualifiedName: className,
    kind: "class",
    name: className,
    startLine,
    endLine,
    signature: buildClassSignature(node, sourceFile),
    documentation: extractLeadingDocComment(node, sourceFile),
    normalizedSource: truncate(collapseWhitespace(node.getText(sourceFile))),
    exported
  });

  for (const member of node.members) {
    if (ts.isConstructorDeclaration(member) && member.body) {
      const hasDoc = extractLeadingDocComment(member, sourceFile).length > 0;
      if (member.parameters.length === 0 && !hasDoc) {
        // prelim spec §8.1: only extract constructors that declare parameters or carry documentation.
        continue;
      }
      indexMember(member, "constructor", "constructor", className, sourceFile, relativePath, pending, referencedTypeNames);
      continue;
    }

    if (
      (ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)) &&
      member.body &&
      member.name
    ) {
      const memberName = member.name.getText(sourceFile);
      indexMember(member, "method", memberName, className, sourceFile, relativePath, pending, referencedTypeNames);
    }
  }
}

type FunctionLikeMember =
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;

function indexMember(
  member: FunctionLikeMember,
  kind: "method" | "constructor",
  memberName: string,
  className: string,
  sourceFile: ts.SourceFile,
  relativePath: string,
  pending: PendingSymbol[],
  referencedTypeNames: Set<string>
): void {
  const { startLine, endLine } = lineRange(member, sourceFile);
  const paramTypeTexts = parameterTypeTexts(member.parameters, sourceFile);
  const returnTypeText = member.type ? collapseWhitespace(member.type.getText(sourceFile)) : "";
  for (const name of collectReferencedTypeNames([...paramTypeTexts, returnTypeText])) {
    referencedTypeNames.add(name);
  }

  const isAsync = hasAsyncModifier(member);
  const isStatic = hasStaticModifier(member);

  pending.push({
    relativePath,
    qualifiedName: `${className}.${memberName}`,
    kind,
    name: memberName,
    startLine,
    endLine,
    signature: buildFunctionSignature(
      kind,
      memberName,
      { parameters: member.parameters, returnType: member.type, isAsync, isStatic },
      sourceFile
    ),
    documentation: extractLeadingDocComment(member, sourceFile),
    normalizedSource: truncate(collapseWhitespace(member.getText(sourceFile))),
    exported: false,
    overloadSignature: { parameterTypes: paramTypeTexts, returnType: returnTypeText }
  });
}

function indexFunctionDeclaration(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  relativePath: string,
  pending: PendingSymbol[],
  referencedTypeNames: Set<string>,
  exported: boolean
): void {
  const name = node.name!.getText(sourceFile);
  const { startLine, endLine } = lineRange(node, sourceFile);
  const paramTypeTexts = parameterTypeTexts(node.parameters, sourceFile);
  const returnTypeText = node.type ? collapseWhitespace(node.type.getText(sourceFile)) : "";
  for (const typeName of collectReferencedTypeNames([...paramTypeTexts, returnTypeText])) {
    referencedTypeNames.add(typeName);
  }
  const isAsync = hasAsyncModifier(node);

  pending.push({
    relativePath,
    qualifiedName: name,
    kind: "function",
    name,
    startLine,
    endLine,
    signature: buildFunctionSignature(
      "function",
      name,
      { parameters: node.parameters, returnType: node.type, isAsync, isStatic: false },
      sourceFile
    ),
    documentation: extractLeadingDocComment(node, sourceFile),
    normalizedSource: truncate(collapseWhitespace(node.getText(sourceFile))),
    exported,
    overloadSignature: { parameterTypes: paramTypeTexts, returnType: returnTypeText }
  });
}

function indexVariableFunction(
  declaration: ts.VariableDeclaration,
  initializer: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  relativePath: string,
  pending: PendingSymbol[],
  referencedTypeNames: Set<string>,
  exported: boolean
): void {
  const name = (declaration.name as ts.Identifier).getText(sourceFile);
  const { startLine, endLine } = lineRange(declaration, sourceFile);
  const paramTypeTexts = parameterTypeTexts(initializer.parameters, sourceFile);
  const returnTypeText = initializer.type ? collapseWhitespace(initializer.type.getText(sourceFile)) : "";
  for (const typeName of collectReferencedTypeNames([...paramTypeTexts, returnTypeText])) {
    referencedTypeNames.add(typeName);
  }
  const isAsync = hasAsyncModifier(initializer);

  pending.push({
    relativePath,
    qualifiedName: name,
    kind: "function",
    name,
    startLine,
    endLine,
    signature: buildFunctionSignature(
      "function",
      name,
      { parameters: initializer.parameters, returnType: initializer.type, isAsync, isStatic: false },
      sourceFile
    ),
    documentation: extractLeadingDocComment(declaration.parent.parent, sourceFile),
    normalizedSource: truncate(collapseWhitespace(declaration.getText(sourceFile))),
    exported,
    overloadSignature: { parameterTypes: paramTypeTexts, returnType: returnTypeText }
  });
}

function buildInterfacePendingSymbol(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  relativePath: string,
  exported: boolean
): PendingSymbol {
  const name = node.name.getText(sourceFile);
  const { startLine, endLine } = lineRange(node, sourceFile);
  return {
    relativePath,
    qualifiedName: name,
    kind: "interface",
    name,
    startLine,
    endLine,
    signature: buildInterfaceSignature(node, sourceFile),
    documentation: extractLeadingDocComment(node, sourceFile),
    normalizedSource: truncate(collapseWhitespace(node.getText(sourceFile))),
    exported
  };
}

function buildFileSymbol(sourceFile: ts.SourceFile, relativePath: string, exported: boolean): PendingSymbol {
  const endLine = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1;
  const name = relativePath.split("/").pop()!;
  return {
    relativePath,
    qualifiedName: relativePath,
    kind: "file",
    name,
    startLine: 1,
    endLine,
    signature: "",
    documentation: extractLeadingComment(sourceFile, 0),
    normalizedSource: truncate(collapseWhitespace(sourceFile.getText())),
    exported
  };
}

function buildModuleSymbol(sourceFile: ts.SourceFile, relativePath: string): PendingSymbol {
  const endLine = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1;
  const withoutExtension = relativePath.replace(/\.(tsx|ts|jsx|js)$/, "");
  const name = withoutExtension.split("/").pop()!;
  return {
    relativePath,
    qualifiedName: withoutExtension,
    kind: "module",
    name,
    startLine: 1,
    endLine,
    signature: "",
    documentation: extractLeadingComment(sourceFile, 0),
    normalizedSource: "",
    exported: true
  };
}
