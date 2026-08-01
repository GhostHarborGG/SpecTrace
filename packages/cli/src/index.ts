#!/usr/bin/env node
/**
 * @spectrace/cli — command surface (REQ-CLI-001..008).
 * Phase A: skeleton with global conventions only.
 * Exit codes (spec §10): 0 ok, 1 operational, 2 usage, 3 validation.
 */
import { Command } from "commander";

const program = new Command();

program
  .name("spectrace")
  .description("Requirements traceability for Markdown specs and TypeScript code")
  .version("0.1.0")
  .option("--json", "machine-readable output on stdout");

const stub = (req: string, phase: string) => () => {
  process.stderr.write(`Not implemented yet — ${req} lands in ${phase}.\n`);
  process.exitCode = 1;
};

program.command("init").description("Scaffold .spectrace/ config and templates").action(stub("REQ-CLI-001", "Phase B"));
program.command("validate").description("Validate specification documents").action(stub("REQ-CLI-002", "Phase B"));
program.command("index").description("Build or update the symbol index").action(stub("REQ-CLI-003", "Phase C"));
program.command("analyze").description("Retrieve candidates and rank proposals").action(stub("REQ-CLI-004", "Phase D"));
program.command("review").description("Review queued proposals").action(stub("REQ-CLI-005", "Phase D"));
program.command("links").description("Bidirectional trace-link queries").action(stub("REQ-CLI-006", "Phase D/E"));
program.command("coverage").description("Coverage summary").action(stub("REQ-CLI-007", "Phase D/E"));
program.command("drift").description("Git-aware drift analysis").action(stub("REQ-CLI-008", "Phase F"));

program.parseAsync().catch((err) => {
  process.stderr.write(String(err?.message ?? err) + "\n");
  process.exitCode = 1;
});
