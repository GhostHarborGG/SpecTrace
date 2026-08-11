# Security Policy

## Supported versions

SpecTrace is **pre-1.0 and under active development**. Only the current `main`
branch receives fixes; there are no maintained release branches and no backports
until `v1.0.0`.

| Version | Supported |
|---|---|
| `main` | ✅ |
| Anything tagged before `v1.0.0` | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security report.**

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or email **parker@ghostharbor.gg**.

Include what you'd want to receive: affected version or commit, what an attacker
gains, and the smallest reproduction you can manage. A repository or spec vault
that triggers it is worth more than a description of one.

Expect an acknowledgment within 7 days. Because this is a solo pre-1.0 project,
a fix timeline comes with the acknowledgment rather than being promised up
front. You'll be credited in the fix unless you'd rather not be.

## Threat model

SpecTrace is a **local-first developer tool**. It reads a repository you already
trust, writes artifacts under `.spectrace/`, and — only when you configure a
model — sends bounded candidate sets to a third-party API. That shapes what
counts as a vulnerability here.

**In scope, and genuinely interesting:**

- **Anything that widens what leaves the machine.** Bounded candidate sets
  (REQ-CORE-023) are the single gate every model payload passes through. A path
  that transmits source text not present in a retrieved candidate set, that
  bypasses the length budgets, or that escapes `auditTransmissionLog`'s
  accounting is a security bug, not just a correctness bug.
- **API key exposure.** The engine reads no environment variables by design; the
  key is injected by the client. A key reaching a log line, an artifact, a
  transmission log, or an error message is in scope.
- **Path traversal writing outside the vault or repository** via a crafted
  requirement file, config, or symbol ID.
- **Code execution from parsing.** Requirement frontmatter, `.spectrace/config.yaml`,
  index artifacts, and evaluation results are all parsed from disk; none of them
  should be able to execute anything.
- **Electron sandbox escapes in Studio** — renderer reaching Node or the
  filesystem outside the IPC surface declared in `apps/studio/src/shared/ipc.ts`.

**Out of scope:**

- Indexing a repository you don't trust. SpecTrace assumes the target repository
  is one you'd already open in your editor; it reads source but doesn't execute
  it, and hostile-repository hardening isn't a pre-1.0 goal.
- Denial of service via a deliberately enormous repository or spec vault.
- Vulnerabilities in third-party model APIs, or in what a model returns. Ranking
  output is treated as untrusted and is validated, but the provider's behavior
  isn't ours.
- Missing hardening on the Electron app's packaging and signing — the
  proof-of-concept shortcut list is known and tracked for R1.1.
- Dependency advisories with no demonstrated path through SpecTrace. Report them
  as regular issues.

## What SpecTrace sends over the network

By default: **nothing.** Lexical retrieval (Configuration A, the shipped
default) runs entirely locally and needs no key.

Semantic and hybrid retrieval embed through a configured provider, and ranking
calls a configured model. In both cases only bounded candidate sets leave the
machine, and `spectrace analyze --dry-run --transmission-log <file>` will show
you exactly what *would* be sent, without a network call, before you send it.
