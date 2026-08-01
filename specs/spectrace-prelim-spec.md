# SpecTrace Preliminary Work Specification and Runbook

**Status:** Draft for implementation  
**Project:** SpecTrace  
**Owner:** Brian Parker  
**Target:** CPSC 597 / 598 preliminary feasibility work  
**Source:** `Proposal_5.pdf`, July 2026

## 1. Purpose

This document defines the preliminary work needed to test the central assumption behind SpecTrace:

> A local retrieval stage can place the correct source-code symbol in a short candidate list often enough that a language model only needs to rank a bounded number of candidates.

The preliminary work is an experiment harness, not the complete SpecTrace product. It must produce reproducible evidence about:

- Symbol-level repository indexing
- Lexical candidate retrieval
- Retrieval quality at several cutoff values
- LLM-assisted ranking of a small candidate set
- Runtime, token usage, latency, and estimated API cost
- Behavior under controlled documentation and code drift
- Causes of missed or incorrect trace links

## 2. Definition of Done

The preliminary work is complete when:

1. A TypeScript repository not authored by the researcher is selected and frozen at a recorded commit.
2. Twelve requirements are written from documented behavior before inspecting the implementation.
3. The requirements are divided into three four-requirement difficulty groups.
4. Source symbols are extracted using the TypeScript Compiler API.
5. BM25F retrieval produces a ranked top-10 candidate list for every requirement.
6. Ground-truth links are established using the required two-pass labeling process.
7. Recall@1, Recall@3, Recall@5, Recall@10, Hit@k, and mean reciprocal rank are reported.
8. The top five candidates per requirement can be sent to a configured LLM for structured classification.
9. LLM responses, tokens, latency, model identity, prompt version, and estimated cost are recorded.
10. Four controlled drift scenarios are stored as isolated commits and evaluated.
11. Every missed link is assigned an error category.
12. A reproducible results package and preliminary findings report are generated.

Measurements do not need to be favorable. A weak retrieval result with a clear error analysis satisfies the experiment better than a favorable but irreproducible result.

## 3. Scope

### 3.1 Required

- Node.js and TypeScript
- TypeScript and JavaScript source repositories
- TypeScript Compiler API for source analysis
- File, class, method, function, and exported-module symbols
- Markdown requirements with stable identifiers
- Local field-weighted BM25 (BM25F) retrieval
- Structured LLM ranking of a maximum of five candidates per requirement
- Human-reviewed ground truth
- Git-based experiment versioning
- Four controlled drift scenarios
- Machine-readable results

### 3.2 Optional during preliminary work

- Embedding-based retrieval
- Hybrid lexical and semantic retrieval
- An interactive human-review interface
- Continuous integration integration
- A second programming language

Optional work must not delay completion of the lexical baseline and controlled experiment.

### 3.3 Out of scope

- Automatic modification of source code
- Formal verification
- Runtime behavior tracing
- Binary or minified-code analysis
- Enterprise requirements-platform integration
- Sending an entire repository to an LLM
- Claiming that a proposed link is correct without human review
- Production-ready package distribution

## 4. Research Questions for the Preliminary Experiment

### PQ1. Candidate retrieval

How often does lexical retrieval place a correct source symbol in the top 1, 3, 5, and 10 candidates?

### PQ2. Requirement difficulty

How does retrieval quality change as lexical overlap between a requirement and its implementation decreases?

### PQ3. LLM ranking

When a correct symbol is present in the top five candidates, can an LLM rank or classify it accurately?

### PQ4. Feasibility and cost

What runtime, token usage, latency, and estimated API cost are required per requirement?

### PQ5. Controlled drift

Can the harness identify renamed symbols, deleted symbols, changed requirements, and contradictory code changes?

## 5. Experiment Repository

### 5.1 Selection criteria

Select one repository that:

- Is primarily TypeScript
- Was not authored by the researcher
- Has a clear license permitting research use
- Has documentation describing at least twelve observable behaviors
- Is small enough for manual symbol-level labeling
- Contains functions, methods, or classes that implement documented behaviors
- Builds and tests at the selected commit
- Does not require unavailable private services

### 5.2 Freeze procedure

Record the following before writing requirements:

```yaml
repository:
  url: https://example.com/owner/project
  commit: full-40-character-commit-sha
  branch: main
  license: license-name
  selected_at: 2026-00-00T00:00:00Z
  selection_reason: >
    Explanation of why the repository is suitable for the experiment.
```

