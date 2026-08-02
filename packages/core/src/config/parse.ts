/**
 * Parses `.spectrace/config.yaml` into a fully resolved {@link SpectraceConfig}
 * (REQ-CORE-004). Pure — see ./load.ts for the filesystem boundary.
 */
import { parse as parseYaml } from "yaml";
import { toPlainValue } from "../internal/plain-value.js";
import {
  CONFIG_FILE_RELATIVE_PATH,
  DEFAULT_CONFIG,
  RETRIEVAL_MODES,
  type ConfigLoadResult,
  type ConfigWarning,
  type RetrievalMode,
  type SpectraceConfig
} from "./types.js";

/** Key structure the engine recognizes; anything else earns an unknown-key warning. */
const KNOWN_KEYS: Record<string, readonly string[] | null> = {
  version: null,
  specPaths: null,
  exclude: null,
  retrieval: ["mode", "topK"],
  model: ["ranking", "embedding"],
  bands: ["suggest", "review"]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reports every key the engine does not recognize, by dotted path (AC2). */
function collectUnknownKeys(raw: Record<string, unknown>, warnings: ConfigWarning[]): void {
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in KNOWN_KEYS)) {
      warnings.push({
        rule: "unknown-key",
        key,
        message: `${CONFIG_FILE_RELATIVE_PATH}: unknown configuration key \`${key}\` — ignored.`
      });
      continue;
    }
    const nested = KNOWN_KEYS[key];
    if (!nested || !isRecord(value)) continue;
    for (const childKey of Object.keys(value)) {
      if (nested.includes(childKey)) continue;
      warnings.push({
        rule: "unknown-key",
        key: `${key}.${childKey}`,
        message: `${CONFIG_FILE_RELATIVE_PATH}: unknown configuration key \`${key}.${childKey}\` — ignored.`
      });
    }
  }
}

function invalid(warnings: ConfigWarning[], key: string, got: unknown, expected: string): void {
  warnings.push({
    rule: "invalid-value",
    key,
    message: `${CONFIG_FILE_RELATIVE_PATH}: \`${key}\` expected ${expected}, got ${JSON.stringify(got)} — using the default.`
  });
}

function readStringArray(
  raw: unknown,
  key: string,
  fallback: string[],
  warnings: ConfigWarning[]
): string[] {
  if (raw === undefined) return [...fallback];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
    invalid(warnings, key, raw, "an array of strings");
    return [...fallback];
  }
  return raw as string[];
}

function readNumber(
  raw: unknown,
  key: string,
  fallback: number,
  warnings: ConfigWarning[],
  predicate: (n: number) => boolean,
  expected: string
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !predicate(raw)) {
    invalid(warnings, key, raw, expected);
    return fallback;
  }
  return raw;
}

function readNullableString(raw: unknown, key: string, fallback: string | null, warnings: ConfigWarning[]): string | null {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    invalid(warnings, key, raw, "a non-empty string or null");
    return fallback;
  }
  return raw;
}

/**
 * Parses configuration text. Pass `null` when the file does not exist — that
 * yields defaults plus a `missing-config` warning rather than a failure
 * (AC1). Every returned value is a plain JSON-safe primitive, array, or
 * object (AC3).
 */
export function parseConfig(text: string | null): ConfigLoadResult {
  const warnings: ConfigWarning[] = [];

  if (text === null) {
    warnings.push({
      rule: "missing-config",
      message: `No ${CONFIG_FILE_RELATIVE_PATH} found — using built-in defaults. Run \`spectrace init\` to create one.`
    });
    return { config: structuredClone(DEFAULT_CONFIG), warnings, source: "defaults" };
  }

  let parsed: unknown;
  try {
    parsed = toPlainValue(parseYaml(text));
  } catch (error) {
    warnings.push({
      rule: "invalid-value",
      message: `${CONFIG_FILE_RELATIVE_PATH}: not valid YAML (${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }) — using built-in defaults.`
    });
    return { config: structuredClone(DEFAULT_CONFIG), warnings, source: "defaults" };
  }

  // An empty file parses to null; treat it as "present but says nothing".
  const raw = isRecord(parsed) ? parsed : {};
  if (parsed !== null && !isRecord(parsed)) {
    warnings.push({
      rule: "invalid-value",
      message: `${CONFIG_FILE_RELATIVE_PATH}: expected a mapping at the top level — using built-in defaults.`
    });
  }

  collectUnknownKeys(raw, warnings);

  const retrievalRaw = isRecord(raw["retrieval"]) ? raw["retrieval"] : {};
  const modelRaw = isRecord(raw["model"]) ? raw["model"] : {};
  const bandsRaw = isRecord(raw["bands"]) ? raw["bands"] : {};

  const modeRaw = retrievalRaw["mode"];
  let mode: RetrievalMode = DEFAULT_CONFIG.retrieval.mode;
  if (modeRaw !== undefined) {
    if (typeof modeRaw === "string" && (RETRIEVAL_MODES as readonly string[]).includes(modeRaw)) {
      mode = modeRaw as RetrievalMode;
    } else {
      invalid(warnings, "retrieval.mode", modeRaw, `one of ${RETRIEVAL_MODES.join(", ")}`);
    }
  }

  const config: SpectraceConfig = {
    version: readNumber(raw["version"], "version", DEFAULT_CONFIG.version, warnings, (n) => Number.isInteger(n) && n > 0, "a positive integer"),
    specPaths: readStringArray(raw["specPaths"], "specPaths", DEFAULT_CONFIG.specPaths, warnings),
    exclude: readStringArray(raw["exclude"], "exclude", DEFAULT_CONFIG.exclude, warnings),
    retrieval: {
      mode,
      topK: readNumber(
        retrievalRaw["topK"],
        "retrieval.topK",
        DEFAULT_CONFIG.retrieval.topK,
        warnings,
        (n) => Number.isInteger(n) && n > 0,
        "a positive integer"
      )
    },
    model: {
      ranking: readNullableString(modelRaw["ranking"], "model.ranking", DEFAULT_CONFIG.model.ranking, warnings),
      embedding: readNullableString(modelRaw["embedding"], "model.embedding", DEFAULT_CONFIG.model.embedding, warnings)
    },
    bands: {
      suggest: readNumber(
        bandsRaw["suggest"],
        "bands.suggest",
        DEFAULT_CONFIG.bands.suggest,
        warnings,
        (n) => n >= 0 && n <= 1,
        "a number in [0,1]"
      ),
      review: readNumber(
        bandsRaw["review"],
        "bands.review",
        DEFAULT_CONFIG.bands.review,
        warnings,
        (n) => n >= 0 && n <= 1,
        "a number in [0,1]"
      )
    }
  };

  if (config.bands.review > config.bands.suggest) {
    warnings.push({
      rule: "invalid-value",
      key: "bands",
      message: `${CONFIG_FILE_RELATIVE_PATH}: \`bands.review\` (${config.bands.review}) is above \`bands.suggest\` (${config.bands.suggest}), which leaves no review band.`
    });
  }

  return { config, warnings, source: "file" };
}
