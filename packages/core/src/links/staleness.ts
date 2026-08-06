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
