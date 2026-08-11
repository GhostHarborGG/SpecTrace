/**
 * Stale link resolution (REQ-CORE-052) — SPEC-CORE-000 §8.
 *
 * A link whose symbol no longer resolves is reported as broken and **never
 * silently dropped**. That is the whole requirement, and the reason is that
 * the two events look identical in a link count but mean opposite things: a
 * link that vanishes reads as "this requirement was never traced", while a
 * link that is flagged reads as "this requirement was traced and the code
 * moved". Only the second is true, and only the second tells a reviewer there
 * is something to do.
 *
 * Dropping is also the failure mode a tool falls into by accident — rebuild
 * the index from the symbols that currently exist and broken links disappear
 * without anyone deciding they should. So resolution is computed *against* the
 * index rather than used to filter it: {@link resolveLinks} returns a verdict
 * for every stored link and removes none.
 *
 * Broken links feed D1/D2 drift classification (REQ-CORE-061, Phase F); this
 * module is the detection half and takes no view on what a client does about
 * it.
 */

import { symbolIdPath } from "../indexer/symbol-id.js";
import type { LinkIndex, StoredLink } from "./link-index.js";

export interface LinkResolution {
  requirementId: string;
  symbolId: string;
  /** Whether the symbol exists in the index built at `checkedCommit`. */
  resolved: boolean;
  /**
   * The most recent commit at which this link is known to have resolved
   * (REQ-CORE-052 AC1).
   *
   * Seeded from the commit the decision was made at, since a reviewer
   * accepting a link is direct evidence the symbol existed then, and advanced
   * every time the link is seen to resolve at a later commit. It is a
   * *last-known-good* marker, not a guarantee the symbol survived every commit
   * in between — nothing here walks history.
   */
  lastResolvedCommit: string;
  /** Commit this resolution was computed at. */
  checkedCommit: string;
}

export interface ResolutionReport {
  resolutions: LinkResolution[];
  /** Links whose symbol no longer resolves. A subset of `resolutions`, for convenience. */
  broken: LinkResolution[];
  /** Symbol IDs that no longer resolve, for {@link coverageSummary}. */
  brokenSymbolIds: Set<string>;
  checkedCommit: string;
}

export interface ResolveLinksOptions {
  index: LinkIndex;
  /** Symbol IDs present in the index at the current commit (REQ-CORE-012). */
  knownSymbolIds: ReadonlySet<string>;
  repositoryCommit: string;
  /**
   * The previous run's resolutions, so `lastResolvedCommit` can advance rather
   * than resetting to the decision commit on every check. Omitted, each link
   * starts from its own decision commit.
   */
  previous?: readonly LinkResolution[];
}

function linkKey(link: Pick<StoredLink, "requirementId" | "symbolId">): string {
  return `${link.requirementId} ${link.symbolId}`;
}

/**
 * Resolves every stored link against the symbols that currently exist
 * (REQ-CORE-052).
 *
 * Returns one verdict per link in the index — the same count, in the same
 * order, whether or not anything broke. A caller that wants only the failures
 * reads `broken`; a caller that renders the whole set reads `resolutions`.
 * Neither is given a way to end up with a shorter link list than it started
 * with.
 */
export function resolveLinks(options: ResolveLinksOptions): ResolutionReport {
  const { index, knownSymbolIds, repositoryCommit } = options;
  const previousByKey = new Map((options.previous ?? []).map((entry) => [linkKey(entry), entry]));

  const resolutions = index.links.map((link) => {
    const resolved = knownSymbolIds.has(link.symbolId);
    const previous = previousByKey.get(linkKey(link));
    // Seed from the decision commit, carry forward anything better already
    // known, and advance to now only on an actual successful resolution.
    const lastResolvedCommit = resolved
      ? repositoryCommit
      : previous?.lastResolvedCommit ?? link.commit;

    return {
      requirementId: link.requirementId,
      symbolId: link.symbolId,
      resolved,
      lastResolvedCommit,
      checkedCommit: repositoryCommit
    };
  });

  const broken = resolutions.filter((entry) => !entry.resolved);

  return {
    resolutions,
    broken,
    brokenSymbolIds: new Set(broken.map((entry) => entry.symbolId)),
    checkedCommit: repositoryCommit
  };
}

