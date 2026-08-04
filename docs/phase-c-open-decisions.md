# Phase C — open decisions for BP

Written 2026-08-04 by Claude Code. **Read this first next session.**

Phase C implementation is complete and on `main` (9 commits, `cb7dbf7`…`e6d21b6`).
Sweep is green: 364 tests, typecheck, `spec:index:check`, and `spectrace validate`
reports 55 requirements with 0 violations.

**The Phase C gate is not closed.** Everything below is yours to decide or verify;
none of it is blocked on more implementation.

---

## 1. Defect — the transmission log under-reports in semantic/hybrid mode

**This one is a bug, not a judgement call. Fix it regardless of how 2 and 3 land.**

`analyze --dry-run --transmission-log <file>` reports the bounded candidate payload
and says **nothing** about the fact that semantic mode already sent every symbol in
the repository to the embedding API.

NFR-CORE-005 requires that clients can reveal *exactly* what would be or was sent.
In Configuration A that holds. In B and C it does not.

**Action:** approve a fix that records embedding transmission in the same log —
count of texts, which model, and whether they came from cache or the network.
Roughly a half-day. Say the word and I'll do it.

---

## 2. Scope of REQ-CORE-023 — does "a model" mean the ranker only?

REQ-CORE-023 says:

> Only the requirement text and its top-k candidates shall ever be transmitted to a
> model; **no operation shall transmit repository content outside the candidate set.**

Its rationale: *"cost proportional to requirements, not repository size."*

Configuration B embeds **every symbol in the repository**. That is repository content
outside the candidate set, sent to a model, at a cost proportional to repository
size — the inverse of the stated rationale.

REQ-CORE-023 is currently marked `implemented`, so as written the vault contains a
contradiction.

**Two readings, pick one:**

- **(a) "A model" means the ranking model of SPEC-CORE-000 §6.** Defensible — the
  spec already separates §5 retrieval from §6 ranking. Requires amending
  REQ-CORE-023 to say so explicitly and to note Configuration B's corpus-wide
  transmission. Cheap, and probably what was always intended.
- **(b) "A model" means any model, including embeddings.** Then B and C need an
  informed-consent gate before they can run, and the locality claim in §1 needs
  qualifying.

**Action:** choose (a) or (b). I'll draft the amendment either way.

---

## 3. Default retrieval mode — A, B, or C?

Decide **after** 2, since the answer depends on it.

Overall figures on the frozen `hookable` corpus (n = 12, 4 per stratum):

| | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| A lexical `bm25f-v5` | .250 | .708 | .750 | .917 | .515 |
| B semantic `text-embedding-3-small` | .625 | .792 | **1.000** | 1.000 | .774 |
| C hybrid `rrf-v1` | .625 | .792 | .875 | 1.000 | **.794** |
| C hybrid `weighted-v1` | .583 | **.833** | .875 | 1.000 | .750 |

**Read these three things and little else:**

- **`retrieval.topK` defaults to 10, so R@10 is the operating point.** There the gap
  is **one requirement out of twelve** (A .917 vs B/C 1.000). The three-requirement
  gap exists only at k=5. Since the top-k feeds a ranker that re-orders anyway, MRR
  matters less than it appears.
- **Hybrid does not beat semantic.** At R@5, C .875 vs B 1.000 — RRF gives each list
  an equal vote, and merging in the weaker lexical list costs a requirement semantic
  alone retrieved.
- **n = 12.** One requirement = 0.083 overall. Only the lexical-vs-semantic gap is
  large enough to report as a finding.

**My recommendation:** keep **A** as the shipped default. One requirement in twelve
is a thin return for breaking locality, requiring an API key, and putting the corpus
through a third party. Report B as evidence that the retrieval-first bet clears its
bar — that is a separate claim from what ships as the default.

**Action:** if you want B, it's a one-line change to `.spectrace/config.yaml`
(`retrieval.mode: semantic`). Decision 2 should settle first.

---

## 4. Rule on the REQ-CLI-009 AC2 collision

`evaluate sweep` reaches the network in semantic/hybrid mode. AC2 says *"the command
requires no network access."*

The statement's clauses all scope to `evaluate retrieval`, and metric computation
itself stays network-free — as does `compare`, and any sweep restricted to
`--modes lexical`.

**Recommended:** scope AC2 explicitly to `evaluate retrieval` and name the two new
subcommands (`compare`, `sweep`) in the statement. I left the ACs unedited pending
this. Full write-up is in `specs/requirements/REQ-CLI-009.md` under
"Proposed amendment — awaiting BP".

---

## 5. Verify Studio by eye — gate criterion, needs a human

Nobody has run this. Build, typecheck, and 32 tests pass, but no human has seen it.

```powershell
pnpm --filter @spectrace/studio dev
```

Open `specs/` as the vault, then **paste an existing `id:` into a second file's
frontmatter**. Expect, within about half a second and *without saving*: a red
violation bar above the editor, and a red dot beside the other offending file in the
tree. That is the Phase C gate criterion.

Also worth poking: toggle **Live preview** off/on; edit and `Ctrl+S`, then `git diff`
to confirm the save is byte-clean.

If it fails with `Error: Electron uninstall`, the recovery command is in `CLAUDE.md`.

---

## 6. Look at the SVG figures

Geometry is asserted numerically; appearance is not. The Chrome extension was
declined, so no screenshot was taken.

- `runs/phase-c/recall-at-10.svg` — real data
- Regenerate any time with `evaluate compare --chart <file.svg>`

Check for label collisions and whether the three-configuration legend reads cleanly.

---

## Status of every REQ touched in Phase C

`implemented` — REQ-CORE-012, 021, 022, 023; REQ-CLI-003.
`partial` — REQ-CORE-011 (AC2 needs Phase D), REQ-CLI-004 (cost estimate needs
REQ-CORE-032), REQ-APP-001/002/003/004.

Every REQ-APP status is deliberately conservative. Each file's notes say exactly
which criteria hold and which do not. The gate's two criteria can be met with these
statuses — the gate asks for a report-ready table and a live duplicate flag, not for
the full requirements. **If you'd rather it wait on full `implemented`,** the missing
pieces are: external-change watcher, `[[` autocomplete, rename, create-from-template,
trace-link chips, and live-preview rendering for tables and fenced code.
