/**
 * Ground-truth link types (REQ-CORE-070; prelim spec §7.3).
 *
 * Types only: reading, writing, and hand-labeling ground-truth files are
 * caller concerns. Core never judges whether a link is correct — that is a
 * human labeling decision (prelim spec §7.1); these shapes exist so the
 * evaluation stage (retrieval-metrics.ts) can score retrieval output
 * against links a human already made.
 */

export type LabelPass = "independent" | "candidate_review";
export const ALLOWED_LABEL_PASSES: readonly LabelPass[] = ["independent", "candidate_review"];

export type LinkRelationship = "implements" | "supports";
export type LinkConfidence = "confirmed" | "uncertain";

export interface GroundTruthLink {
  requirementId: string;
  symbolId: string;
  labelPass: LabelPass;
  relationship: LinkRelationship;
  confidence: LinkConfidence;
  rationale: string;
}

export interface GroundTruthFile {
  repositoryCommit: string;
  createdAt: string;
  labeler: string;
  links: GroundTruthLink[];
}
