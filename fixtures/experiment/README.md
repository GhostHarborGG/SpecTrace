# Experiment requirements — authoring reference

Target repository: unjs/hookable v6.1.1 (frozen; see `../repository.yaml`).
Authored solo by the researcher from public documentation only
(specs/spectrace-prelim-spec.md §6.1). One requirement per `.md` file.

## Strata (§6.2) — exactly four files each

| `difficulty` value | Meaning |
|---|---|
| `high-overlap` | Wording directly uses source identifiers (e.g. names `callHook`). |
| `partial-overlap` | Some shared terms, but no exact API names. |
| `domain-vocabulary` | Domain language mostly absent from identifiers. |

The loader rejects any other value. Validate with:

```bash
pnpm prelim requirements validate --dir fixtures/experiment/requirements
```

## File format (§6.3)

```markdown
---
id: HOOK-001
title: Named hook registration
status: proposed
priority: high
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Calling a hook invokes every callback registered under the same name.
  - All supplied arguments reach each callback unchanged.
---

# Named hook registration

## Statement

The library shall allow a callback to be registered under a non-empty hook
name...

## Rationale

Why this behavior matters.

## Notes

Written from documented behavior before implementation inspection.
```

`id`, `title`, a `## Statement` section, at least one acceptance criterion,
and a valid `difficulty` are mandatory (§6.4).

## After authoring

1. Validate (command above).
2. Freeze and hash the set (§6.1 step 5) before inspecting the
   implementation for ground-truth labeling; labels go in
   `fixtures/ground-truth/` (never in Claude sessions).