Also record:

- Node.js version
- Package-manager version
- Operating system
- Installation command
- Build command
- Test command
- Build and test results at the frozen commit

Do not update the repository during the baseline experiment. Any later change must be recorded as a separate commit or scenario.

## 6. Requirement Dataset

### 6.1 Authoring protocol

1. Read public-facing documentation and examples.
2. Do not inspect implementation files yet.
3. Write twelve requirements describing documented behavior.
4. Give each requirement at least one verifiable acceptance criterion.
5. Freeze and hash the requirement files.
6. Only then inspect the implementation to establish ground truth.

This ordering limits the risk of copying source-code vocabulary into the requirements.

### 6.2 Difficulty strata

Create exactly four requirements in each group:

| Group | Description | Allowed `difficulty` value |
|---|---|---|
| High overlap | Requirement terminology directly overlaps source identifiers or documentation comments. | `high-overlap` |
| Partial overlap | Some terms overlap, but the implementation uses additional or different vocabulary. | `partial-overlap` |
| Domain vocabulary | The requirement uses domain language that is mostly absent from source identifiers. | `domain-vocabulary` |

The `difficulty` value is an experiment label, not a normal SpecTrace requirement field. The requirement loader must reject any `difficulty` value outside this set of three.

### 6.3 Requirement format

Store each requirement as a separate Markdown file:

```markdown
---
id: REQ-AUTH-001
title: Expire inactive sessions
status: proposed
priority: high
difficulty: partial-overlap
source_documentation:
  - docs/authentication.md
acceptance_criteria:
  - An authenticated session expires after the configured inactivity period.
  - Activity before the timeout resets the inactivity period.
---

# Expire inactive sessions

## Statement

The system shall expire an authenticated session after the configured period of
inactivity.

## Rationale

Inactive sessions must not remain valid indefinitely.

## Notes

Written from documented behavior before implementation inspection.
```

### 6.4 Validation rules

The requirement loader must reject:

- Missing or duplicate IDs
- Missing titles
- Missing statements
- Missing acceptance criteria
- Invalid difficulty values (anything other than `high-overlap`, `partial-overlap`, or `domain-vocabulary`)
- Empty Markdown files
- Unreadable YAML frontmatter

## 7. Ground-Truth Protocol

Ground truth must be created at symbol granularity.

### 7.1 Pass one: independent labeling

For each requirement:

1. Inspect the repository without viewing retrieval output.
2. Identify every source symbol that directly implements or materially supports the requirement.
3. Record the symbol identifier and a short justification.
4. Mark uncertain links explicitly.

### 7.2 Pass two: candidate-assisted review

After pass-one labels are frozen:

1. Review the top ten BM25F candidates for each requirement.
2. Add any valid links missed during pass one.
3. Mark every new link as `candidate_review`.
4. Explain why it was missed initially.

Pass-two additions must never be silently merged into the independent labels. They are a threat-to-validity measurement.

### 7.3 Ground-truth file

```json
{
  "repositoryCommit": "full-commit-sha",
  "createdAt": "2026-00-00T00:00:00Z",
  "labeler": "Brian Parker",
  "links": [
    {
      "requirementId": "REQ-AUTH-001",
      "symbolId": "ts:src/auth/session.ts#expireInactiveSession:function",
      "labelPass": "independent",
      "relationship": "implements",
      "confidence": "confirmed",
      "rationale": "The function invalidates sessions after the configured inactivity interval."
    }
  ]
}
```

Allowed `labelPass` values:

- `independent`
- `candidate_review`

Allowed `relationship` values:

- `implements`
- `supports`

Allowed `confidence` values:

- `confirmed`
- `uncertain`

A link marked `uncertain` during pass one (§7.1 step 4) must still be recorded with its best-guess `relationship`; do not omit uncertain links from the file.

Only `implements` links count as primary relevant results. Report `supports` links separately.

## 8. Repository Indexer

### 8.1 Required source units

Extract:

- Source file
- Exported module
- Class
- Interface, when it is used as a parameter type or return type of an extracted function, method, or constructor, or when it is exported and referenced by name in the source documentation for a requirement
- Function
- Method
- Constructor, when it declares parameters or has a documentation comment

### 8.2 Required fields

