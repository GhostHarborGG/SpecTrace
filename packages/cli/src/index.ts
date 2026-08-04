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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  ArtifactFormatError,
  CONFIG_FILE_RELATIVE_PATH,
  CORE_VERSION,
  DEFAULT_MERGE_STRATEGY,
  DEFAULT_RRF_K,
  DEFAULT_ALPHA,
  DuplicateSymbolIdIndexError,
  MERGE_STRATEGY_IDS,
  compareMetricsReports,
  serializeMetricsComparison,
  IndexArtifactFormatError,
  TEMPLATES,
  TRANSMISSION_LOG_ARTIFACT,
  TRANSMISSION_LOG_VERSION,
  auditTransmissionLog,
  buildTransmissionUnits,
  evaluateRetrieval,
  instantiateTemplate,
  isIndexCurrent,
  renderDefaultConfig,
  toPosixPath,
  indexRepository,
  loadConfig,
  parseRetrievalResults,
  parseSymbolIndex,
  readRequirementDocuments,
  serializeMetricsReport,
  serializeRetrievalResults,
  serializeSymbolIndex,
  serializeTransmissionLog,
  validateRequirements,
  type CandidateSet,
  type CodeSymbol,
  type ConfigurationRun,
  type GroundTruthFile,
  type RetrievalMode,
  type MergeConfig,
  type MergeStrategyId,
  type MetricsArtifact,
  type RequirementDocument,
  type RunProvenance,
  type SymbolIndexProvenance,
  type TransmissionAudit,
  type TransmissionLog
} from "@spectrace/core";
import { buildRequirementQueryText, loadRequirements } from "./requirements.js";
import { DEFAULT_EMBEDDING_MODEL } from "./embedding-provider.js";
import { runRetrieval } from "./retrieval-run.js";
import { COMPARISON_FORMATS, renderComparison, type ComparisonFormat } from "./comparison-format.js";

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

/** Reads an index artifact written by `spectrace index` (REQ-CORE-012); headerless files still parse. */
function readSymbols(filePath: string): CodeSymbol[] {
  return parseSymbolIndex(readFileSync(filePath, "utf8")).symbols;
}

/** Envelope for `init --json`; versioned per SPEC-CLI-000 §3 AC1. */
const INIT_REPORT_ARTIFACT = "spectrace.init-report";
const INIT_REPORT_VERSION = 1;

program
  .command("init")
  .description("Scaffold .spectrace/ config and templates (REQ-CLI-001)")
  .option("--repo <path>", "repository root to scaffold", ".")
  .option("--force", "overwrite files that already exist", false)
  .option("--json", "machine-readable output on stdout")
  .action((opts: { repo: string; force: boolean; json?: boolean }, cmd: Command) => {
    const repo = resolve(opts.repo);
    if (!existsSync(repo)) {
      fail({ error: "missing_repo", message: `${repo} does not exist.` }, 1);
      return;
    }

    // Config content and template content both come from core — the CLI only
    // decides where the bytes land (SPEC-CLI-000 §1).
    const files: { relativePath: string; content: string }[] = [
      { relativePath: CONFIG_FILE_RELATIVE_PATH, content: renderDefaultConfig() },
      ...TEMPLATES.map((template) => ({
        relativePath: `.spectrace/templates/${template.fileName}`,
        content: instantiateTemplate({ kind: template.kind }).content
      }))
    ];

    const created: string[] = [];
    const skipped: string[] = [];
    const overwritten: string[] = [];

    for (const file of files) {
      const absolute = resolve(repo, file.relativePath);
      const exists = existsSync(absolute);
      if (exists && !opts.force) {
        // Idempotent by default: an existing file is never rewritten (AC2, AC3).
        skipped.push(file.relativePath);
        continue;
      }
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.content, "utf8");
      (exists ? overwritten : created).push(file.relativePath);
    }

    if (cmd.optsWithGlobals().json) {
      printJson(process.stdout, {
        artifact: INIT_REPORT_ARTIFACT,
        version: INIT_REPORT_VERSION,
        repositoryRoot: toPosixPath(repo),
        created,
        skipped,
        overwritten
      });
    } else {
      for (const path of created) process.stdout.write(`created     ${path}\n`);
      for (const path of overwritten) process.stdout.write(`overwritten ${path}\n`);
      for (const path of skipped) process.stdout.write(`exists      ${path}\n`);
      process.stdout.write(
        created.length === 0 && overwritten.length === 0
          ? `Nothing to do — .spectrace/ is already scaffolded (use --force to overwrite).\n`
          : `Scaffolded ${created.length + overwritten.length} file(s) in ${toPosixPath(repo)}.\n`
      );
    }
  });

