/**
 * Proposal review for the main process (REQ-APP-013, REQ-CORE-040…052).
 *
 * Every judgement is core's: `bandFor` decides what reaches the queue,
 * `recordDecision` and `deriveLinkState` are the only path from a proposal to
 * a stored link (REQ-CORE-040 AC1), `resolveProposals` flags proposals whose
 * symbol an exclusion removed (REQ-CORE-011 AC2), and `buildLinkIndex`
 * regenerates the index from frontmatter alone. Studio decides *when* to
 * write and *where*, which is what core deliberately does not own.
 *
 * ## The write ordering is load-bearing
 *
 * Decision trail, then frontmatter, then index — the same order
 * `packages/cli/src/vault.ts` uses, for the reason documented there.
 * Frontmatter is the source of truth, so a crash between steps leaves a stale
 * index that a rebuild repairs; the reverse order could leave an index
 * asserting a link no document records, with nothing authoritative to rebuild
 * from.
 *
 * **This module and the CLI's `vault.ts` are now two implementations of that
 * write.** The semantics are shared (every function named above is core's) but
 * the filesystem half is not, because core writes no files by design. It is
 * the next extraction candidate if the two drift; flagged in the REQ-APP-013
 * note rather than left to be discovered.
 *
 * Electron-free like its siblings, so it tests in plain Node.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import {
  ExclusionMatcher,
  LINK_INDEX_RELATIVE_PATH,
  appendDecision,
  bandFor,
  buildLinkIndex,
  deriveLinkState,
  emptyDecisionLog,
  loadConfig,
  parseSymbolIndex,
  proposalKey,
  recordDecision,
  recordedBands,
  resolveProposals,
  reviewStatistics,
  serializeDecisionLog,
  serializeLinkIndex,
  toPosixPath,
  toTraceLinkRecords,
  type DecisionLog,
  type Proposal
} from "@spectrace/core";
import { headCommit, readVaultLinkState } from "./coverage.js";
import type { DecisionRequest, QueueEntry, QueueSnapshot, ReviewOutcome } from "../shared/ipc.js";

/** Default locations, matching the CLI's so both clients read the same files. */
export function reviewPaths(root: string): { proposals: string; decisions: string; symbolIndex: string } {
  const dir = join(resolve(root), ".spectrace");
  return {
    proposals: join(dir, "proposals.json"),
    decisions: join(dir, "decisions.json"),
    symbolIndex: join(dir, "index.jsonl")
  };
}

function readDecisionLog(path: string): DecisionLog {
  if (!existsSync(path)) return emptyDecisionLog();
  return JSON.parse(readFileSync(path, "utf8")) as DecisionLog;
}

/**
 * Builds the review queue (REQ-APP-013 AC1, REQ-CORE-041).
 *
 * `discard` is withheld by design — putting it in front of a reviewer would
 * undo the triage the bands exist to provide — and already-decided proposals
 * are dropped so a second pass shows only what is left. Both rules are the
 * CLI's, restated here because they are queue policy rather than storage.
 *
 * Stale proposals are flagged, never removed (REQ-CORE-011 AC2): one that
 * quietly vanished would be indistinguishable from one never generated.
 */
export function reviewQueue(root: string, repositoryRoot?: string): QueueSnapshot {
  const resolvedRoot = resolve(root);
  // Exclusions and the commit stamp describe the code, so with a linked
  // repository (REQ-APP-015) both point there; the artifacts stay the vault's.
  const codeRoot = resolve(repositoryRoot ?? root);
  const paths = reviewPaths(resolvedRoot);
  const { config } = loadConfig(resolvedRoot);

  if (!existsSync(paths.proposals)) {
    return { entries: [], total: 0, decided: 0, withheld: 0, stalenessUnchecked: null, proposalsPath: null };
  }

  const artifact = JSON.parse(readFileSync(paths.proposals, "utf8")) as { proposals?: Proposal[] };
  const proposals = Array.isArray(artifact.proposals) ? artifact.proposals : [];

  // Staleness, exactly as `spectrace review` computes it.
  const staleReasons = new Map<string, "excluded" | "missing">();
  let staleKeys = new Set<string>();
  let stalenessUnchecked: string | null = null;
  if (existsSync(paths.symbolIndex)) {
    const symbols = parseSymbolIndex(readFileSync(paths.symbolIndex, "utf8")).symbols;
    const matcher = new ExclusionMatcher({
      repositoryRoot: codeRoot,
      additionalPatterns: config.exclude
    });
    const report = resolveProposals({
      proposals,
      knownSymbolIds: new Set(symbols.map((symbol) => symbol.symbolId)),
      isExcludedPath: (path) => matcher.isExcludedPath(path),
      repositoryCommit: headCommit(codeRoot)
    });
    staleKeys = new Set(report.stale.map((entry) => proposalKey(entry.requirementId, entry.symbolId)));
    for (const entry of report.stale) {
      staleReasons.set(proposalKey(entry.requirementId, entry.symbolId), entry.reason!);
    }
  } else {
    stalenessUnchecked = `no symbol index at ${toPosixPath(paths.symbolIndex)}`;
  }

  const decided = recordedBands(readDecisionLog(paths.decisions));
  const entries: QueueEntry[] = [];
  let withheld = 0;

  for (const proposal of proposals) {
    const band = bandFor(proposal.confidence, proposal.classification, config.bands);
    if (band === "discard") {
      withheld += 1;
      continue;
    }
    const key = proposalKey(proposal.requirementId, proposal.symbolId);
    if (decided.has(key)) continue;

    entries.push({
      proposal,
      band,
      stale: staleKeys.has(key),
      ...(staleKeys.has(key) ? { staleReason: staleReasons.get(key)! } : {})
    });
  }

  // `suggest` before `review`, so the strongest claims are triaged first.
  entries.sort((a, b) => (a.band === b.band ? 0 : a.band === "suggest" ? -1 : 1));

  return {
    entries,
    total: proposals.length,
    decided: decided.size,
    withheld,
    stalenessUnchecked,
    proposalsPath: toPosixPath(paths.proposals)
  };
}

