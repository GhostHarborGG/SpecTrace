/**
 * Renders specification templates into schema-valid requirement documents
 * (REQ-CORE-003). Every template instantiates with a generated unique ID and
 * passes validation unedited (AC1) — the placeholder acceptance criteria are
 * real entries, so a freshly created document is valid from the first save
 * and the author replaces prose rather than fighting a validation error.
 */
import type { RequirementDocument } from "../schema/parse.js";
import { TEMPLATES, type TemplateKind } from "./types.js";

/** Angle-bracket placeholders are plain YAML scalars, so frontmatter stays parseable. */
const BODIES: Record<TemplateKind, (id: string) => string> = {
  "use-case": (id) => `---
id: ${id}
title: <short imperative name of the goal>
status: proposed
priority: P1
links: []
acceptance_criteria:
  - <observable outcome proving the main success scenario completed>
---

# <short imperative name of the goal>

## Statement

As a <actor>, I want to <goal> so that <benefit>.

## Main success scenario

1. <actor does something>
2. <system responds>
3. <outcome the actor can observe>

## Alternate and exception flows

- <condition> - <what happens instead>

## Rationale

<why this use case exists, and who is affected if it does not>
`,

  functional: (id) => `---
id: ${id}
title: <short name of the behavior>
status: proposed
priority: P0
links: []
acceptance_criteria:
  - <a check that is unambiguously true or false against a running system>
---

# <short name of the behavior>

## Statement

Given <precondition>, the system shall <observable behavior>.

## Rationale

<why this behavior is required; trace it to a source document or stakeholder>

## Notes

<constraints, open questions, related requirement IDs>
`,

  "non-functional": (id) => `---
id: ${id}
title: <short name of the quality attribute>
status: proposed
priority: P1
links: []
acceptance_criteria:
  - <a measurable threshold, with units and the conditions it is measured under>
---

# <short name of the quality attribute>

## Statement

Under <stated conditions>, the system shall <quality attribute> within
<measurable threshold>.

## Measurement

<how this is measured, with what tool, on what baseline hardware>

## Rationale

<why this threshold and not a looser one; what breaks if it is missed>
`,

  "architecturally-significant": (id) => `---
id: ${id}
title: <short name of the architectural constraint>
status: proposed
priority: P0
links: []
acceptance_criteria:
  - <an observable property of the architecture that reversing this decision would violate>
---

# <short name of the architectural constraint>

## Statement

The architecture shall <constraint>, because <driver>.

## Architectural impact

<what this decision forecloses, what it enables, and what it costs>

## Alternatives considered

- <alternative> - <why it was rejected>

## Rationale

<the quality attribute or external constraint forcing this decision>
`,

  "acceptance-criteria": (id) => `---
id: ${id}
title: <short name of the behavior being verified>
status: proposed
priority: P1
links: []
acceptance_criteria:
  - <given a precondition, when an action occurs, then an observable outcome holds>
  - <one criterion per entry, each independently checkable>
---

# <short name of the behavior being verified>

## Statement

<the behavior these criteria verify, stated once so the criteria have a subject>

## Verification

<how each criterion is checked - test, inspection, demonstration, or analysis>

## Rationale

<why these criteria are sufficient evidence that the behavior holds>
`
};

/**
 * Next free ID in a family, given the IDs already in the vault. Numbering is
 * zero-padded to at least three digits, widening if the vault already uses
 * wider numbers, so `REQ-FN-009` is followed by `REQ-FN-010`.
 */
export function nextRequirementId(prefix: string, existingIds: readonly string[] = []): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let highest = 0;
  let width = 3;
  for (const id of existingIds) {
    const digits = pattern.exec(id)?.[1];
    if (!digits) continue;
    highest = Math.max(highest, Number.parseInt(digits, 10));
    width = Math.max(width, digits.length);
  }
  return `${prefix}-${String(highest + 1).padStart(width, "0")}`;
}

export interface InstantiateOptions {
  kind: TemplateKind;
  /** IDs already present in the vault, so the generated one does not collide. */
  existingIds?: readonly string[];
  /** Override the template's default ID family. */
  idPrefix?: string;
  /** Use this exact ID instead of generating one. */
  id?: string;
}

/**
 * Renders a template into a requirement document ready to write. `path` is the
 * file name only — the caller decides which vault directory it lands in.
 */
export function instantiateTemplate(options: InstantiateOptions): RequirementDocument {
  const definition = TEMPLATES.find((t) => t.kind === options.kind);
  if (!definition) throw new Error(`Unknown template kind "${options.kind}".`);

  const id = options.id ?? nextRequirementId(options.idPrefix ?? definition.idPrefix, options.existingIds ?? []);
  return { path: `${id}.md`, content: BODIES[options.kind](id) };
}

/** Renders every template at once, with IDs that do not collide with each other. */
export function instantiateAllTemplates(existingIds: readonly string[] = []): RequirementDocument[] {
  const taken = [...existingIds];
  return TEMPLATES.map((definition) => {
    const document = instantiateTemplate({ kind: definition.kind, existingIds: taken });
    taken.push(document.path.replace(/\.md$/, ""));
    return document;
  });
}