/**
 * Why a proposal's symbol is no longer in the index.
 *
 * The two are worth separating because they call for opposite responses. An
 * `excluded` symbol still exists in the working tree — configuration decided
 * it is not worth indexing, so the proposal is not evidence of anything wrong
 * with the code, and widening the exclusion back would bring it straight back.
 * A `missing` symbol was not excluded and is simply not there: the code was
 * deleted, renamed, or moved, which is a fact about the repository and feeds
 * D1/D2 drift classification (REQ-CORE-061, Phase F).
 *
 * Collapsing them into one "stale" verdict would put a configuration change
 * and a code change in the same bucket, and a reviewer triaging a queue needs
 * to tell those apart before deciding anything.
 */
export type ProposalStaleReason = "excluded" | "missing";

/** One proposal's verdict. `reason` is present exactly when `stale` is true. */
export interface ProposalStaleness {
  requirementId: string;
  symbolId: string;
  stale: boolean;
  reason?: ProposalStaleReason;
  /**
   * Repository-relative POSIX path parsed from the symbol ID, or `null` when
   * the ID does not parse. A `null` path cannot be tested against exclusion
   * patterns, so such a proposal can only ever be `missing`, never `excluded`.
   */
  path: string | null;
}

export interface ProposalStalenessReport {
  /** One verdict per input proposal, in input order. Never shorter than the input. */
  entries: ProposalStaleness[];
  /** The stale subset, for convenience. */
  stale: ProposalStaleness[];
  /** Stale symbol IDs, deduplicated. */
  staleSymbolIds: Set<string>;
  checkedCommit: string;
}

/** The identity fields {@link resolveProposals} needs — a `Proposal` satisfies this. */
export interface ProposalReference {
  requirementId: string;
  symbolId: string;
}

export interface ResolveProposalsOptions {
  proposals: readonly ProposalReference[];
  /** Symbol IDs present in the index rebuilt at `repositoryCommit` (REQ-CORE-012). */
  knownSymbolIds: ReadonlySet<string>;
  /**
   * Whether a repository-relative POSIX path is excluded under the *current*
   * configuration (REQ-CORE-011). Supplied, absent symbols whose path is
   * excluded are reported as `excluded` rather than `missing`.
   *
   * Omitted, every absent symbol is reported as `missing`. That is the honest
   * answer rather than a safe default: without the patterns there is no way to
   * know an exclusion is what removed the symbol, and guessing `excluded`
   * would suppress real deletions.
   */
  isExcludedPath?: (path: string) => boolean;
  repositoryCommit: string;
}

/**
 * Flags proposals whose symbol is no longer in the index (REQ-CORE-011 AC2).
 *
 * Proposals outlive the index they were generated against: `analyze` writes an
 * artifact, configuration changes, `index --rebuild` runs, and only then does
 * `review` open the queue. A proposal pointing at a symbol that an exclusion
 * pattern has since removed is not reviewable — accepting it would store a
 * link that is broken the moment it is written.
 *
 * Like {@link resolveLinks}, this returns a verdict for every proposal and
 * removes none, for the same reason: a stale proposal that quietly disappears
 * from the queue is indistinguishable from one that was never generated, and
 * the reviewer is the one who should decide what to do about it. `entries` is
 * always the same length as `proposals`, in the same order.
 */
export function resolveProposals(options: ResolveProposalsOptions): ProposalStalenessReport {
  const { proposals, knownSymbolIds, isExcludedPath, repositoryCommit } = options;

  const entries = proposals.map((proposal): ProposalStaleness => {
    const path = symbolIdPath(proposal.symbolId);

    if (knownSymbolIds.has(proposal.symbolId)) {
      // The index is the authority on what exists. A symbol the indexer
      // emitted is present whatever the patterns say about its path, and
      // reporting it stale here would contradict the artifact a caller can
      // read for itself.
      return { requirementId: proposal.requirementId, symbolId: proposal.symbolId, stale: false, path };
    }

    const excluded = path !== null && isExcludedPath !== undefined && isExcludedPath(path);
    return {
      requirementId: proposal.requirementId,
      symbolId: proposal.symbolId,
      stale: true,
      reason: excluded ? "excluded" : "missing",
      path
    };
  });

  const stale = entries.filter((entry) => entry.stale);

  return {
    entries,
    stale,
    staleSymbolIds: new Set(stale.map((entry) => entry.symbolId)),
    checkedCommit: repositoryCommit
  };
}
