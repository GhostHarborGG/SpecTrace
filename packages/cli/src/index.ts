#!/usr/bin/env node
/**
 * @spectrace/cli — command surface (REQ-CLI-001..009).
 * Implemented: `index` (REQ-CLI-003 subset), `analyze` (REQ-CLI-004
 * subset: lexical retrieval / Configuration A only), `evaluate`
 * (REQ-CLI-009). The rest are stubs landing in their build-plan phases.
 * Exit codes (spec §11): 0 ok, 1 operational, 2 usage, 3 validation.
 */
import { Command } from "commander";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ArtifactFormatError,
  CORE_VERSION,
  DEFAULT_BM25F_CONFIG,
  DuplicateSymbolIdIndexError,
  evaluateRetrieval,
  indexRepository,
  parseRetrievalResults,
  retrieveCandidates,
  serializeMetricsReport,
  serializeRetrievalResults,
  type CandidateSet,
  type CodeSymbol,
  type GroundTruthFile,
  type MetricsArtifact,
  type RunProvenance
} from "@spectrace/core";
import { buildRequirementQueryText, loadRequirements } from "./requirements.js";

const program = new Command();

program
  .name("spectrace")
  .description("Requirements traceability for Markdown specs and TypeScript code")
  .version("0.1.0")
  .option("--json", "machine-readable output on stdout");

const printJson = (stream: NodeJS.WritableStream, value: unknown) =>
  stream.write(`${JSON.stringify(value, null, 2)}\n`);

const fail = (value: Record<string, unknown>, code: number): void => {
  printJson(process.stderr, value);
  process.exitCode = code;
};

const stub = (req: string, phase: string) => () => {
  process.stderr.write(`Not implemented yet — ${req} lands in ${phase}.\n`);
  process.exitCode = 1;
};

/** Reads a JSONL symbol index (one CodeSymbol per line, as `spectrace index` writes). */
function readSymbols(filePath: string): CodeSymbol[] {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CodeSymbol);
}

program.command("init").description("Scaffold .spectrace/ config and templates").action(stub("REQ-CLI-001", "Phase B"));
program.command("validate").description("Validate specification documents").action(stub("REQ-CLI-002", "Phase B"));