```ts
interface CodeSymbol {
  symbolId: string;
  kind: "file" | "module" | "class" | "interface" | "function" | "method" | "constructor";
  name: string;
  qualifiedName: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  documentation: string;
  normalizedSource: string;
  exported: boolean;
  repositoryCommit: string;
}
```

### 8.3 Symbol identifier

Use a deterministic identifier:

```text
ts:<repository-relative-path>#<qualified-name>:<kind>
```

Example:

```text
ts:src/auth/session.ts#SessionManager.expireInactive:method
```

When a qualified name resolves to more than one declaration in the same file — most commonly TypeScript function or method overloads — append a short deterministic hash of the normalized parameter-type list and return type to disambiguate:

```text
ts:<repository-relative-path>#<qualified-name>:<kind>:<param-signature-hash>
```

Example:

```text
ts:src/auth/session.ts#SessionManager.expireInactive:method:9f2ac1b4
```

Do not add the disambiguating suffix to symbols that are not part of an overload group; unique symbols keep the shorter form.

Requirements:

- Use forward slashes in paths.
- Do not include absolute machine paths.
- Do not use line numbers as identity.
- Compute the parameter-signature hash from normalized type text, not from source formatting, so it is stable across reindexing.
- Produce the same ID for repeated indexing of the same commit.
- Detect duplicate IDs, after applying the overload disambiguation rule, and fail the run.

### 8.4 Exclusions

Exclude:

- `.git`
- `node_modules`
- Build-output directories
- Coverage output
- Generated files
- Vendored code
- Minified files
- Files ignored by Git
- Additional paths specified by experiment configuration

### 8.5 Index acceptance criteria

- Repeated indexing of the same commit produces byte-equivalent normalized records.
- Every record resolves to an existing source range.
- No ignored or generated file appears in the index.
- All required symbol kinds have unit-test coverage.

## 9. Lexical Retrieval

### 9.1 Indexed text

Build the lexical document for each symbol from:

- Symbol name
- Qualified name
- Signature
- Documentation comment
- Relative path
- Normalized source text

### 9.2 Normalization

At minimum:

- Lowercase text
- Split camelCase
- Split PascalCase
- Split snake_case
- Split kebab-case
- Split file paths
- Preserve numbers when meaningful
- Remove punctuation
- Collapse repeated whitespace

Do not remove domain terms merely because they are uncommon.

### 9.3 BM25F configuration

Because each field carries an independent weight, implement field-weighted BM25 (BM25F) rather than plain single-field BM25. The initial configuration should be explicit and versioned. A reasonable starting field weighting is:

| Field | Starting weight |
|---|---:|
| Symbol and qualified name | 4 |
| Signature | 3 |
| Documentation comment | 2 |
| Relative path | 2 |
| Normalized source | 1 |

These values are starting assumptions, not final defaults. Record changes as new configurations rather than overwriting earlier results.

### 9.4 Retrieval output

```json
{
  "requirementId": "REQ-AUTH-001",
  "configurationId": "bm25-v1",
  "repositoryCommit": "full-commit-sha",
  "candidates": [
    {
      "rank": 1,
      "symbolId": "ts:src/auth/session.ts#expireInactiveSession:function",
      "score": 12.4831
    }
  ]
}
```

Save at least the top ten candidates for every requirement.

## 10. Retrieval Metrics

### 10.1 Recall@k

For requirement \(q\):

```text
Recall@k(q) =
  relevant ground-truth symbols found in the top k
  ------------------------------------------------
  total relevant ground-truth symbols for q
```

Report macro-average Recall@k across requirements for:

- k = 1
- k = 3
- k = 5
- k = 10

### 10.2 Hit@k

Report the percentage of requirements for which at least one correct symbol appears in the top `k`.

### 10.3 Mean reciprocal rank

For each requirement, calculate the reciprocal rank of the first correct candidate. Use zero when no correct candidate appears in the retained list.

### 10.4 Required breakdowns

Report all retrieval metrics:

- Overall
- High lexical overlap
- Partial lexical overlap
- Domain vocabulary
- Independent ground truth only
- Independent plus candidate-review ground truth

## 11. LLM Ranking Stage

### 11.1 Input boundary

Each request may contain only:

- One requirement
- Its acceptance criteria
- The top five retrieved candidates
- Candidate signatures, documentation, and bounded source excerpts
- A versioned prompt

The request must not contain the full repository.