/** Envelope for `validate --json`; versioned per SPEC-CLI-000 §3 AC1. */
const VALIDATION_REPORT_ARTIFACT = "spectrace.validation-report";
const VALIDATION_REPORT_VERSION = 1;

interface ReportedWarning {
  source: "config" | "schema";
  rule: string;
  message: string;
  key?: string;
  path?: string;
}

program
  .command("validate")
  .description("Validate specification documents against the requirement schema (REQ-CLI-002)")
  .option("--repo <path>", "repository root holding .spectrace/config.yaml", ".")
  .option("--json", "machine-readable output on stdout")
  .action((opts: { repo: string; json?: boolean }, cmd: Command) => {
    const repo = resolve(opts.repo);
    if (!existsSync(repo)) {
      fail({ error: "missing_repo", message: `${repo} does not exist.` }, 1);
      return;
    }

    // Specification paths come from configuration and nowhere else (AC1).
    const { config, warnings: configWarnings } = loadConfig(repo);
    const warnings: ReportedWarning[] = configWarnings.map((w) => ({
      source: "config",
      rule: w.rule,
      message: w.message,
      ...(w.key ? { key: w.key } : {})
    }));

    const documents: RequirementDocument[] = [];
    for (const specPath of config.specPaths) {
      const absolute = resolve(repo, specPath);
      if (!existsSync(absolute)) {
        warnings.push({
          source: "config",
          rule: "missing-spec-path",
          key: "specPaths",
          message: `Configured specification path \`${specPath}\` does not exist — nothing validated from it.`
        });
        continue;
      }
      // Re-root each document on its configured path so messages name a findable file.
      for (const document of readRequirementDocuments(absolute)) {
        documents.push({ path: `${specPath}/${document.path}`, content: document.content });
      }
    }

    const report = validateRequirements(documents);
    warnings.push(
      ...report.warnings.map((w) => ({
        source: "schema" as const,
        rule: w.rule,
        message: w.message,
        path: w.path
      }))
    );

    if (cmd.optsWithGlobals().json) {
      printJson(process.stdout, {
        artifact: VALIDATION_REPORT_ARTIFACT,
        version: VALIDATION_REPORT_VERSION,
        valid: report.valid,
        specPaths: config.specPaths,
        requirementCount: report.requirements.length,
        documentCount: documents.length,
        violations: report.violations,
        warnings
      });
    } else {
      for (const warning of warnings) process.stdout.write(`warning: ${warning.message}\n`);
      for (const violation of report.violations) {
        process.stdout.write(`  [${violation.rule}] ${violation.message}\n`);
      }
      const scope = config.specPaths.join(", ") || "(no specification paths configured)";
      process.stdout.write(
        report.valid
          ? `${report.requirements.length} requirement(s) in ${scope} — no violations\n`
          : `${report.violations.length} violation(s) across ${
              new Set(report.violations.map((v) => v.path)).size
            } file(s) in ${scope}\n`
      );
    }

    // Exit 3 on validation failure, 0 on a clean set (spec §3 exit codes).
    if (!report.valid) process.exitCode = 3;
  });

/**
 * True when `repo` has uncommitted changes — meaning its content no longer
 * matches the commit an index would record, so no stored index can be
 * assumed current. The index artifact itself is discounted: it is a build
 * output, and in a repository that has not gitignored it yet it would
 * otherwise report the repository dirty forever.
 */
function hasUncommittedChanges(repo: string, indexPath: string): boolean {
  let porcelain: string;
  try {
    // -uall lists untracked files individually; the default collapses them to
    // their directory, which would hide that the only untracked path is the
    // index artifact we are about to discount.
    porcelain = execFileSync("git", ["-C", repo, "status", "--porcelain", "-uall"], { encoding: "utf8" });
  } catch {
    // Not a git repository, or git is unavailable: never claim an index is current.
    return true;
  }
  const indexRelative = toPosixPath(relative(repo, indexPath));
  return porcelain
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .some((line) => line.slice(3).replace(/^"|"$/g, "") !== indexRelative);
}