program
  .command("index")
  .description("Build the symbol index for a repository (REQ-CLI-003 subset)")
  .option("--repo <path>", "repository root to index", ".")
  .option("--commit <sha>", "commit SHA recorded on every symbol (default: git rev-parse HEAD in --repo)")
  .option("--out <file>", "output path for the JSONL index (default: <repo>/.spectrace/index.jsonl)")
  .option(
    "--exclude <pattern>",
    "additional gitignore-style exclusion pattern (repeatable)",
    (value, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option("--json", "machine-readable output on stdout")
  .action((opts: { repo: string; commit?: string; out?: string; exclude: string[]; json?: boolean }, cmd: Command) => {
    const repo = resolve(opts.repo);
    let commit = opts.commit;
    if (!commit) {
      try {
        commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      } catch {
        fail(
          { error: "no_commit", message: `${repo} is not a git repository; pass --commit <sha> explicitly.` },
          1
        );
        return;
      }
    }

    let symbols: CodeSymbol[];
    try {
      ({ symbols } = indexRepository({
        repositoryRoot: repo,
        repositoryCommit: commit,
        ...(opts.exclude.length > 0 ? { additionalExcludePatterns: opts.exclude } : {})
      }));
    } catch (error) {
      if (error instanceof DuplicateSymbolIdIndexError) {
        fail({ error: "duplicate_symbol_id", duplicates: error.duplicates }, 1);
        return;
      }
      throw error;
    }

    const outPath = resolve(opts.out ?? resolve(repo, ".spectrace", "index.jsonl"));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, symbols.map((s) => JSON.stringify(s)).join("\n") + (symbols.length > 0 ? "\n" : ""), "utf8");

    const countsByKind: Record<string, number> = {};
    for (const s of symbols) countsByKind[s.kind] = (countsByKind[s.kind] ?? 0) + 1;

    if (cmd.optsWithGlobals().json) {
      printJson(process.stdout, { symbolCount: symbols.length, countsByKind, repositoryCommit: commit, outputPath: outPath });
    } else {
      for (const [kind, count] of Object.entries(countsByKind).sort()) {
        process.stdout.write(`${kind.padEnd(12)} ${count}\n`);
      }
      process.stdout.write(`total        ${symbols.length}\n${outPath}\n`);
    }
  });

program
  .command("analyze")
  .description("Retrieve candidates per requirement (REQ-CLI-004 subset: lexical retrieval only; ranking lands in Phase D)")
  .requiredOption("--requirements <dir>", "directory of requirement .md files (prelim spec §6.3 format)")
  .requiredOption("--index <file>", "JSONL symbol index produced by `spectrace index`")
  .option("--top-k <n>", "candidates to retain per requirement", "10")
  .option("--out <file>", "write results as a provenance-carrying JSONL artifact (REQ-CORE-071)")
  .option("--json", "machine-readable output on stdout")
  .action((opts: { requirements: string; index: string; topK: string; out?: string; json?: boolean }, cmd: Command) => {
    const { requirements, errors } = loadRequirements(resolve(opts.requirements));
    if (errors.length > 0) {
      fail({ error: "invalid_requirements", errors }, 3);
      return;
    }

    let symbols: CodeSymbol[];
    try {
      symbols = readSymbols(resolve(opts.index));
    } catch (error) {
      fail({ error: "unreadable_index", message: error instanceof Error ? error.message : String(error) }, 1);
      return;
    }
    const repositoryCommit = symbols[0]?.repositoryCommit;
    if (repositoryCommit === undefined) {
      fail({ error: "empty_index", message: "Index file has no symbols." }, 1);
      return;
    }

    const topK = Number.parseInt(opts.topK, 10);
    if (!Number.isInteger(topK) || topK <= 0) {
      fail({ error: "invalid_top_k", message: `--top-k must be a positive integer; got ${opts.topK}.` }, 2);
      return;
    }

    const results = retrieveCandidates({
      queries: requirements.map((r) => ({ requirementId: r.id, text: buildRequirementQueryText(r) })),
      symbols,
      topK,
      repositoryCommit
    });

    const provenance: RunProvenance = {
      repositoryCommit,
      configurationId: DEFAULT_BM25F_CONFIG.configurationId,
      engineVersion: CORE_VERSION
    };

    let outPath: string | undefined;
    if (opts.out) {
      outPath = resolve(opts.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, serializeRetrievalResults(results, provenance), "utf8");
    }

    if (cmd.optsWithGlobals().json) {
      printJson(process.stdout, {
        requirementCount: requirements.length,
        ...provenance,
        ...(outPath ? { outputPath: outPath } : { results })
      });
    } else {
      process.stdout.write(
        `retrieved top-${topK} candidates for ${requirements.length} requirement(s) ` +
          `(config ${provenance.configurationId}, commit ${repositoryCommit})\n`
      );
      if (outPath) {
        process.stdout.write(`${outPath}\n`);
      } else {
        for (const set of results) {
          const top = set.candidates[0];
          process.stdout.write(`${set.requirementId}: ${top ? `${top.symbolId} (${top.score.toFixed(3)})` : "no candidates"}\n`);
        }
      }
    }
  });

program.command("review").description("Review queued proposals").action(stub("REQ-CLI-005", "Phase D"));
program.command("links").description("Bidirectional trace-link queries").action(stub("REQ-CLI-006", "Phase D/E"));
program.command("coverage").description("Coverage summary").action(stub("REQ-CLI-007", "Phase D/E"));
program.command("drift").description("Git-aware drift analysis").action(stub("REQ-CLI-008", "Phase F"));

const evaluate = program.command("evaluate").description("Evaluation metrics against labeled ground truth (REQ-CLI-009)");

evaluate
  .command("retrieval")
  .description("Recall@k, Hit@k, and MRR for a retrieval results artifact (REQ-CORE-070)")
  .requiredOption("--results <file>", "results artifact from `spectrace analyze --out` (legacy headerless JSONL also accepted)")
  .requiredOption("--ground-truth <file>", "hand-labeled ground-truth.json")
  .option("--requirements <dir>", "requirement .md directory; enables difficulty breakdowns and scores requirements absent from the results")
  .option("--k <list>", "comma-separated k values (default 1,3,5,10)")
  .option("--out <file>", "also write the report as a metrics artifact (REQ-CORE-071)")
  .option("--json", "machine-readable output on stdout")
  .action(
    (
      opts: { results: string; groundTruth: string; requirements?: string; k?: string; out?: string; json?: boolean },
      cmd: Command
    ) => {
      let ks: number[] | undefined;
      if (opts.k) {
        ks = opts.k.split(",").map((v) => Number.parseInt(v.trim(), 10));
        if (ks.some((k) => !Number.isInteger(k) || k <= 0)) {
          fail({ error: "invalid_k", message: `--k must be comma-separated positive integers; got ${opts.k}.` }, 2);
          return;
        }
      }

      let parsed: { provenance: RunProvenance | null; results: CandidateSet[] };
      try {
        parsed = parseRetrievalResults(readFileSync(resolve(opts.results), "utf8"));
      } catch (error) {
        const kind = error instanceof ArtifactFormatError ? "malformed_results" : "unreadable_results";
        fail({ error: kind, message: error instanceof Error ? error.message : String(error) }, 1);
        return;
      }

      let groundTruthRaw: unknown;
      try {
        groundTruthRaw = JSON.parse(readFileSync(resolve(opts.groundTruth), "utf8"));
      } catch (error) {
        fail({ error: "unreadable_ground_truth", message: error instanceof Error ? error.message : String(error) }, 1);
        return;
      }
      if (
        typeof groundTruthRaw !== "object" ||
        groundTruthRaw === null ||
        !Array.isArray((groundTruthRaw as { links?: unknown }).links)
      ) {
        fail(
          { error: "malformed_ground_truth", message: "Ground-truth file must be a JSON object with a `links` array." },
          1
        );
        return;
      }

      let evaluationRequirements: { id: string; difficulty?: string }[];
      if (opts.requirements) {
        const { requirements, errors } = loadRequirements(resolve(opts.requirements));
        if (errors.length > 0) {
          fail({ error: "invalid_requirements", errors }, 1);
          return;
        }
        evaluationRequirements = requirements.map((r) => ({ id: r.id, difficulty: r.difficulty }));
      } else {
        evaluationRequirements = parsed.results.map((r) => ({ id: r.requirementId }));
      }

      const report = evaluateRetrieval({
        results: parsed.results,
        groundTruth: groundTruthRaw as GroundTruthFile,
        requirements: evaluationRequirements,
        ...(ks ? { ks } : {})
      });

      const serialized = serializeMetricsReport(report, parsed.provenance);
      if (opts.out) {
        const outPath = resolve(opts.out);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, serialized, "utf8");
      }

      if (cmd.optsWithGlobals().json) {
        process.stdout.write(serialized);
      } else {
        process.stdout.write(formatMetricsHuman(JSON.parse(serialized) as MetricsArtifact));
      }
    }
  );

function formatMetricsHuman(artifact: MetricsArtifact): string {
  const lines: string[] = [];
  const p = artifact.provenance;
  lines.push(
    p
      ? `config ${p.configurationId} · commit ${p.repositoryCommit} · engine ${p.engineVersion}`
      : "no provenance (legacy results file)"
  );
  for (const b of artifact.report.breakdowns) {
    lines.push("");
    lines.push(`${b.label}  (n=${b.requirementCount})`);
    const cols = artifact.report.ks.map(String);
    lines.push(`  Recall  ${cols.map((k) => `@${k} ${b.recallAtK[k]!.toFixed(3)}`).join("  ")}`);
    lines.push(`  Hit%    ${cols.map((k) => `@${k} ${b.hitAtK[k]!.toFixed(1)}`).join("  ")}`);
    lines.push(`  MRR     ${b.meanReciprocalRank.toFixed(3)}`);
    if (b.requirementsWithoutGroundTruth.length > 0) {
      lines.push(`  unscored: ${b.requirementsWithoutGroundTruth.join(", ")}`);
    }
  }
  return lines.join("\n") + "\n";
}

program.parseAsync().catch((err) => {
  process.stderr.write(String(err?.message ?? err) + "\n");
  process.exitCode = 1;
});
