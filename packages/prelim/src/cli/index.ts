#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DuplicateSymbolIdIndexError,
  indexRepository,
  DEFAULT_BM25F_CONFIG,
  type CodeSymbol
} from "@spectrace/core";
import { loadRequirements } from "../requirements/index.js";
import { retrieveForAllRequirements, type RetrievalResult } from "../retrieval/rank.js";
import { readJsonLines, writeJsonLines } from "../output/jsonl.js";
import {
  loadGroundTruth,
  scaffoldGroundTruth,
  validateGroundTruth,
  writeGroundTruth,
  type GroundTruthFile
} from "../evaluation/ground-truth.js";
import { evaluateRetrieval } from "../evaluation/retrieval-metrics.js";

const program = new Command();

program
  .name("spectrace-prelim")
  .description(
    "Preliminary experiment harness for SpecTrace (see ../SpecTrace_Preliminary_Work_Specification.md). " +
      "See §17 for the full intended command surface; commands not yet implemented say so and exit non-zero."
  )
  .option("--config <file>", "shared configuration file (reserved; not yet consumed by individual commands)");

function printJson(stream: NodeJS.WritableStream, value: unknown): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function failNotImplemented(commandPath: string): void {
  printJson(process.stderr, {
    error: "not_implemented",
    command: commandPath,
    message: `'${commandPath}' is not implemented yet.`
  });
  process.exitCode = 2;
}

const requirementsCommand = program.command("requirements").description("Requirement file operations (spec §6)");

requirementsCommand
  .command("validate")
  .description("Parse and validate every requirement Markdown file in a directory (spec §6.4)")
  .requiredOption("--dir <path>", "directory containing requirement .md files")
  .action((opts: { dir: string }) => {
    const { requirements, errors } = loadRequirements(resolve(opts.dir));
    printJson(process.stdout, {
      requirementCount: requirements.length,
      errorCount: errors.length,
      errors
    });
    process.exitCode = errors.length > 0 ? 1 : 0;
  });

interface IndexOptions {
  repo: string;
  commit: string;
  out: string;
  exclude?: string[];
}

