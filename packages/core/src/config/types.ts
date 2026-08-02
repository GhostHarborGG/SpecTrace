/**
 * Per-repository configuration (REQ-CORE-004).
 *
 * Format decided 2026-08-02 (BP): YAML at `.spectrace/config.yaml`, carrying a
 * `version` field. Every field on {@link SpectraceConfig} is resolved — a
 * missing file or a missing key yields the documented default rather than
 * `undefined` — so consumers never branch on absence.
 *
 * All configuration is explicit: nothing here is read from the environment
 * (CLAUDE.md rule 2, and the REQ-CORE-004 statement).
 */

/** Retrieval configurations A / B / C (REQ-CORE-020…022). */
export type RetrievalMode = "lexical" | "semantic" | "hybrid";
export const RETRIEVAL_MODES = ["lexical", "semantic", "hybrid"] as const;

/** Confidence bands (REQ-CORE-041). */
export interface ConfidenceBands {
  /** At or above this, a proposal is presented as a suggested link. Default 0.75. */
  suggest: number;
  /** At or above this but below `suggest`, a proposal is queued for review. Default 0.50. */
  review: number;
}

export interface RetrievalConfig {
  mode: RetrievalMode;
  /** Candidate count k (REQ-CORE-020). */
  topK: number;
}

export interface ModelConfig {
  /** Ranking model identifier (REQ-CORE-030); null until Phase D configures one. */
  ranking: string | null;
  /** Embedding model identifier (REQ-CORE-021); null while Configuration A is the default. */
  embedding: string | null;
}

export interface SpectraceConfig {
  version: number;
  /** Vault directories holding requirement documents, repository-relative POSIX paths. */
  specPaths: string[];
  /** Extra gitignore-style exclusion patterns for indexing (REQ-CORE-011). */
  exclude: string[];
  retrieval: RetrievalConfig;
  model: ModelConfig;
  bands: ConfidenceBands;
}

/** Location of the configuration file, relative to the repository root. */
export const CONFIG_FILE_RELATIVE_PATH = ".spectrace/config.yaml";

/** Schema version of the configuration format itself. */
export const CONFIG_VERSION = 1;

/** Default bands per REQ-CORE-041; tuned values replace these post-evaluation. */
export const DEFAULT_CONFIDENCE_BANDS: ConfidenceBands = { suggest: 0.75, review: 0.5 };

/**
 * The configuration a repository gets with no config file at all. `specPaths`
 * follows the vault convention decided 2026-08-02 (BP): requirement documents
 * live one-per-file under `specs/requirements`.
 */
export const DEFAULT_CONFIG: SpectraceConfig = {
  version: CONFIG_VERSION,
  specPaths: ["specs/requirements"],
  exclude: [],
  retrieval: { mode: "lexical", topK: 10 },
  model: { ranking: null, embedding: null },
  bands: { ...DEFAULT_CONFIDENCE_BANDS }
};

/**
 * The canonical serialization of {@link DEFAULT_CONFIG}, comments and all —
 * what `spectrace init` writes (REQ-CLI-001) and what Studio's settings
 * surfaces scaffold. It lives here because REQ-CORE-004 owns the format; its
 * round-trip equality with DEFAULT_CONFIG is enforced by test.
 *
 * Comments are the reason YAML was chosen over JSON, so the default file
 * explains itself rather than being a bare value dump.
 */
export function renderDefaultConfig(): string {
  return `# SpecTrace configuration (REQ-CORE-004).
# Every key is optional — anything omitted falls back to the built-in default,
# and an unrecognized key is reported as a warning rather than an error.
version: ${CONFIG_VERSION}

# Directories holding requirement documents, relative to this repository.
specPaths:
  - specs/requirements

# Extra gitignore-style patterns excluded from indexing (REQ-CORE-011).
# Generated, vendored, and minified paths are already excluded by default.
exclude: []

retrieval:
  # lexical (Configuration A) | semantic (B) | hybrid (C)
  mode: lexical
  # Candidate count k retained per requirement.
  topK: 10

model:
  # Ranking model (REQ-CORE-030); null until ranking lands.
  ranking: null
  # Embedding model (REQ-CORE-021); unused in Configuration A.
  embedding: null

# Confidence bands (REQ-CORE-041). Provisional defaults — the capstone
# evaluation replaces them with tuned values.
bands:
  suggest: 0.75
  review: 0.5
`;
}

export type ConfigWarningRule = "missing-config" | "unknown-key" | "invalid-value";

/**
 * Configuration problems are always warnings, never failures: REQ-CORE-004
 * AC1 requires a missing config to produce defaults plus a warning rather than
 * an error, and the same posture applies to a key the engine does not
 * recognize or a value it cannot use.
 */
export interface ConfigWarning {
  rule: ConfigWarningRule;
  /** Dotted path of the offending key, e.g. `retrieval.topK`. Absent for missing-config. */
  key?: string;
  message: string;
}

export interface ConfigLoadResult {
  /** Always fully resolved; defaults fill anything absent or unusable. */
  config: SpectraceConfig;
  warnings: ConfigWarning[];
  /** Whether the values came from a file or entirely from defaults. */
  source: "file" | "defaults";
}