### 11.2 Required structured response

```json
{
  "requirementId": "REQ-AUTH-001",
  "promptVersion": "rank-v1",
  "candidates": [
    {
      "symbolId": "ts:src/auth/session.ts#expireInactiveSession:function",
      "classification": "implements",
      "confidence": 0.91,
      "rationale": "The function enforces the inactivity timeout described by the requirement.",
      "evidence": [
        {
          "relativePath": "src/auth/session.ts",
          "startLine": 80,
          "endLine": 104
        }
      ]
    }
  ]
}
```

Allowed classifications:

- `implements`
- `supports`
- `related`
- `not_related`
- `insufficient_evidence`

### 11.3 Validation

Reject and record responses with:

- Invalid JSON
- Missing candidates
- Unknown symbol IDs
- Confidence outside 0.0 to 1.0
- Unsupported classifications
- Missing rationales
- Evidence outside the supplied source range

Malformed responses count as experiment failures and must not be silently retried without recording the failure.

### 11.3.1 Scoring against ground truth

Because the LLM classification set is broader than the ground-truth `relationship` set (§7.3), use this mapping when scoring PQ3 accuracy:

| Ground truth for this requirement/symbol pair | Correct LLM classification | Treatment of other classifications |
|---|---|---|
| `implements` | `implements` | Any other classification is a miss. |
| `supports` | `supports` | `implements` is a miss (over-claim); `related` is recorded as a partial match, not a correct match. |
| No link in ground truth | `not_related` or `insufficient_evidence` | `implements`, `supports`, or `related` is a false positive. |

Report exact matches, partial matches (`related` against a `supports` link), and false positives as separate figures. Do not collapse `related` into either correct or incorrect without stating the rule used.

### 11.4 Usage record

Record for every call:

```json
{
  "model": "provider-model-snapshot",
  "promptVersion": "rank-v1",
  "requirementId": "REQ-AUTH-001",
  "inputTokens": 0,
  "outputTokens": 0,
  "latencyMs": 0,
  "estimatedCostUsd": 0.0,
  "attempt": 1,
  "responseValid": true,
  "timestamp": "2026-00-00T00:00:00Z"
}
```

## 12. Human Review Record

An LLM proposal is not an accepted trace link.

```json
{
  "requirementId": "REQ-AUTH-001",
  "proposedSymbolId": "ts:src/auth/session.ts#expireInactiveSession:function",
  "decision": "accept",
  "redirectedSymbolId": null,
  "reviewer": "Brian Parker",
  "reviewedAt": "2026-00-00T00:00:00Z",
  "repositoryCommit": "full-commit-sha",
  "notes": "Implementation directly enforces the acceptance criterion."
}
```

Allowed decisions:

- `accept`
- `reject`
- `redirect`

Retain rejected and redirected proposals for analysis.

## 13. Controlled Drift Scenarios

Apply every scenario as an isolated commit derived from the same frozen baseline. Do not stack the scenarios.

| ID | Change | Expected behavior |
|---|---|---|
| D1 | Rename a linked function | Original symbol fails to resolve and is reported as a possible rename. |
| D2 | Delete a linked function | Original symbol fails to resolve and is reported as deleted. |
| D3 | Reword a requirement while leaving code unchanged | The affected link is re-evaluated and possible semantic drift is reported. |
| D4 | Invert a condition in linked code | The affected link is re-evaluated and a contradiction is reported with a rationale. |

Scenario D3 modifies requirement text, not source code. Do not edit the frozen requirement file in `experiment/requirements/` — that would violate the freeze-and-hash protocol in §6.1. Instead, copy the target requirement into `experiment/scenarios/D3-requirement-change/requirements/`, reword it there, and hash the copy independently. The scenario record must reference both the original requirement hash and the reworded requirement hash.

Optional after the required four:

| ID | Change | Expected behavior |
|---|---|---|
| D5 | Add a requirement with no implementation | Requirement is reported as unimplemented. |

For each scenario, record:

- Baseline commit
- Scenario commit
- Files changed
- Symbols changed
- Requirements affected
- Requirement hash before and after change (D3 only)
- Expected detection
- Actual detection
- Runtime
- Tokens and cost
- Reviewer decision

Use a separate Git worktree or disposable clone for scenario execution. Never rewrite the frozen baseline.

## 14. Error Analysis

Assign every retrieval miss to one primary category:

- Vocabulary mismatch
- Requirement ambiguity
- Incorrect granularity
- Missing documentation
- Parser or indexer failure
- Identifier normalization failure
- BM25F ranking failure
- Ground-truth error
- Multiple valid implementations
- Generated or indirect implementation
- Other, with explanation

For each miss, record:

```json
{
  "requirementId": "REQ-AUTH-001",
  "expectedSymbolIds": [],
  "highestRelevantRank": null,
  "category": "vocabulary_mismatch",
  "explanation": "The requirement uses domain terminology not present in the symbol or source text.",
  "recommendedResponse": "Evaluate semantic retrieval."
}
```

The error analysis determines the next design step:

- Vocabulary mismatch may justify embeddings.
- Granularity problems may justify changing extracted code units.
- Ambiguous requirements may justify stricter authoring guidance.
- Parser failures require indexer corrections before interpreting retrieval quality.

## 15. Reproducibility Manifest

Every run must create an immutable run directory containing:

```text
runs/<run-id>/
  manifest.json
  requirements/
  index.jsonl
  retrieval.jsonl
  ground-truth.json
  metrics.json
  errors.jsonl
  prompts/
  llm-responses/
  usage.jsonl
  drift-results.jsonl
  report.md
```

Example manifest:

```json
{
  "runId": "2026-07-26T120000Z-bm25-v1",
  "repositoryUrl": "https://example.com/owner/project",
  "repositoryCommit": "full-commit-sha",
  "requirementsHash": "sha256-value",
  "groundTruthHash": "sha256-value",
  "nodeVersion": "recorded-version",
  "toolCommit": "spectrace-prelim-commit-sha",
  "configurationId": "bm25-v1",
  "model": null,
  "promptVersion": null,
  "startedAt": "2026-00-00T00:00:00Z",
  "completedAt": "2026-00-00T00:00:00Z"
}
```

## 16. Suggested Project Structure

```text
spectrace-prelim/
  package.json
  tsconfig.json
  README.md
  src/
    cli/
    config/
    requirements/
      parser.ts
      validator.ts
    indexer/
      typescript-indexer.ts
      symbol-id.ts
      exclusions.ts
    retrieval/
      tokenizer.ts
      bm25.ts
      rank.ts
    evaluation/
      ground-truth.ts
      retrieval-metrics.ts
      link-metrics.ts
      error-analysis.ts
    llm/
      client.ts
      prompt.ts
      response-schema.ts
      usage.ts
    drift/
      git-diff.ts
      symbol-resolution.ts
      scenario-runner.ts
    output/
      run-manifest.ts
      report.ts
  experiment/
    repository.yaml
    requirements/
    ground-truth/
    scenarios/
      D1-rename/
      D2-delete/
      D3-requirement-change/
      D4-code-contradiction/
  tests/
    fixtures/
    unit/
    integration/
  runs/
```

## 17. Minimum Command-Line Interface

The preliminary harness should support:

```text
spectrace-prelim requirements validate
spectrace-prelim index --repo <path> --commit <sha> --out <index>
spectrace-prelim retrieve --requirements <dir> --index <file> --top-k 10
spectrace-prelim evaluate retrieval --results <file> --ground-truth <file>
spectrace-prelim rank --results <file> --top-k 5 --model <model>
spectrace-prelim evaluate links --responses <dir> --ground-truth <file>
spectrace-prelim drift --base <sha> --scenario <sha>
spectrace-prelim report --run <run-id>
```

All commands must:

- Support `--config <file>`
- Produce structured JSON or JSON Lines
- Return a nonzero exit code for validation failures
- Avoid modifying source files
- Log the repository commit and configuration ID

## 18. Testing Requirements

### 18.1 Unit tests

- Requirement parsing and validation
- Identifier splitting
- Token normalization
- Stable symbol-ID generation
- TypeScript symbol extraction
- Exclusion rules
- BM25F scoring determinism
- Recall@k calculation
- Hit@k calculation
- Mean reciprocal rank calculation
- LLM-response schema validation
- Cost calculation
- Git change classification

### 18.2 Integration tests

- Index a small TypeScript fixture
- Retrieve a known symbol for a known requirement
- Generate deterministic top-10 output
- Reject duplicate requirement IDs
- Reject malformed LLM output
- Resolve an unchanged symbol across repeated runs
- Detect a deleted symbol
- Detect a renamed-symbol candidate