/**
 * Applies a batch of decisions (REQ-APP-013 AC2, REQ-CORE-040).
 *
 * A `skip` is recorded as skipped rather than as a verdict: declining to
 * decide is not a decision, and writing it as one would put a judgement in the
 * audit trail that nobody made.
 */
export function applyDecisions(request: DecisionRequest): ReviewOutcome {
  const root = resolve(request.root);
  const paths = reviewPaths(root);
  const { config } = loadConfig(root);
  // Decisions are made about code at a commit — the linked repository's HEAD
  // when one exists (REQ-APP-015 AC1).
  const repositoryCommit = headCommit(resolve(request.repositoryRoot ?? request.root));

  const artifact = JSON.parse(readFileSync(paths.proposals, "utf8")) as { proposals?: Proposal[] };
  const byKey = new Map(
    (artifact.proposals ?? []).map((p) => [proposalKey(p.requirementId, p.symbolId), p])
  );

  let log = readDecisionLog(paths.decisions);
  const applied: string[] = [];
  const skipped: Array<{ requirementId: string; symbolId: string; reason: string }> = [];

  for (const entry of request.decisions) {
    const key = proposalKey(entry.requirementId, entry.symbolId);
    const proposal = byKey.get(key);
    if (proposal === undefined) {
      skipped.push({ ...entry, reason: "no matching proposal in the artifact" });
      continue;
    }
    if (entry.kind === "skip") {
      skipped.push({ ...entry, reason: "skipped by the reviewer" });
      continue;
    }
    log = appendDecision(
      log,
      recordDecision(proposal, bandFor(proposal.confidence, proposal.classification, config.bands), {
        kind: entry.kind,
        reviewer: request.reviewer,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        repositoryCommit,
        ...(entry.redirectTo ? { redirectTo: { symbolId: entry.redirectTo } } : {})
      })
    );
    applied.push(key);
  }

  // 1. The audit trail, first — it is the record that the rest is derived from.
  mkdirSync(dirname(paths.decisions), { recursive: true });
  writeFileSync(paths.decisions, serializeDecisionLog(log), "utf8");

  // 2. Frontmatter, the source of truth (REQ-CORE-050).
  const links = deriveLinkState(log);
  const byRequirement = new Map<string, typeof links>();
  for (const link of links) {
    const bucket = byRequirement.get(link.requirementId);
    if (bucket === undefined) byRequirement.set(link.requirementId, [link]);
    else bucket.push(link);
  }

  const { requirements } = readVaultLinkState({
    root,
    ...(request.repositoryRoot === undefined ? {} : { repositoryRoot: request.repositoryRoot })
  });
  const updatedDocuments: string[] = [];
  for (const requirement of requirements) {
    const filePath = resolve(root, requirement.path);
    if (!existsSync(filePath)) continue;

    const records = toTraceLinkRecords(byRequirement.get(requirement.id) ?? []);
    if (JSON.stringify(records) === JSON.stringify(requirement.traceLinks)) continue;

    const raw = readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    // gray-matter round-trips the body verbatim; only `links` is replaced, so
    // every other key — including vault-specific ones like `spec` — survives.
    writeFileSync(filePath, matter.stringify(parsed.content, { ...parsed.data, links: records }), "utf8");
    updatedDocuments.push(toPosixPath(filePath));
  }

  // 3. The index, last, built from what is now on disk.
  const index = buildLinkIndex(
    requirements.map((requirement) => ({
      id: requirement.id,
      traceLinks: toTraceLinkRecords(byRequirement.get(requirement.id) ?? [])
    })),
    repositoryCommit
  );
  const indexPath = resolve(root, LINK_INDEX_RELATIVE_PATH);
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, serializeLinkIndex(index), "utf8");

  return {
    applied: applied.length,
    skipped,
    links: links.length,
    statistics: reviewStatistics(log),
    updatedDocuments,
    decisionsPath: toPosixPath(paths.decisions),
    indexPath: toPosixPath(indexPath)
  };
}