program
  .command("index")
  .description("Build or update the local symbol index (REQ-CLI-003)")
  .option("--repo <path>", "repository root to index", ".")
  .option("--commit <sha>", "commit SHA recorded on every symbol (default: git rev-parse HEAD in --repo)")
  .option("--out <file>", "output path for the JSONL index (default: <repo>/.spectrace/index.jsonl)")
  .option(
    "--exclude <pattern>",
    "additional gitignore-style exclusion pattern (repeatable; added to config `exclude`)",
    (value, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option("--rebuild", "discard any existing index and rebuild from scratch", false)
  .option("--json", "machine-readable output on stdout")
  .action(
    (
      opts: { repo: string; commit?: string; out?: string; exclude: string[]; rebuild: boolean; json?: boolean },
      cmd: Command
    ) => {
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

      // Exclusions are configuration (REQ-CORE-011); --exclude adds to them.
      const { config } = loadConfig(repo);
      const excludePatterns = [...config.exclude, ...opts.exclude];
      const provenance: SymbolIndexProvenance = {
        repositoryCommit: commit,
        engineVersion: CORE_VERSION,
        excludePatterns
      };

      const outPath = resolve(opts.out ?? resolve(repo, ".spectrace", "index.jsonl"));

      // Update path: an index built from these same inputs, on a clean tree,
      // is already the index this run would produce. --rebuild skips the
      // check and rebuilds unconditionally (AC2). Per-file incremental
      // scoping is REQ-CORE-060, Phase F.
      let reused = false;
      let symbols: CodeSymbol[] | undefined;
      if (!opts.rebuild && existsSync(outPath) && !hasUncommittedChanges(repo, outPath)) {
        try {
          const stored = parseSymbolIndex(readFileSync(outPath, "utf8"));
          if (isIndexCurrent(stored.provenance, provenance)) {
            symbols = stored.symbols;
            reused = true;
          }
        } catch {
          // An unreadable or malformed index is simply rebuilt.
        }
      }

      if (symbols === undefined) {
        if (opts.rebuild && existsSync(outPath)) rmSync(outPath);
        try {
          ({ symbols } = indexRepository({
            repositoryRoot: repo,
            repositoryCommit: commit,
            ...(excludePatterns.length > 0 ? { additionalExcludePatterns: excludePatterns } : {})
          }));
        } catch (error) {
          if (error instanceof DuplicateSymbolIdIndexError) {
            fail({ error: "duplicate_symbol_id", duplicates: error.duplicates }, 1);
            return;
          }
          throw error;
        }
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, serializeSymbolIndex(symbols, provenance), "utf8");
      }

      // Null-prototype: `constructor` is a real symbol kind, and on a plain
      // object literal `countsByKind["constructor"] ?? 0` resolves to
      // Object.prototype.constructor rather than 0.
      const countsByKind: Record<string, number> = Object.create(null) as Record<string, number>;
      for (const s of symbols) countsByKind[s.kind] = (countsByKind[s.kind] ?? 0) + 1;

      if (cmd.optsWithGlobals().json) {
        printJson(process.stdout, {
          symbolCount: symbols.length,
          countsByKind: { ...countsByKind },
          repositoryCommit: commit,
          excludePatterns,
          reused,
          outputPath: toPosixPath(outPath)
        });
      } else {
        for (const [kind, count] of Object.entries(countsByKind).sort()) {
          process.stdout.write(`${kind.padEnd(12)} ${count}\n`);
        }
        process.stdout.write(`total        ${symbols.length}\n`);
        const shown = toPosixPath(outPath);
        process.stdout.write(reused ? `${shown} (up to date, not rebuilt)\n` : `${shown}\n`);
      }
    }
  );

program
  .command("analyze")
  .description(
    "Retrieve candidates per requirement (REQ-CLI-004 subset: lexical retrieval and the transmission bound; ranking lands in Phase D)"
  )
  .requiredOption("--requirements <dir>", "directory of requirement .md files (prelim spec §6.3 format)")
  .requiredOption("--index <file>", "JSONL symbol index produced by `spectrace index`")
  .option("--repo <path>", "repository root holding .spectrace/config.yaml, which supplies the defaults below", ".")
  .option("--top-k <n>", "candidates to retain per requirement (default: config retrieval.topK)")
  .option(
    "--req <id>",
    "restrict the run to this requirement (repeatable; absent, every requirement is analyzed)",
    (value, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option("--out <file>", "write results as a provenance-carrying JSONL artifact (REQ-CORE-071)")
  .option(
    "--transmission-log <file>",
    "write exactly what would be transmitted to a model, and audit it against the bound (REQ-CORE-023)"
  )
  .option("--dry-run", "report what would be transmitted; performs zero model or embedding calls", false)
  .option("--mode <mode>", "retrieval configuration: lexical (A), semantic (B), or hybrid (C) (default: config retrieval.mode)")
  .option(
    "--merge-strategy <id>",
    `hybrid merge strategy: ${MERGE_STRATEGY_IDS.join(" | ")} (default ${DEFAULT_MERGE_STRATEGY})`
  )
  .option("--rrf-k <n>", `rank damping for rrf-v1 (default ${DEFAULT_RRF_K})`)
  .option("--alpha <n>", `lexical share for weighted-v1, 0..1 (default ${DEFAULT_ALPHA})`)
  .option("--embedding-model <id>", `embedding model (default: config model.embedding, else ${DEFAULT_EMBEDDING_MODEL})`)
  .option("--embedding-dimensions <n>", "shorten embedding vectors to this width")
  .option(
    "--embedding-cache <file>",
    "reuse and update embedding vectors here, so a second run at the same commit calls no API (REQ-CORE-021)"
  )
  .option("--json", "machine-readable output on stdout")
  .action(
    async (
      opts: {
        requirements: string;
        index: string;
        repo: string;
        topK?: string;
        req: string[];
        out?: string;
        transmissionLog?: string;
        dryRun: boolean;
        mode?: string;
        mergeStrategy?: string;
        rrfK?: string;
        alpha?: string;
        embeddingModel?: string;
        embeddingDimensions?: string;
        embeddingCache?: string;
        json?: boolean;
      },
      cmd: Command
    ) => {
    const loaded = loadRequirements(resolve(opts.requirements));
    const errors = loaded.errors;
    if (errors.length > 0) {
      fail({ error: "invalid_requirements", errors }, 3);
      return;
    }

    // --req restricts the run; absent, every requirement is analyzed (AC1).
    let requirements = loaded.requirements;
    if (opts.req.length > 0) {
      const wanted = new Set(opts.req);
      const unknown = opts.req.filter((id) => !requirements.some((r) => r.id === id));
      if (unknown.length > 0) {
        fail({ error: "unknown_requirement", message: `No requirement document for: ${unknown.join(", ")}.` }, 2);
        return;
      }
      requirements = requirements.filter((r) => wanted.has(r.id));
    }

    let symbols: CodeSymbol[];
    try {
      symbols = readSymbols(resolve(opts.index));
    } catch (error) {
      const kind = error instanceof IndexArtifactFormatError ? "malformed_index" : "unreadable_index";
      fail({ error: kind, message: error instanceof Error ? error.message : String(error) }, 1);
      return;
    }
    const repositoryCommit = symbols[0]?.repositoryCommit;
    if (repositoryCommit === undefined) {
      fail({ error: "empty_index", message: "Index file has no symbols." }, 1);
      return;
    }

    // Configurations A, B, and C are selectable purely by configuration
    // (REQ-CORE-022 AC1); every flag below is an override, not the source.
    const { config } = loadConfig(resolve(opts.repo));

    const topK = opts.topK === undefined ? config.retrieval.topK : Number.parseInt(opts.topK, 10);
    if (!Number.isInteger(topK) || topK <= 0) {
      fail({ error: "invalid_top_k", message: `--top-k must be a positive integer; got ${opts.topK}.` }, 2);
      return;
    }

    const mode = opts.mode ?? config.retrieval.mode;
    if (mode !== "lexical" && mode !== "semantic" && mode !== "hybrid") {
      fail({ error: "invalid_mode", message: `Retrieval mode must be lexical, semantic, or hybrid; got ${mode}.` }, 2);
      return;
    }

    const mergeStrategy = (opts.mergeStrategy ?? DEFAULT_MERGE_STRATEGY) as MergeStrategyId;
    if (!MERGE_STRATEGY_IDS.includes(mergeStrategy)) {
      fail(
        {
          error: "invalid_merge_strategy",
          message: `--merge-strategy must be one of ${MERGE_STRATEGY_IDS.join(", ")}; got ${opts.mergeStrategy}.`
        },
        2
      );
      return;
    }

    const numericOption = (raw: string | undefined, flag: string, check: (n: number) => boolean) => {
      if (raw === undefined) return { ok: true as const, value: undefined };
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !check(parsed)) {
        fail({ error: "invalid_option", message: `${flag} got an unusable value: ${raw}.` }, 2);
        return { ok: false as const, value: undefined };
      }
      return { ok: true as const, value: parsed };
    };

    const rrfK = numericOption(opts.rrfK, "--rrf-k", (n) => n > 0);
    if (!rrfK.ok) return;
    const alpha = numericOption(opts.alpha, "--alpha", (n) => n >= 0 && n <= 1);
    if (!alpha.ok) return;

    const mergeConfig: MergeConfig = {
      strategy: mergeStrategy,
      ...(rrfK.value === undefined ? {} : { rrfK: rrfK.value }),
      ...(alpha.value === undefined ? {} : { alpha: alpha.value })
    };

    let dimensions: number | undefined;
    if (opts.embeddingDimensions !== undefined) {
      dimensions = Number.parseInt(opts.embeddingDimensions, 10);
      if (!Number.isInteger(dimensions) || dimensions <= 0) {
        fail(
          {
            error: "invalid_embedding_dimensions",
            message: `--embedding-dimensions must be a positive integer; got ${opts.embeddingDimensions}.`
          },
          2
        );
        return;
      }
    }

    const queries = requirements.map((r) => ({ requirementId: r.id, text: buildRequirementQueryText(r) }));

    // One dispatch, shared with `evaluate sweep`, so the numbers a sweep
    // reports always describe what this command does.
    const run = await runRetrieval({
      queries,
      symbols,
      repositoryCommit,
      mode,
      topK,
      merge: mergeConfig,
      embedding: {
        apiKey: process.env["OPENAI_API_KEY"],
        model: opts.embeddingModel ?? config.model.embedding ?? undefined,
        dimensions,
        cachePath: opts.embeddingCache ? resolve(opts.embeddingCache) : undefined
      }
    });
    if (!run.ok) {
      fail({ error: run.error, message: run.message }, run.exitCode);
      return;
    }

    const { results, configurationId } = run;
    const embeddingReport = run.embeddings
      ? {
          ...run.embeddings,
          ...(run.embeddings.cachePath ? { cachePath: toPosixPath(run.embeddings.cachePath) } : {})
        }
      : undefined;

    const provenance: RunProvenance = {
      repositoryCommit,
      configurationId,
      engineVersion: CORE_VERSION
    };

    let outPath: string | undefined;
    if (opts.out) {
      outPath = resolve(opts.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, serializeRetrievalResults(results, provenance), "utf8");
    }

    // What would leave this machine, and the proof that it is bounded
    // (REQ-CORE-023; NFR-CORE-005 "clients shall be able to reveal exactly
    // what would be or was sent"). Nothing below performs a model or
    // embedding call — there is no code path from here to one.
    let transmission: { log: TransmissionLog; audit: TransmissionAudit; path?: string } | undefined;
    if (opts.dryRun || opts.transmissionLog) {
      const log: TransmissionLog = {
        artifact: TRANSMISSION_LOG_ARTIFACT,
        version: TRANSMISSION_LOG_VERSION,
        topK,
        repositoryCommit,
        configurationId: provenance.configurationId,
        engineVersion: CORE_VERSION,
        units: buildTransmissionUnits({
          requirementTexts: new Map(requirements.map((r) => [r.id, buildRequirementQueryText(r)])),
          candidateSets: results,
          symbols,
          topK
        })
      };
      const audit = auditTransmissionLog({ log, candidateSets: results });
      transmission = { log, audit };
      if (opts.transmissionLog) {
        transmission.path = resolve(opts.transmissionLog);
        mkdirSync(dirname(transmission.path), { recursive: true });
        writeFileSync(transmission.path, serializeTransmissionLog(log), "utf8");
      }
    }

    if (cmd.optsWithGlobals().json) {
      printJson(process.stdout, {
        requirementCount: requirements.length,
        mode,
        topK,
        ...(mode === "hybrid" ? { merge: mergeConfig } : {}),
        ...provenance,
        ...(embeddingReport ? { embeddings: embeddingReport } : {}),
        ...(transmission
          ? {
              dryRun: opts.dryRun,
              modelCalls: 0,
              embeddingCalls: 0,
              transmission: {
                excerptCount: transmission.audit.excerptCount,
                permittedExcerptCount: transmission.audit.permittedExcerptCount,
                bounded: transmission.audit.bounded,
                violations: transmission.audit.violations,
                ...(transmission.path ? { logPath: toPosixPath(transmission.path) } : {})
              }
            }
          : {}),
        ...(outPath ? { outputPath: toPosixPath(outPath) } : { results })
      });
    } else {
      process.stdout.write(
        `retrieved top-${topK} candidates for ${requirements.length} requirement(s) ` +
          `(config ${provenance.configurationId}, commit ${repositoryCommit})\n`
      );
      if (embeddingReport) {
        process.stdout.write(
          `embedded ${embeddingReport.embedded} text(s), ${embeddingReport.cached} served from cache\n`
        );
        if (embeddingReport.cachePath) process.stdout.write(`${embeddingReport.cachePath}\n`);
      }
      if (transmission) {
        const { audit } = transmission;
        process.stdout.write(
          `would transmit ${audit.excerptCount} candidate excerpt(s) across ${audit.requirementCount} ` +
            `requirement(s); bound for this run is ${audit.permittedExcerptCount}. 0 model calls, 0 embedding calls.\n`
        );
        for (const violation of audit.violations) process.stdout.write(`  [${violation.rule}] ${violation.message}\n`);
        if (transmission.path) process.stdout.write(`${toPosixPath(transmission.path)}\n`);
      }
      if (outPath) {
        process.stdout.write(`${toPosixPath(outPath)}\n`);
      } else if (!transmission) {
        for (const set of results) {
          const top = set.candidates[0];
          process.stdout.write(`${set.requirementId}: ${top ? `${top.symbolId} (${top.score.toFixed(3)})` : "no candidates"}\n`);
        }
      }
    }

    // An unbounded payload is a validation failure, not a crash (exit 3).
    if (transmission && !transmission.audit.bounded) process.exitCode = 3;
  }
  );

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

/** Reads a metrics artifact written by `evaluate retrieval --out`. */
function readMetricsArtifact(filePath: string): MetricsArtifact {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as MetricsArtifact;
  if (parsed?.artifact !== "spectrace.retrieval-metrics" || typeof parsed.report !== "object") {
    throw new Error(`${filePath} is not a spectrace.retrieval-metrics artifact.`);
  }
  return parsed;
}

evaluate
  .command("compare")
  .description("Compare metrics artifacts across retrieval configurations, report-ready")
  .requiredOption(
    "--metrics <file>",
    "metrics artifact from `evaluate retrieval --out` (repeatable, one per configuration)",
    (value, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option(
    "--label <name>",
    "column heading for the corresponding --metrics, in order (default: the configuration ID)",
    (value, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option("--format <fmt>", `output format: ${COMPARISON_FORMATS.join(" | ")}`, "text")
  .option("--out <file>", "also write the comparison as a JSON artifact")
  .option("--json", "machine-readable output on stdout")
  .action(
    (
      opts: { metrics: string[]; label: string[]; format: string; out?: string; json?: boolean },
      cmd: Command
    ) => {
      if (!COMPARISON_FORMATS.includes(opts.format as ComparisonFormat)) {
        fail(
          { error: "invalid_format", message: `--format must be one of ${COMPARISON_FORMATS.join(", ")}.` },
          2
        );
        return;
      }
      if (opts.label.length > 0 && opts.label.length !== opts.metrics.length) {
        fail(
          {
            error: "label_mismatch",
            message: `Got ${opts.label.length} --label value(s) for ${opts.metrics.length} --metrics file(s); supply one each or none.`
          },
          2
        );
        return;
      }

      const runs: ConfigurationRun[] = [];
      for (const [i, file] of opts.metrics.entries()) {
        let artifact: MetricsArtifact;
        try {
          artifact = readMetricsArtifact(resolve(file));
        } catch (error) {
          fail(
            { error: "unreadable_metrics", message: error instanceof Error ? error.message : String(error) },
            1
          );
          return;
        }
        runs.push({
          configurationId: artifact.provenance?.configurationId ?? `unknown-${i + 1}`,
          ...(opts.label[i] ? { label: opts.label[i]! } : {}),
          report: artifact.report
        });
      }

      let comparison;
      try {
        comparison = compareMetricsReports(runs);
      } catch (error) {
        fail(
          { error: "incomparable", message: error instanceof Error ? error.message : String(error) },
          2
        );
        return;
      }

      if (opts.out) {
        const outPath = resolve(opts.out);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, serializeMetricsComparison(comparison), "utf8");
      }

      if (cmd.optsWithGlobals().json) {
        process.stdout.write(serializeMetricsComparison(comparison));
      } else {
        process.stdout.write(renderComparison(comparison, opts.format as ComparisonFormat));
      }
    }
  );

evaluate
  .command("sweep")
  .description("Run several retrieval configurations against one index and compare them (build plan Phase C)")
  .requiredOption("--requirements <dir>", "directory of requirement .md files")
  .requiredOption("--index <file>", "symbol index produced by `spectrace index`")
  .requiredOption("--ground-truth <file>", "hand-labeled ground-truth.json")
  .option("--repo <path>", "repository root holding .spectrace/config.yaml", ".")
  .option("--modes <list>", "comma-separated retrieval modes to run", "lexical,semantic,hybrid")
  .option("--top-k <n>", "candidates per requirement (default: config retrieval.topK)")
  .option("--k <list>", "comma-separated metric k values (default 1,3,5,10)")
  .option("--out-dir <dir>", "write per-configuration results and metrics artifacts here")
  .option("--format <fmt>", `comparison format: ${COMPARISON_FORMATS.join(" | ")}`, "text")
  .option("--embedding-model <id>", "embedding model (default: config model.embedding)")
  .option("--embedding-cache <file>", "shared embedding cache across configurations (REQ-CORE-021)")
  .option("--merge-strategy <id>", `hybrid merge strategy (default ${DEFAULT_MERGE_STRATEGY})`)
  .option("--json", "machine-readable output on stdout")
  .action(
    async (
      opts: {
        requirements: string;
        index: string;
        groundTruth: string;
        repo: string;
        modes: string;
        topK?: string;
        k?: string;
        outDir?: string;
        format: string;
        embeddingModel?: string;
        embeddingCache?: string;
        mergeStrategy?: string;
        json?: boolean;
      },
      cmd: Command
    ) => {
      if (!COMPARISON_FORMATS.includes(opts.format as ComparisonFormat)) {
        fail({ error: "invalid_format", message: `--format must be one of ${COMPARISON_FORMATS.join(", ")}.` }, 2);
        return;
      }

      const modes = opts.modes.split(",").map((m) => m.trim()).filter((m) => m.length > 0);
      const invalid = modes.filter((m) => m !== "lexical" && m !== "semantic" && m !== "hybrid");
      if (modes.length === 0 || invalid.length > 0) {
        fail(
          { error: "invalid_mode", message: `--modes must list lexical, semantic, or hybrid; got ${opts.modes}.` },
          2
        );
        return;
      }

      let ks: number[] | undefined;
      if (opts.k) {
        ks = opts.k.split(",").map((v) => Number.parseInt(v.trim(), 10));
        if (ks.some((k) => !Number.isInteger(k) || k <= 0)) {
          fail({ error: "invalid_k", message: `--k must be comma-separated positive integers; got ${opts.k}.` }, 2);
          return;
        }
      }

      const { requirements, errors } = loadRequirements(resolve(opts.requirements));
      if (errors.length > 0) {
        fail({ error: "invalid_requirements", errors }, 3);
        return;
      }

      let symbols: CodeSymbol[];
      try {
        symbols = readSymbols(resolve(opts.index));
      } catch (error) {
        const kind = error instanceof IndexArtifactFormatError ? "malformed_index" : "unreadable_index";
        fail({ error: kind, message: error instanceof Error ? error.message : String(error) }, 1);
        return;
      }
      const repositoryCommit = symbols[0]?.repositoryCommit;
      if (repositoryCommit === undefined) {
        fail({ error: "empty_index", message: "Index file has no symbols." }, 1);
        return;
      }

      // The ground-truth path is passed straight through to the metrics
      // computation; nothing in this command reads a label.
      let groundTruthRaw: unknown;
      try {
        groundTruthRaw = JSON.parse(readFileSync(resolve(opts.groundTruth), "utf8"));
      } catch (error) {
        fail(
          { error: "unreadable_ground_truth", message: error instanceof Error ? error.message : String(error) },
          1
        );
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

      const { config } = loadConfig(resolve(opts.repo));
      const topK = opts.topK === undefined ? config.retrieval.topK : Number.parseInt(opts.topK, 10);
      if (!Number.isInteger(topK) || topK <= 0) {
        fail({ error: "invalid_top_k", message: `--top-k must be a positive integer; got ${opts.topK}.` }, 2);
        return;
      }

      const queries = requirements.map((r) => ({ requirementId: r.id, text: buildRequirementQueryText(r) }));
      const evaluationRequirements = requirements.map((r) => ({ id: r.id, difficulty: r.difficulty }));
      const outDir = opts.outDir ? resolve(opts.outDir) : undefined;
      if (outDir) mkdirSync(outDir, { recursive: true });

      const runs: ConfigurationRun[] = [];
      const skipped: { mode: string; error: string; message: string }[] = [];
      let totalEmbedded = 0;

      // The cache is shared across configurations on purpose: B and C embed
      // the same symbols, so C costs nothing extra once B has run.
      const cachePath = opts.embeddingCache ? resolve(opts.embeddingCache) : undefined;

      for (const mode of modes as RetrievalMode[]) {
        const run = await runRetrieval({
          queries,
          symbols,
          repositoryCommit,
          mode,
          topK,
          ...(opts.mergeStrategy ? { merge: { strategy: opts.mergeStrategy as MergeStrategyId } } : {}),
          embedding: {
            apiKey: process.env["OPENAI_API_KEY"],
            model: opts.embeddingModel ?? config.model.embedding ?? undefined,
            cachePath
          }
        });

        if (!run.ok) {
          // One configuration failing must not discard the ones that worked;
          // the skip is reported rather than swallowed.
          skipped.push({ mode, error: run.error, message: run.message });
          continue;
        }
        totalEmbedded += run.embeddings?.embedded ?? 0;

        const report = evaluateRetrieval({
          results: run.results,
          groundTruth: groundTruthRaw as GroundTruthFile,
          requirements: evaluationRequirements,
          ...(ks ? { ks } : {})
        });

        const provenance: RunProvenance = {
          repositoryCommit,
          configurationId: run.configurationId,
          engineVersion: CORE_VERSION
        };

        if (outDir) {
          writeFileSync(
            resolve(outDir, `results-${mode}.jsonl`),
            serializeRetrievalResults(run.results, provenance),
            "utf8"
          );
          writeFileSync(
            resolve(outDir, `metrics-${mode}.json`),
            serializeMetricsReport(report, provenance),
            "utf8"
          );
        }

        runs.push({ configurationId: run.configurationId, label: mode, report });
      }

      if (runs.length === 0) {
        fail(
          {
            error: "no_configuration_ran",
            message: `Every requested configuration failed: ${skipped.map((s) => `${s.mode} (${s.message})`).join("; ")}`
          },
          1
        );
        return;
      }

      const comparison = compareMetricsReports(runs);
      if (outDir) {
        writeFileSync(resolve(outDir, "comparison.json"), serializeMetricsComparison(comparison), "utf8");
        writeFileSync(
          resolve(outDir, "comparison.md"),
          renderComparison(comparison, "markdown"),
          "utf8"
        );
        writeFileSync(resolve(outDir, "comparison.csv"), renderComparison(comparison, "csv"), "utf8");
      }

      if (cmd.optsWithGlobals().json) {
        printJson(process.stdout, {
          ran: runs.map((r) => r.label),
          skipped,
          embeddedTexts: totalEmbedded,
          ...(outDir ? { outputDirectory: toPosixPath(outDir) } : {}),
          comparison
        });
      } else {
        process.stdout.write(renderComparison(comparison, opts.format as ComparisonFormat));
        for (const skip of skipped) {
          process.stdout.write(`skipped ${skip.mode}: ${skip.message}\n`);
        }
        if (outDir) process.stdout.write(`${toPosixPath(outDir)}\n`);
      }

      // A partial sweep succeeded at what it could; say so with exit 0 only
      // when nothing was skipped.
      if (skipped.length > 0) process.exitCode = 1;
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