### 18.3 End-to-end test

Using a small committed fixture:

1. Parse requirements.
2. Build the index.
3. Retrieve candidates.
4. Evaluate retrieval.
5. Rank the top five candidates.
6. Record a human decision.
7. Apply one isolated drift scenario.
8. Generate a report.

## 19. Preliminary Report Template

The generated report should contain:

1. Repository and frozen commit
2. Requirement-writing protocol
3. Requirement difficulty distribution
4. Ground-truth method
5. Pass-two additions and validity implications
6. Index statistics
7. BM25F configuration
8. Recall@1, @3, @5, and @10
9. Hit@1, @3, @5, and @10
10. Mean reciprocal rank
11. Results by difficulty group
12. LLM ranking results
13. Token usage, latency, and estimated cost
14. Drift-scenario results
15. Error analysis
16. Threats to validity
17. Recommended next implementation step

Do not remove failed requirements, missed links, malformed responses, or unfavorable runs from the report.

## 20. Implementation Sequence

### Phase 1: Freeze inputs

- Select the repository.
- Record the commit and environment.
- Confirm that build and tests pass.
- Write and freeze twelve requirements.

### Phase 2: Build the indexer

- Implement exclusions.
- Extract required source units.
- Generate deterministic symbol IDs.
- Save normalized JSON Lines output.

### Phase 3: Implement lexical retrieval

- Implement identifier-aware tokenization.
- Implement BM25F.
- Produce top-10 results.
- Add deterministic tests.

### Phase 4: Establish ground truth

- Complete independent labeling.
- Freeze pass-one labels.
- Review top-ten candidates.
- Record pass-two additions separately.

### Phase 5: Evaluate retrieval

- Calculate all required metrics.
- Break results down by difficulty group.
- Classify every miss.

### Phase 6: Add LLM ranking

- Create a versioned prompt.
- Submit only the top five candidates.
- Validate structured responses.
- Record usage and cost.

### Phase 7: Execute drift scenarios

- Create four isolated commits.
- Record expected results before running detection.
- Compare actual and expected output.

### Phase 8: Report

- Generate the reproducibility manifest.
- Produce tables and findings.
- State limitations.
- Recommend whether the main project should add semantic retrieval, change symbol granularity, or strengthen requirement guidance.

## 21. Start Checklist

Use this checklist before writing the first implementation code:

- [ ] Create the preliminary-work repository or branch.
- [ ] Record the Node.js and TypeScript versions.
- [ ] Select the external TypeScript repository.
- [ ] Record its license and frozen commit.
- [ ] Confirm its installation, build, and tests.
- [ ] Create the twelve requirement files from documentation only.
- [ ] Assign four requirements to each difficulty group.
- [ ] Validate and hash the requirement set.
- [ ] Create the run-manifest schema.
- [ ] Create the symbol-record schema.
- [ ] Implement the TypeScript indexer.
- [ ] Add deterministic symbol-ID tests.
- [ ] Implement identifier-aware tokenization.
- [ ] Implement and test BM25F.
- [ ] Generate top-10 candidates.
- [ ] Complete pass-one ground-truth labeling.
- [ ] Freeze pass-one labels.
- [ ] Complete candidate-assisted pass two.
- [ ] Calculate retrieval metrics.
- [ ] Perform error analysis.
- [ ] Add top-five LLM ranking.
- [ ] Record tokens, latency, and cost.
- [ ] Create the four isolated drift commits.
- [ ] Run and score the scenarios.
- [ ] Generate the preliminary report.

## 22. Preliminary Work Acceptance Checklist

The preliminary work is ready to present when:

- [ ] All twelve requirements are valid and frozen.
- [ ] The repository commit is reproducible.
- [ ] The index is deterministic.
- [ ] Top-10 candidates exist for every requirement.
- [ ] Ground truth contains separate pass-one and pass-two labels.
- [ ] Retrieval metrics are reported overall and by difficulty.
- [ ] Every miss has an error category.
- [ ] Top-five LLM calls use structured responses.
- [ ] Every model call has usage and cost records.
- [ ] The full repository was never included in an LLM request.
- [ ] All four required drift scenarios were applied as isolated commits.
- [ ] Actual drift results are compared with expected results.
- [ ] Limitations and threats to validity are documented.
- [ ] Unfavorable and failed runs remain in the results package.

