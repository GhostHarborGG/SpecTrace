---
id: REQ-APP-015
title: Link a local repository directory
spec: SPEC-APP-000
status: implemented
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - With a repository linked, analysis indexes the repository's source while the vault supplies the requirements, and run provenance records the repository's commit.
  - Analysis and review write nothing inside the linked repository; every artifact lands under the vault's `.spectrace/`.
  - With no repository linked, the vault directory serves as the repository and output is byte-identical to a single-root run.
  - A vault's repository link is restored when the vault is reopened on the same machine, and can be removed.
---

# Link a local repository directory

## Statement

The application shall let the user link a local directory as the repository
for the open vault, so that the vault supplies the requirements and the
linked directory supplies the code, with both paths visible in the UI while
the link exists.

## Rationale

A spec vault that knows about a codebase is the product's differentiator
(SPEC-APP-000 §4.2), and a directory already on disk is the shortest path to
it. GitHub connection (REQ-APP-010/011) layers a remote source and a
SHA-keyed cache on top of this; the vault/repository split, the read-only
posture toward the code, and the artifact home in the vault are decided
here and inherited there.

## Notes

Studio previously conflated one `root` as vault, code, artifact home, config
home, and provenance source at once — invisible while dogfooding, where
`specs/` lives inside the repository it describes. The CLI never had the
conflation: it runs against a code root and `specPaths` points at the specs.

Decisions (BP, 2026-08-11, usability over semantics): artifacts and
configuration live with the vault, so the linked repository is read-only by
construction and the GitHub cache can inherit the same rule; the pairing is
remembered per machine in Electron `userData`, because an absolute local
path does not belong in a committed file.

AC3 is what keeps the dogfood path honest: a vault with no linked
repository takes exactly the code path it always did, so every single-root
test and the CLI parity suite constrain this feature too.

AC1–AC3 are covered in `apps/studio/test/run-analysis.test.ts` and AC4 in
`apps/studio/test/workspace.test.ts`. The pairing store is
`workspaces.json` under Electron `userData`, written by
`apps/studio/src/main/workspace.ts`; the UI's link/unlink control lives in
the titlebar beside the vault path.