program
  .command("index")
  .description("Extract source symbols from a TypeScript/JavaScript repository (spec §8)")
  .requiredOption("--repo <path>", "path to the repository root")
  .requiredOption("--commit <sha>", "the frozen commit SHA being indexed (recorded on every symbol)")
  .requiredOption("--out <file>", "output path for index.jsonl")
  .option("--exclude <pattern>", "additional gitignore-style exclusion pattern (repeatable)", (value, previous: string[]) => [
    ...previous,
    value
  ], [] as string[])
  .action((opts: IndexOptions) => {
    try {
      const { symbols } = indexRepository({
        repositoryRoot: resolve(opts.repo),
        repositoryCommit: opts.commit,
        ...(opts.exclude && opts.exclude.length > 0 ? { additionalExcludePatterns: opts.exclude } : {})
      });
      const outPath = resolve(opts.out);
      writeJsonLines(outPath, symbols);
      printJson(process.stdout, {
        symbolCount: symbols.length,
        outputPath: outPath,
        repositoryCommit: opts.commit
      });
      process.exitCode = 0;
    } catch (error) {
      if (error instanceof DuplicateSymbolIdIndexError) {
        printJson(process.stderr, { error: "duplicate_symbol_id", duplicates: error.duplicates });
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

interface RetrieveOptions {
  requirements: string;
  index: string;
  out: string;
  topK: string;
}

program
  .command("retrieve")
  .description("Run BM25F retrieval for every requirement against a symbol index (spec §9)")
  .requiredOption("--requirements <dir>", "directory containing requirement .md files")
  .requiredOption("--index <file>", "index.jsonl produced by the index command")
  .requiredOption("--out <file>", "output path for retrieval.jsonl")
  .option("--top-k <n>", "number of candidates to retain per requirement", "10")
  .action((opts: RetrieveOptions) => {
    const { requirements, errors } = loadRequirements(resolve(opts.requirements));
    if (errors.length > 0) {
      printJson(process.stderr, { error: "invalid_requirements", errors });
      process.exitCode = 1;
      return;
    }

    const symbols = readJsonLines<CodeSymbol>(resolve(opts.index));
    const repositoryCommit = symbols[0]?.repositoryCommit;
    if (repositoryCommit === undefined) {
      printJson(process.stderr, { error: "empty_index", message: "Index file has no symbols." });
      process.exitCode = 1;
      return;
    }

    const topK = Number.parseInt(opts.topK, 10);
    const results = retrieveForAllRequirements(symbols, requirements, topK, repositoryCommit);

    const outPath = resolve(opts.out);
    writeJsonLines(outPath, results);
    printJson(process.stdout, {
      requirementCount: requirements.length,
      configurationId: DEFAULT_BM25F_CONFIG.configurationId,
      repositoryCommit,
      outputPath: outPath
    });
    process.exitCode = 0;
  });

interface GroundTruthScaffoldOptions {
  index: string;
  labeler: string;
  out: string;
}

interface GroundTruthValidateOptions {
  file: string;
  requirements: string;
  index: string;
}

// Not part of spec §17's literal command list, but needed to support §7's
// human labeling process: this only generates/validates the file shape, it
// never proposes or judges an actual requirement-to-symbol link.
const groundTruthCommand = program.command("ground-truth").description("Ground-truth file tooling (spec §7)");

groundTruthCommand
  .command("scaffold")
  .description("Generate an empty ground-truth.json skeleton for a human labeler to fill in (spec §7.1-§7.2)")
  .requiredOption("--index <file>", "index.jsonl produced by the index command (used only for its repositoryCommit)")
  .requiredOption("--labeler <name>", "name of the person doing the labeling")
  .requiredOption("--out <file>", "output path for the ground-truth skeleton")
  .action((opts: GroundTruthScaffoldOptions) => {
    const symbols = readJsonLines<CodeSymbol>(resolve(opts.index));
    const repositoryCommit = symbols[0]?.repositoryCommit;
    if (repositoryCommit === undefined) {
      printJson(process.stderr, { error: "empty_index", message: "Index file has no symbols." });
      process.exitCode = 1;
      return;
    }

    const file = scaffoldGroundTruth({ repositoryCommit, labeler: opts.labeler });
    const outPath = resolve(opts.out);
    writeGroundTruth(outPath, file);
    printJson(process.stdout, { outputPath: outPath, repositoryCommit, labeler: opts.labeler });
  });

groundTruthCommand
  .command("validate")
  .description("Validate a hand-labeled ground-truth.json's shape and ID references (spec §7.3)")
  .requiredOption("--file <file>", "ground-truth.json to validate")
  .requiredOption("--requirements <dir>", "directory of requirement Markdown files")
  .requiredOption("--index <file>", "index.jsonl to check symbolId references against")
  .action((opts: GroundTruthValidateOptions) => {
    const { requirements, errors: requirementErrors } = loadRequirements(resolve(opts.requirements));
    if (requirementErrors.length > 0) {
      printJson(process.stderr, { error: "invalid_requirements", errors: requirementErrors });
      process.exitCode = 1;
      return;
    }

    const symbols = readJsonLines<CodeSymbol>(resolve(opts.index));

    let raw: unknown;
    try {
      raw = loadGroundTruth(resolve(opts.file));
    } catch (error) {
      printJson(process.stderr, {
        error: "invalid_json",
        message: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
      return;
    }

    const errors = validateGroundTruth(raw, {
      requirementIds: new Set(requirements.map((r) => r.id)),
      symbolIds: new Set(symbols.map((s) => s.symbolId))
    });

    printJson(process.stdout, { errorCount: errors.length, errors });
    process.exitCode = errors.length > 0 ? 1 : 0;
  });

// Commands from spec §17 that later implementation phases (§20 Phases 5-8) will fill in.
// Registered now so `--help` reflects the full intended surface; each exits non-zero
// rather than silently doing nothing.
const evaluateCommand = program.command("evaluate").description("Evaluation commands (spec §10, §11.3.1)");

interface EvaluateRetrievalOptions {
  results: string;
  groundTruth: string;
  requirements: string;
  out?: string;
}

evaluateCommand
  .command("retrieval")
  .description("Calculate Recall@k, Hit@k, and MRR against ground truth (spec §10)")
  .requiredOption("--results <file>", "retrieval.jsonl")
  .requiredOption("--ground-truth <file>", "ground-truth.json")
  .requiredOption("--requirements <dir>", "directory of requirement Markdown files (needed for the §10.4 difficulty breakdowns)")
  .option("--out <file>", "optional path to also write the report as metrics.json")
  .action((opts: EvaluateRetrievalOptions) => {
    const { requirements, errors: requirementErrors } = loadRequirements(resolve(opts.requirements));
    if (requirementErrors.length > 0) {
      printJson(process.stderr, { error: "invalid_requirements", errors: requirementErrors });
      process.exitCode = 1;
      return;
    }

    const results = readJsonLines<RetrievalResult>(resolve(opts.results));

    let groundTruthRaw: unknown;
    try {
      groundTruthRaw = loadGroundTruth(resolve(opts.groundTruth));
    } catch (error) {
      printJson(process.stderr, {
        error: "invalid_json",
        message: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
      return;
    }
    if (typeof groundTruthRaw !== "object" || groundTruthRaw === null || !Array.isArray((groundTruthRaw as { links?: unknown }).links)) {
      printJson(process.stderr, {
        error: "invalid_ground_truth",
        message: "Ground-truth file must be a JSON object with a `links` array. Run `ground-truth validate` first."
      });
      process.exitCode = 1;
      return;
    }

    const report = evaluateRetrieval({
      results,
      groundTruth: groundTruthRaw as GroundTruthFile,
      requirements
    });

    if (opts.out) {
      const outPath = resolve(opts.out);
      writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    printJson(process.stdout, report);
    process.exitCode = 0;
  });

evaluateCommand
  .command("links")
  .description("Score LLM ranking responses against ground truth (spec §11.3.1)")
  .requiredOption("--responses <dir>", "directory of LLM response records")
  .requiredOption("--ground-truth <file>", "ground-truth.json")
  .action(() => failNotImplemented("evaluate links"));

program
  .command("rank")
  .description("Submit the top candidates per requirement to an LLM for structured classification (spec §11)")
  .requiredOption("--results <file>", "retrieval.jsonl")
  .option("--top-k <n>", "candidates per requirement to submit", "5")
  .requiredOption("--model <model>", "model identifier")
  .action(() => failNotImplemented("rank"));

program
  .command("drift")
  .description("Apply and score a controlled drift scenario (spec §13)")
  .requiredOption("--base <sha>", "baseline commit")
  .requiredOption("--scenario <sha>", "scenario commit")
  .action(() => failNotImplemented("drift"));

program
  .command("report")
  .description("Generate the preliminary report for a run (spec §19)")
  .requiredOption("--run <run-id>", "run ID under runs/")
  .action(() => failNotImplemented("report"));

program.parseAsync(process.argv).catch((error: unknown) => {
  printJson(process.stderr, { error: "unhandled_exception", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
