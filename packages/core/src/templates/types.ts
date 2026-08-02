/**
 * Specification templates (REQ-CORE-003).
 *
 * Templates are embedded as strings rather than shipped as `.md` files
 * because `tsc` emits only JavaScript — a Markdown file under `src/` would
 * never reach `dist/`, so a file-based template would work from source and
 * break once installed.
 */

export type TemplateKind =
  | "use-case"
  | "functional"
  | "non-functional"
  | "architecturally-significant"
  | "acceptance-criteria";

export const TEMPLATE_KINDS = [
  "use-case",
  "functional",
  "non-functional",
  "architecturally-significant",
  "acceptance-criteria"
] as const;

export interface TemplateDefinition {
  kind: TemplateKind;
  /** Human-readable name, for `spectrace init` output and Studio's template picker. */
  label: string;
  /** Default ID family for this kind; callers may override per vault. */
  idPrefix: string;
  /** File name used when the template is written to a templates directory. */
  fileName: string;
}

export const TEMPLATES: readonly TemplateDefinition[] = [
  { kind: "use-case", label: "Use case", idPrefix: "REQ-UC", fileName: "use-case.md" },
  { kind: "functional", label: "Functional requirement", idPrefix: "REQ-FN", fileName: "functional.md" },
  {
    kind: "non-functional",
    label: "Non-functional requirement",
    idPrefix: "REQ-NFR",
    fileName: "non-functional.md"
  },
  {
    kind: "architecturally-significant",
    label: "Architecturally significant requirement",
    idPrefix: "REQ-ASR",
    fileName: "architecturally-significant.md"
  },
  {
    kind: "acceptance-criteria",
    label: "Acceptance criteria",
    idPrefix: "REQ-AC",
    fileName: "acceptance-criteria.md"
  }
];
